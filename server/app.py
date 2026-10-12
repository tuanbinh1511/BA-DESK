import asyncio
import os
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse
from uuid import uuid4
from fastapi import Depends, FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import AwareDatetime, BaseModel, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware
from telethon import errors
from . import store
from .analyzer import TZ, analyze, local_day, parse_export, report_text, group_tasks
from .telegram_service import telegram
from .bot_service import bot, BotError
from .ai_service import ai, MODELS, VERSION

DEFAULT_SETTINGS = {'morning': '08:30', 'evening': '17:00', 'enabled': True, 'autoSync': True, 'telegramNotifications': True, 'aiEnabled': True, 'aiModel': MODELS[0], 'timezone': 'Asia/Ho_Chi_Minh', 'username': '', 'selfId': ''}
BACKGROUND = set()


def launch(coroutine):
    task = asyncio.create_task(coroutine)
    BACKGROUND.add(task)
    task.add_done_callback(BACKGROUND.discard)
    return task


def settings():
    return DEFAULT_SETTINGS | store.get('settings', 'main', {})


def day_tasks(day, carry=False):
    return [task for task in store.watched_tasks() if local_day(task['createdAt']) == day or (task.get('completedAt') and local_day(task['completedAt']) == day) or (carry and local_day(task['createdAt']) <= day and (task['status'] != 'done' or task['replyStatus'] in ('unanswered', 'uncertain')))]


def generate_report(day, kind):
    key = f'{day}-{kind}' if kind != 'manual' else str(uuid4())
    existing = store.get('report', key)
    if existing:
        return existing
    tasks = [task for task in day_tasks(day) if local_day(task['createdAt']) == day]
    body = report_text(tasks, day)
    if telegram.status.get('partial') and telegram.status['error']:
        body += '\n\nLƯU Ý ĐỒNG BỘ\n' + telegram.status['error']
    now = datetime.now(TZ).isoformat()
    last_ai = store.get('meta', 'aiLast', {})
    analysis = last_ai if last_ai.get('day') == day and last_ai.get('version') == VERSION else None
    if ai.status.get('error'):
        body += '\n\nAI chưa hoàn tất: ' + ai.status['error'] + '\nBáo cáo dùng dữ liệu đã đồng bộ; kiểm tra các yêu cầu chưa chắc chắn.'
    snapshot = [{**person, 'tasks': [{key: task.get(key) for key in ('id', 'title', 'project', 'createdAt', 'dueAt', 'status', 'replyStatus', 'completedAt', 'priority')} | {'url': next((item.get('url') for item in task['context'] if item['id'] == task.get('sourceId')), None), 'summary': task.get('ai', {}).get('summary', '') if not task.get('ai', {}).get('stale') else '', 'nextAction': task.get('ai', {}).get('nextAction', '') if not task.get('ai', {}).get('stale') else ''} for task in person['tasks']]} for person in group_tasks(tasks)]
    report = {'id': key, 'date': day, 'kind': kind, 'body': body, 'createdAt': now, 'people': snapshot, 'analysis': analysis, 'analysisError': ai.status.get('error'), 'syncWarning': telegram.status['error'] if telegram.status.get('partial') else None}
    store.put('report', key, report)
    active = [task for task in tasks if task['status'] != 'done']
    waiting = [task for task in tasks if task['replyStatus'] in ('unanswered', 'uncertain')]
    store.put('notification', key, {'id': key, 'title': 'Bản tin buổi sáng' if kind == 'morning' else 'Rà soát cuối ngày' if kind == 'evening' else 'Báo cáo đã sẵn sàng', 'body': f'{len(active)} việc chưa xong · {len(waiting)} tin cần phản hồi hoặc kiểm tra.', 'createdAt': now, 'read': False})
    return report


async def analyzed_report(day, kind):
    revision = store.get('meta', 'accountRevision', 0)
    if settings()['aiEnabled']:
        try:
            await ai.analyze_day(day)
        except ValueError as error:
            ai.status['error'] = str(error)
    if revision != store.get('meta', 'accountRevision', 0):
        raise HTTPException(409, 'Tài khoản đã đổi. Hãy tạo lại báo cáo.')
    return generate_report(day, kind)


async def automatic_sync(now, config, connected):
    if not config['autoSync'] or not connected or telegram.status['running']:
        return
    next_sync = store.get('meta', 'nextAutoSync')
    retry = telegram.status.get('retryAt')
    if (next_sync and datetime.fromisoformat(next_sync) > now) or (retry and datetime.fromisoformat(retry) > now):
        return
    store.put('meta', 'nextAutoSync', (now + timedelta(minutes=5)).isoformat())
    day = now.date().isoformat()
    previous = store.get('meta', 'autoSyncDay')
    if previous and previous != day:
        # Finish yesterday after a midnight rollover or a restart before fetching today.
        await telegram.sync_day((now.date() - timedelta(days=1)).isoformat())
        if telegram.status.get('retryAt'):
            return
    await telegram.sync_day(day)
    if not telegram.status['error'] or telegram.status.get('partial'):
        store.put('meta', 'autoSyncDay', day)


async def scheduler_tick(now):
    config = settings()
    connected = await telegram.authorized()
    await automatic_sync(now, config, connected)
    if store.get('meta', 'mode') not in ('telegram', 'import', 'local'):
        return
    if config['enabled']:
        await scheduled_reminders(now, config, connected)
    if config['telegramNotifications']:
        await bot.flush(now)


async def scheduled_reminders(now, config, connected):
    day = now.date().isoformat()
    for kind, time in [('morning', config['morning']), ('evening', config['evening'])]:
        if now.strftime('%H:%M') >= time and not store.get('report', f'{day}-{kind}'):
            if telegram.status['running'] or ai.lock.locked():
                continue
            if connected:
                last_sync = store.get('meta', 'lastSync')
                fresh = last_sync and store.get('meta', 'lastSyncDay') == day and (now - datetime.fromisoformat(last_sync)).total_seconds() < 300
                next_sync = store.get('meta', 'nextAutoSync')
                retry = telegram.status.get('retryAt')
                waiting = (next_sync and datetime.fromisoformat(next_sync) > now) or (retry and datetime.fromisoformat(retry) > now)
                if not fresh and not waiting:
                    store.put('meta', 'nextAutoSync', (now + timedelta(minutes=5)).isoformat())
                    await telegram.sync_day(day)
                if telegram.status['error'] and not telegram.status.get('partial'):
                    key = f'{day}-sync-error-{kind}'
                    store.put('notification', key, {'id': key, 'title': 'Đồng bộ chưa hoàn tất', 'body': telegram.status['error'], 'createdAt': now.isoformat(), 'read': False})
                    continue
            await analyzed_report(day, kind)
    for task in store.watched_tasks():
        if task['status'] == 'done':
            continue
        due = task.get('snoozedUntil') or task.get('dueAt')
        if due and datetime.fromisoformat(due) <= now:
            key = f'due-{task["id"]}-{due}'
            if not store.get('notification', key):
                store.put('notification', key, {'id': key, 'chatId': task.get('chatId'), 'title': 'Đến giờ xử lý công việc', 'body': task['sender'] + ': ' + task['title'], 'createdAt': now.isoformat(), 'read': False})
    for event in store.get_all('event'):
        remaining = (datetime.fromisoformat(event['start']) - now).total_seconds()
        key = f'event-{event["id"]}-{event["start"]}'
        if 0 <= remaining <= 600 and not store.get('notification', key):
            store.put('notification', key, {'id': key, 'title': 'Cuộc hẹn sắp bắt đầu', 'body': event['title'], 'createdAt': now.isoformat(), 'read': False})


async def scheduler():
    while True:
        try:
            await scheduler_tick(datetime.now(TZ))
        except Exception:
            # Keep the scheduler alive without printing private message data.
            telegram.status['error'] = 'Bộ nhắc việc gặp lỗi. Kiểm tra cấu hình và khởi động lại máy chủ.'
        await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(_app):
    try:
        await telegram.restore()
    except Exception:
        telegram.status['error'] = 'Không thể khôi phục kết nối Telegram. Vui lòng kết nối lại.'
    await ai.check()
    ai.restore_result()
    worker = launch(scheduler())
    yield
    worker.cancel()
    for task in list(BACKGROUND):
        task.cancel()
    await asyncio.gather(*BACKGROUND, return_exceptions=True)
    if telegram.client:
        await telegram.client.disconnect()


async def account_context(request: Request):
    revision = request.headers.get('x-account-revision')
    if request.method not in ('GET', 'HEAD') and revision is not None and revision != str(store.get('meta', 'accountRevision', 0)):
        raise HTTPException(409, 'Tài khoản đã đổi. Tải lại dữ liệu trước khi thao tác.')


REMOTE_MODE = os.environ.get('BA_DESK_REMOTE_MODE', 'local').strip()
REMOTE_LOGIN = os.environ.get('BA_DESK_TAILSCALE_LOGIN', '').strip()
REMOTE_ADMINS = {value.strip() for value in os.environ.get('BA_DESK_TAILSCALE_ADMINS', '').split(',') if value.strip()} | {REMOTE_LOGIN}
REMOTE_VIEWERS = {value.strip() for value in os.environ.get('BA_DESK_TAILSCALE_VIEWERS', '').split(',') if value.strip()}
REMOTE_HOSTS = [value.strip() for value in os.environ.get('BA_DESK_ALLOWED_HOSTS', '').split(',') if value.strip()]
REMOTE_ORIGINS = [value.strip().rstrip('/') for value in os.environ.get('BA_DESK_ALLOWED_ORIGINS', '').split(',') if value.strip()]

if REMOTE_MODE not in ('local', 'tailscale'):
    raise RuntimeError('BA_DESK_REMOTE_MODE phải là local hoặc tailscale.')

if REMOTE_MODE == 'tailscale':
    if not REMOTE_LOGIN or not REMOTE_HOSTS or not REMOTE_ORIGINS:
        raise RuntimeError('Thiếu login, hosts hoặc origins cho chế độ Tailscale.')
    if any('*' in host or '/' in host or ':' in host for host in REMOTE_HOSTS):
        raise RuntimeError('Allowed hosts phải là hostname cụ thể, không chứa URL hoặc wildcard.')
    for origin in REMOTE_ORIGINS:
        parsed = urlparse(origin)
        local_origin = parsed.hostname in ('127.0.0.1', 'localhost')
        if (
            not parsed.hostname or '*' in origin or parsed.username is not None
            or parsed.password is not None or parsed.path or parsed.query or parsed.fragment
            or (parsed.scheme != 'https' and not (local_origin and parsed.scheme == 'http'))
        ):
            raise RuntimeError('Allowed origins phải là origin HTTPS cụ thể hoặc HTTP localhost.')

app = FastAPI(title='BA Desk', lifespan=lifespan, docs_url=None, redoc_url=None, dependencies=[Depends(account_context)])
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=['127.0.0.1', 'localhost', 'testserver'] + (REMOTE_HOSTS if REMOTE_MODE == 'tailscale' else []),
)


@app.middleware('http')
async def local_only(request: Request, call_next):
    origin = request.headers.get('origin')
    if REMOTE_MODE == 'tailscale':
        login = request.headers.get('tailscale-user-login')
        if login not in REMOTE_ADMINS and login not in REMOTE_VIEWERS:
            return JSONResponse(
                {'detail': 'Chỉ tài khoản Tailscale được cấu hình mới được truy cập.'},
                status_code=403,
                headers={'Cache-Control': 'no-store'},
            )
        if origin and origin not in REMOTE_ORIGINS:
            return JSONResponse({'detail': 'Origin không được phép.'}, status_code=403)
        if login not in REMOTE_ADMINS and request.method not in ('GET', 'HEAD'):
            return JSONResponse({'detail': 'Tài khoản này chỉ có quyền xem. Chỉ chủ sở hữu hoặc quản trị viên được thay đổi dữ liệu.'}, status_code=403, headers={'Cache-Control': 'no-store'})
    elif origin:
        parsed = urlparse(origin)
        if parsed.hostname not in ('localhost', '127.0.0.1') or parsed.scheme not in ('http', 'https'):
            return JSONResponse({'detail': 'Chỉ cho phép truy cập từ ứng dụng trên máy này.'}, status_code=403)
    try:
        content_length = int(request.headers.get('content-length', '0') or 0)
    except ValueError:
        return JSONResponse({'detail': 'Kích thước yêu cầu không hợp lệ.'}, status_code=400)
    if content_length < 0:
        return JSONResponse({'detail': 'Kích thước yêu cầu không hợp lệ.'}, status_code=400)
    if content_length > 12 * 1024 * 1024:
        return JSONResponse({'detail': 'File quá lớn. Export từng chat hoặc từng khoảng ngày (tối đa 12 MB).'}, status_code=413)
    revision = request.headers.get('x-account-revision')
    if request.method not in ('GET', 'HEAD') and revision is not None and revision != str(store.get('meta', 'accountRevision', 0)):
        return JSONResponse({'detail': 'Tài khoản đã đổi. Tải lại dữ liệu trước khi thao tác.'}, status_code=409)
    response = await call_next(request)
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


# CORS ở ngoài lớp kiểm tra danh tính để trả lời preflight và gắn headers cho lỗi.
if REMOTE_MODE == 'tailscale':
    app.add_middleware(
        CORSMiddleware,
        allow_origins=REMOTE_ORIGINS,
        allow_credentials=False,
        allow_methods=['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allow_headers=['Content-Type', 'X-Account-Revision'],
    )

def validate_day(value):
    try:
        parsed = date.fromisoformat(value)
    except ValueError as error:
        raise HTTPException(422, 'Ngày không hợp lệ.') from error
    if parsed > datetime.now(TZ).date():
        raise HTTPException(422, 'Chỉ có thể lấy tin nhắn đến hôm nay.')
    return value


@app.get('/api/state')
async def state(day: str | None = None):
    try:
        day = date.fromisoformat(day).isoformat() if day else datetime.now(TZ).date().isoformat()
    except ValueError as error:
        raise HTTPException(422, 'Ngày không hợp lệ.') from error
    connected = await telegram.authorized()
    return {'tasks': sorted(day_tasks(day, carry=True), key=lambda task: task['createdAt'], reverse=True), 'messages': sorted(store.day_messages(day), key=lambda message: datetime.fromisoformat(message['date']), reverse=True), 'events': sorted(store.get_all('event'), key=lambda event: event['start']), 'notifications': sorted(store.get_all('notification'), key=lambda notice: notice['createdAt'], reverse=True), 'reports': sorted(store.get_all('report'), key=lambda report: report['createdAt'], reverse=True), 'settings': settings(), 'accountId': store.get('meta', 'accountId'), 'accountRevision': store.get('meta', 'accountRevision', 0), 'groups': sorted(store.get_all('group'), key=lambda group: group['name'].casefold()), 'ai': ai.state(), 'bot': bot.state(), 'mode': store.get('meta', 'mode', 'telegram' if connected else 'demo'), 'connected': connected, 'user': store.get('meta', 'user', 'Bạn'), 'lastSync': store.get('meta', 'lastSync'), 'sync': telegram.status}


@app.get('/api/resources')
async def resources(query: str = Query(default='', max_length=300), kind: Literal['', 'file', 'folder', 'link'] = '', chat: str = Query(default='', max_length=80), sender: str = Query(default='', max_length=80), direction: Literal['', 'sent', 'received'] = '', start: str = '', end: str = '', offset: int = Query(default=0, ge=0), limit: int = Query(default=40, ge=1, le=100)):
    for value in (start, end):
        if value:
            validate_day(value)
    if start and end and start > end:
        raise HTTPException(422, 'Ngày bắt đầu phải trước ngày kết thúc.')
    return store.resources(query=query, kind=kind, chat=chat, sender=sender, direction=direction, start=start, end=end, offset=offset, limit=limit) | {'accountRevision': store.get('meta', 'accountRevision', 0)}


class Credentials(BaseModel):
    apiId: int = Field(gt=0)
    apiHash: str = Field(pattern=r'^[a-fA-F0-9]{32}$')
    phone: str = Field(pattern=r'^\+[0-9]{8,15}$')


@app.post('/api/workspace/start')
async def start_workspace():
    if store.get('meta', 'mode', 'demo') == 'demo':
        store.put('meta', 'mode', 'local')
    return {'ok': True}


class Login(BaseModel):
    code: str = Field(default='', max_length=20)
    password: str = Field(default='', max_length=256)


async def auth_action(coroutine):
    try:
        result = await coroutine
        if result['step'] == 'connected':
            await telegram.bind_identity()
            store.remove('meta', 'nextAutoSync')
        return result
    except errors.FloodWaitError as error:
        raise HTTPException(429, f'Telegram yêu cầu đợi {error.seconds} giây trước khi thử lại.') from error
    except (errors.PhoneCodeInvalidError, errors.PhoneCodeExpiredError):
        raise HTTPException(400, 'Mã đăng nhập không đúng hoặc đã hết hạn.')
    except errors.PasswordHashInvalidError:
        raise HTTPException(400, 'Mật khẩu xác minh hai bước không đúng.')
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except Exception:
        raise HTTPException(400, 'Không thể đăng nhập. Kiểm tra API ID, API Hash, số điện thoại và kết nối.')


@app.post('/api/telegram/connect')
async def connect(body: Credentials):
    return await auth_action(telegram.send_code(body.apiId, body.apiHash, body.phone))


@app.post('/api/telegram/login')
async def login(body: Login):
    return await auth_action(telegram.sign_in(body.code, body.password))


@app.post('/api/telegram/disconnect')
async def disconnect():
    try:
        async with bot.lock:
            await telegram.disconnect()
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    return {'ok': True}


class BotCredentials(BaseModel):
    token: str = Field(pattern=r'^\d{5,20}:[A-Za-z0-9_-]{30,100}$')


@app.post('/api/telegram/bot')
async def connect_bot(body: BotCredentials):
    if not await telegram.authorized():
        raise HTTPException(409, 'Kết nối tài khoản Telegram trước để xác định người nhận là bạn.')
    try:
        me = await telegram.client.get_me()
        return await bot.configure(body.token, me.id)
    except BotError as error:
        raise HTTPException(400, str(error)) from None
    except Exception:
        raise HTTPException(400, 'Không thể cấu hình bot. Kiểm tra token và thử lại.') from None


@app.delete('/api/telegram/bot')
async def disconnect_bot():
    await bot.disconnect()
    return {'ok': True}


@app.post('/api/telegram/bot/test')
async def test_bot():
    if not bot.config():
        raise HTTPException(409, 'Kết nối bot Telegram trước khi gửi thử.')
    key = str(uuid4())
    now = datetime.now(TZ)
    store.put('notification', key, {'id': key, 'title': 'Kết nối bot thành công', 'body': 'Bạn sẽ nhận báo cáo 08:30, rà soát 17:00 và lời nhắc công việc từ BA Desk theo thiết lập của mình.', 'createdAt': now.isoformat(), 'read': False})
    await bot.flush(now, only_id=key)
    if not store.get('botDelivery', key, {}).get('sentAt'):
        raise HTTPException(503, bot.state()['error'] or 'Chưa gửi được. Thông báo đang chờ và sẽ thử lại.')
    return {'ok': True}


class SyncRequest(BaseModel):
    day: str


@app.post('/api/sync')
async def sync(body: SyncRequest):
    validate_day(body.day)
    if not await telegram.authorized():
        raise HTTPException(409, 'Hãy kết nối Telegram trước khi đồng bộ.')
    if telegram.status['running']:
        raise HTTPException(409, 'Đang đồng bộ. Vui lòng chờ hoàn tất.')
    retry = telegram.status.get('retryAt')
    if retry and datetime.fromisoformat(retry) > datetime.now(TZ):
        raise HTTPException(429, telegram.status['error'] or 'Telegram yêu cầu chờ trước khi đồng bộ tiếp.')
    telegram.status.update(running=True, progress='Chuẩn bị đồng bộ…', error=None)
    launch(telegram.sync_day(body.day))
    return {'ok': True}


class ImportRequest(BaseModel):
    payload: dict
    selfId: str = Field(default='', max_length=30)
    username: str = Field(default='', max_length=64)
    day: str


@app.post('/api/import')
async def import_export(body: ImportRequest, request: Request):
    validate_day(body.day)
    try:
        messages, self_id = parse_export(body.payload, body.selfId, body.username)
    except (ValueError, TypeError, KeyError) as error:
        raise HTTPException(422, str(error)) from error
    if telegram.status['running']:
        raise HTTPException(409, 'Chờ đồng bộ hoàn tất trước khi nhập file.')
    if await telegram.authorized():
        me = await telegram.client.get_me()
        if str(me.id) != self_id:
            raise HTTPException(409, 'File thuộc tài khoản khác. Ngắt Telegram và đổi tài khoản trước khi nhập.')
    async with bot.lock:
        await account_context(request)
        if store.bind_account(self_id, mode='telegram' if await telegram.authorized() else 'import', username=body.username.lstrip('@')):
            ai.reset_account()
    for message in messages:
        if message['kind'] == 'group':
            store.save_group(message['chatId'], message['chat'], message['date'])
        store.put('history', message['chatId'], {'complete': False, 'source': 'export'})
    tasks = analyze(messages, body.day)
    store.save_messages_and_tasks(messages, tasks)
    store.put('meta', 'mode', 'import')
    store.put('meta', 'lastSync', datetime.now(TZ).isoformat())
    config = settings() | {'selfId': self_id, 'username': body.username.lstrip('@')}
    store.put('settings', 'main', config)
    return {'messages': len(messages), 'tasks': len(tasks)}


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    project: str = Field(default='Công việc cá nhân', max_length=150)
    description: str = Field(default='', max_length=5000)
    priority: Literal['high', 'medium', 'low'] = 'medium'
    dueAt: AwareDatetime | None = None


@app.post('/api/tasks')
async def create_task(body: TaskCreate):
    if not body.title.strip():
        raise HTTPException(422, 'Tên công việc không được để trống.')
    task = body.model_dump()
    task.update(id=str(uuid4()), title=body.title.strip(), dueAt=body.dueAt.astimezone(TZ).isoformat() if body.dueAt else None, sender='Bạn', kind='manual', status='todo', replyStatus='na', createdAt=datetime.now(TZ).isoformat(), sourceId=None, context=[], tags=[], snoozedUntil=None)
    store.put('task', task['id'], task)
    if store.get('meta', 'mode') is None:
        store.put('meta', 'mode', 'import')
    return task


class TaskPatch(BaseModel):
    status: Literal['todo', 'doing', 'done'] | None = None
    replyStatus: Literal['unanswered', 'replied', 'uncertain', 'na'] | None = None
    priority: Literal['high', 'medium', 'low'] | None = None
    snoozedUntil: AwareDatetime | None = None


@app.patch('/api/tasks/{key}')
async def patch_task(key: str, body: TaskPatch):
    task = store.get('task', key)
    if task is None:
        raise HTTPException(404, 'Không tìm thấy công việc.')
    patch = body.model_dump(exclude_unset=True)
    if any(value is None for field, value in patch.items() if field != 'snoozedUntil'):
        raise HTTPException(422, 'Trạng thái và độ ưu tiên không được để trống.')
    if 'snoozedUntil' in patch and patch['snoozedUntil']:
        patch['snoozedUntil'] = patch['snoozedUntil'].astimezone(TZ).isoformat()
    task.update(patch)
    if 'status' in patch:
        task['completedAt'] = datetime.now(TZ).isoformat() if patch['status'] == 'done' else None
    if 'replyStatus' in patch:
        task['replyOverride'] = True
    store.put('task', key, task)
    return task


@app.delete('/api/tasks/{key}')
async def delete_task(key: str):
    task = store.get('task', key)
    if not task or task['kind'] != 'manual':
        raise HTTPException(400, 'Chỉ có thể xóa công việc tạo thủ công.')
    store.remove('task', key)
    return {'ok': True}


class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    start: AwareDatetime
    end: AwareDatetime
    note: str = Field(default='', max_length=2000)
    color: Literal['green', 'orange', 'purple'] = 'green'


@app.post('/api/events')
async def create_event(body: EventCreate):
    if body.end <= body.start or not body.title.strip():
        raise HTTPException(422, 'Tên cuộc hẹn và khoảng thời gian phải hợp lệ.')
    event = body.model_dump() | {'id': str(uuid4()), 'title': body.title.strip(), 'start': body.start.astimezone(TZ).isoformat(), 'end': body.end.astimezone(TZ).isoformat()}
    store.put('event', event['id'], event)
    return event


@app.delete('/api/events/{key}')
async def delete_event(key: str):
    store.remove('event', key)
    return {'ok': True}


class ScheduleSettings(BaseModel):
    morning: str = Field(pattern=r'^(?:[01]\d|2[0-3]):[0-5]\d$')
    evening: str = Field(pattern=r'^(?:[01]\d|2[0-3]):[0-5]\d$')
    enabled: bool
    autoSync: bool = True
    telegramNotifications: bool = True
    aiEnabled: bool = True
    aiModel: Literal['gpt-6-luna', 'gpt-6-sol', 'gpt-6.1-sol'] = MODELS[0]


@app.put('/api/settings')
async def update_settings(body: ScheduleSettings):
    if body.morning >= body.evening:
        raise HTTPException(422, 'Lịch buổi sáng phải trước lịch cuối ngày.')
    config = settings() | body.model_dump(exclude_unset=True)
    store.put('settings', 'main', config)
    return config


@app.post('/api/notifications/read')
async def read_notifications():
    for notice in store.get_all('notification'):
        notice['read'] = True
        store.put('notification', notice['id'], notice)
    return {'ok': True}


@app.post('/api/reports')
async def create_report(body: SyncRequest):
    return await analyzed_report(validate_day(body.day), 'manual')


class GroupPatch(BaseModel):
    ignored: bool


@app.patch('/api/groups/{key}')
async def patch_group(key: str, body: GroupPatch):
    group = store.get('group', key)
    if not group:
        raise HTTPException(404, 'Không tìm thấy nhóm. Đồng bộ Telegram để cập nhật danh sách.')
    async with bot.lock:
        group['ignored'] = body.ignored
        store.put('group', key, group)
        if body.ignored:
            for notice in store.get_all('notification'):
                if notice.get('chatId') == key:
                    store.remove('notification', notice['id'])
                    store.remove('botDelivery', notice['id'])
    return group


class AnalysisRequest(SyncRequest):
    chatId: str | None = Field(default=None, max_length=80)


@app.post('/api/ai/analyze')
async def analyze_ai(body: AnalysisRequest):
    validate_day(body.day)
    await ai.check()
    if not ai.available:
        raise HTTPException(409, 'Chưa đăng nhập Codex bằng ChatGPT. Chạy codex login trên máy này.')
    if ai.lock.locked():
        raise HTTPException(409, 'AI đang phân tích. Chờ hoàn tất.')
    if body.chatId and store.get('group', body.chatId, {}).get('ignored'):
        raise HTTPException(409, 'Nhóm này đang được bỏ qua.')
    ai.status.update(running=True, error=None, progress='Chuẩn bị phân tích hội thoại…')
    async def work():
        try:
            await ai.analyze_day(body.day, body.chatId)
        except ValueError:
            pass
    launch(work())
    return {'ok': True}


DIST = Path(__file__).resolve().parent.parent / 'dist'


@app.get('/{path:path}')
async def frontend(path: str):
    if path.startswith('api/'):
        raise HTTPException(404, 'API không tồn tại.')
    candidate = (DIST / path).resolve()
    if candidate.is_relative_to(DIST) and candidate.is_file():
        return FileResponse(candidate)
    if (DIST / 'index.html').exists():
        return FileResponse(DIST / 'index.html')
    raise HTTPException(404, 'Chạy npm run dev để mở giao diện.')
