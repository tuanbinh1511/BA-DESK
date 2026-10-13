import asyncio
import json
import os
import re
import unicodedata
from html import escape
from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from . import store
from .analyzer import TZ, brief_text
from .library import safe_url


class BotError(ValueError):
    def __init__(self, message, retry_after=60):
        super().__init__(message)
        self.retry_after = retry_after


def bot_request(token, method, payload=None):
    request = Request(f'https://api.telegram.org/bot{token}/{method}', data=json.dumps(payload or {}).encode(), headers={'Content-Type': 'application/json'})
    try:
        with urlopen(request, timeout=15) as response:
            result = json.load(response)
    except HTTPError as error:
        try:
            with error:
                result = json.load(error)
        except (ValueError, OSError):
            raise BotError('Telegram không thể xử lý yêu cầu. Thử lại sau.') from None
    except (URLError, TimeoutError, OSError, ValueError):
        raise BotError('Không kết nối được bot Telegram. Kiểm tra mạng; ứng dụng sẽ thử lại.') from None
    if not result.get('ok'):
        code = result.get('error_code')
        if code == 401:
            raise BotError('Bot token không hợp lệ. Lấy lại token từ @BotFather.', 300)
        if code in (400, 403):
            raise BotError('Mở cuộc trò chuyện với bot bằng tài khoản đã kết nối, nhấn Start và bỏ chặn bot.', 300)
        retry = result.get('parameters', {}).get('retry_after', 60)
        raise BotError(f'Telegram giới hạn gửi. Thử lại sau {retry} giây.', retry)
    return result['result']


def message_parts(text):
    # 1,800 code points fit Telegram's 4,096 UTF-16 limit even with emoji.
    parts = []
    while text:
        end = min(len(text), 1800)
        if end < len(text):
            boundary = text.rfind('\n', 0, end)
            if boundary > end // 2:
                end = boundary + 1
        parts.append(text[:end])
        text = text[end:]
    return parts


def completion_reply(text):
    if '?' in text:
        return False
    text = unicodedata.normalize('NFKD', text.lower().replace('đ', 'd'))
    text = ''.join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    text = ' '.join(text.split())
    return bool(re.fullmatch(r'(?:(?:minh|toi|em|da|ok) )*(?:done|completed|finished|hoan thanh|xong)(?: (?:het|tat ca|roi|nhe|nha|a))*', text))


def formatted_parts(notice, report=None):
    if not report or 'people' not in report:
        text = f'BA Desk · {notice["title"]}\n\n' + (report['body'] if report else notice['body'])
        return [f'<b>{escape(part.split(chr(10), 1)[0])}</b>' + ('\n' + escape(part.split(chr(10), 1)[1]) if '\n' in part else '') if index == 0 else escape(part) for index, part in enumerate(message_parts(text))]
    tasks = [task for person in report['people'] for task in person['tasks']]
    active = [task for task in tasks if task['status'] != 'done']
    waiting = sum(task['replyStatus'] in ('unanswered', 'uncertain') for task in tasks)
    day = datetime.fromisoformat(report['date']).strftime('%d/%m/%Y')
    header = f'<b>BA Desk · {escape(notice["title"])}</b>\n<i>{day} · Tin trong ngày</i>\n\n<b>{waiting} cần phản hồi</b> · {len(active)} chưa xong · {len(tasks) - len(active)} hoàn thành'
    parts, part = [], header
    states = {'unanswered': 'Cần trả lời', 'uncertain': 'Kiểm tra phản hồi', 'replied': 'Đã trả lời', 'na': 'Tự tạo'}
    for person in report['people']:
        person_tasks = [task for task in person['tasks'] if task['status'] != 'done' or task['replyStatus'] in ('unanswered', 'uncertain')]
        if not person_tasks:
            continue
        heading = '\n\n<b>' + escape(brief_text(person['name'], 80)) + '</b>'
        first = True
        for task in person_tasks:
            title = escape(brief_text(task['title']))
            url = safe_url(task.get('url'))
            if url and url.startswith('https://t.me/'):
                title = f'<a href="{escape(url, quote=True)}">{title}</a>'
            at = datetime.fromisoformat(task['createdAt']).astimezone(TZ).strftime('%H:%M')
            line = f'\n• {at} {title}\n  <i>{states[task["replyStatus"]]}'
            if task['status'] == 'done':
                line += ' · Đã hoàn thành'
            if task.get('dueAt'):
                line += ' · Hạn ' + datetime.fromisoformat(task['dueAt']).astimezone(TZ).strftime('%d/%m %H:%M')
            line += '</i>'
            block = (heading if first else '') + line
            # Each independently valid HTML part stays below the limit even with emoji.
            if len(part) + len(block) > 1800:
                parts.append(part)
                part = f'<b>BA Desk · {day} (tiếp)</b>' + heading + line
            else:
                part += block
            first = False
    if not active and not waiting:
        part += '\n\n' + ('✓ Các yêu cầu trong ngày đã hoàn thành.' if tasks else 'Không có yêu cầu công việc trong ngày đang theo dõi.')
    warnings = [report.get('syncWarning'), report.get('analysisError')]
    for warning in filter(None, warnings):
        block = '\n\n<i>Lưu ý: ' + escape(brief_text(warning, 200)) + '</i>'
        if len(part) + len(block) > 1800:
            parts.append(part)
            part = '<b>BA Desk · Lưu ý</b>' + block
        else:
            part += block
    part += '\n\n<i>Chi tiết &amp; dẫn chứng: BA Desk → Báo cáo.</i>'
    parts.append(part)
    return parts


class BotService:
    def __init__(self):
        self.lock = asyncio.Lock()

    def config(self):
        path = store.DATA_DIR / 'telegram-bot.json'
        return json.loads(path.read_text()) if path.exists() else None

    def state(self):
        config = self.config()
        delivery = store.get('meta', 'botStatus', {}) if config else {}
        inbox = store.get('meta', 'botInbox', {}) if config else {}
        return {'configured': bool(config), 'username': config['username'] if config else '', 'error': delivery.get('error') or inbox.get('error'), 'lastSentAt': delivery.get('lastSentAt')}

    async def configure(self, token, user_id):
        async with self.lock:
            bot = await asyncio.to_thread(bot_request, token, 'getMe')
            chat = await asyncio.to_thread(bot_request, token, 'getChat', {'chat_id': user_id})
            if chat['type'] != 'private' or chat['id'] != user_id:
                raise BotError('Bot chỉ được gửi tới tài khoản Telegram đang kết nối.')
            config = {'token': token, 'chatId': user_id, 'username': bot['username'], 'enabledSince': datetime.now(TZ).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()}
            store.DATA_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
            path = store.DATA_DIR / 'telegram-bot.json'
            with open(path, 'w', opener=lambda name, flags: os.open(name, flags, 0o600)) as file:
                json.dump(config, file)
            os.chmod(path, 0o600)
            store.remove('meta', 'botStatus')
            store.remove('meta', 'botInbox')
            return self.state()

    async def disconnect(self):
        async with self.lock:
            (store.DATA_DIR / 'telegram-bot.json').unlink(missing_ok=True)
            store.remove('meta', 'botStatus')
            store.remove('meta', 'botInbox')

    def complete_delivery(self, receipt, now):
        keys = [key for key in receipt.get('taskIds', []) if store.get('task', key)]
        count = sum(store.get('task', key)['status'] != 'done' for key in keys)
        store.set_task_status(keys, 'done', now)
        return count

    async def receive(self, now, client=None):
        async with self.lock:
            config = self.config()
            if not config or str(config['chatId']) != str(store.get('meta', 'accountId')):
                return
            inbox = store.get('meta', 'botInbox', {})
            if inbox.get('retryAt') and datetime.fromisoformat(inbox['retryAt']) > now:
                return
            revision = store.get('meta', 'accountRevision', 0)
            deliveries = {
                message_id: receipt
                for receipt in store.get_all('botDelivery')
                if receipt.get('taskIds') and receipt.get('chatId') == config['chatId'] and receipt.get('botUsername') == config['username']
                for message_id in receipt.get('messageIds', [])
            }
            try:
                updates = await asyncio.to_thread(bot_request, config['token'], 'getUpdates', {
                    'offset': inbox.get('offset', 0), 'timeout': 0,
                    'allowed_updates': ['message', 'callback_query', 'message_reaction'],
                })
                if revision != store.get('meta', 'accountRevision', 0):
                    return
                for update in updates:
                    if revision != store.get('meta', 'accountRevision', 0):
                        return
                    callback = update.get('callback_query')
                    message = (callback or {}).get('message') or update.get('message', {})
                    reaction = update.get('message_reaction', {})
                    actor = (callback or {}).get('from') or message.get('from') or reaction.get('user', {})
                    chat = message.get('chat') or reaction.get('chat', {})
                    target = message.get('message_id') if callback else message.get('reply_to_message', {}).get('message_id') or reaction.get('message_id')
                    requested = callback and callback.get('data') == 'done' or completion_reply(message.get('text', '')) or bool(reaction.get('new_reaction'))
                    receipt = deliveries.get(target)
                    if requested and receipt and actor.get('id') == config['chatId'] and chat.get('id') == config['chatId']:
                        count = self.complete_delivery(receipt, now)
                        if callback:
                            await asyncio.to_thread(bot_request, config['token'], 'answerCallbackQuery', {
                                'callback_query_id': callback['id'], 'text': f'Đã hoàn thành {count} công việc.' if count else 'Các việc này đã hoàn thành.',
                            })
                        elif message:
                            await asyncio.to_thread(bot_request, config['token'], 'sendMessage', {
                                'chat_id': config['chatId'], 'text': f'Đã hoàn thành {count} công việc trong thông báo.' if count else 'Các việc trong thông báo đã hoàn thành.',
                                'reply_parameters': {'message_id': message['message_id']},
                            })
                    if revision != store.get('meta', 'accountRevision', 0):
                        return
                    inbox.update(offset=update['update_id'] + 1, error=None, retryAt=None)
                    store.put('meta', 'botInbox', inbox)
                if client and deliveries:
                    # Private-chat reactions are read through the connected account; Bot API requires chat admin rights.
                    pending = [key for key, receipt in deliveries.items() if key not in receipt.get('reactedMessageIds', []) and any(store.get('task', task_id, {}).get('status') not in (None, 'done') for task_id in receipt['taskIds'])]
                    for start in range(0, len(pending), 100):
                        messages = await client.get_messages(config['username'], ids=pending[start:start + 100])
                        if revision != store.get('meta', 'accountRevision', 0):
                            return
                        for message in messages:
                            if message and any(getattr(item, 'chosen_order', None) is not None for item in getattr(getattr(message, 'reactions', None), 'results', [])):
                                receipt = deliveries[message.id]
                                self.complete_delivery(receipt, now)
                                # shortcut: a reaction completes each notification once; use the button or a new notice after reopening work.
                                receipt.setdefault('reactedMessageIds', []).append(message.id)
                                store.put('botDelivery', receipt['noticeId'], receipt)
                store.put('meta', 'botInbox', inbox | {'error': None, 'retryAt': None})
            except BotError as error:
                if revision != store.get('meta', 'accountRevision', 0):
                    return
                store.put('meta', 'botInbox', inbox | {'error': str(error), 'retryAt': (now + timedelta(seconds=error.retry_after)).isoformat()})
            except Exception:
                if revision != store.get('meta', 'accountRevision', 0):
                    return
                store.put('meta', 'botInbox', inbox | {'error': 'Chưa đọc được phản hồi hoặc reaction. Kiểm tra kết nối Telegram.', 'retryAt': (now + timedelta(seconds=60)).isoformat()})

    async def flush(self, now, only_id=None):
        async with self.lock:
            config = self.config()
            if not config:
                return
            account = store.get('meta', 'accountId')
            if account is not None and str(config['chatId']) != str(account):
                return
            status = store.get('meta', 'botStatus', {})
            if status.get('retryAt') and datetime.fromisoformat(status['retryAt']) > now:
                return
            notices = sorted(store.get_all('notification'), key=lambda notice: notice['createdAt'])
            sent = 0
            for notice in notices:
                if notice.get('chatId') and store.get('group', notice['chatId'], {}).get('ignored'):
                    continue
                if only_id and notice['id'] != only_id:
                    continue
                if datetime.fromisoformat(notice['createdAt']) < datetime.fromisoformat(config['enabledSince']):
                    continue
                receipt = store.get('botDelivery', notice['id'])
                if receipt and receipt.get('sentAt'):
                    continue
                if not receipt:
                    report = store.get('report', notice['id'])
                    task_ids = notice.get('taskIds', []) if not report else [task['id'] for person in report.get('people', []) for task in person['tasks'] if task['status'] != 'done' or task['replyStatus'] in ('unanswered', 'uncertain')]
                    receipt = {'noticeId': notice['id'], 'parts': formatted_parts(notice, report), 'parseMode': 'HTML', 'sent': 0, 'sentAt': None, 'taskIds': task_ids, 'messageIds': [], 'chatId': config['chatId'], 'botUsername': config['username']}
                    if task_ids:
                        receipt['parts'] = [part + '\n\n<i>Reply “done” / “đã hoàn thành”, thả reaction hoặc bấm nút bên dưới để hoàn thành tất cả việc trong thông báo này.</i>' for part in receipt['parts']]
                while receipt['sent'] < len(receipt['parts']):
                    if sent >= 4:
                        return
                    try:
                        # shortcut: Bot API has no idempotency key; reconcile delivery receipts if duplicate sends become a problem.
                        payload = {'chat_id': config['chatId'], 'text': receipt['parts'][receipt['sent']], 'link_preview_options': {'is_disabled': True}}
                        if receipt.get('parseMode'):
                            payload['parse_mode'] = receipt['parseMode']
                        if receipt.get('taskIds'):
                            payload['reply_markup'] = {'inline_keyboard': [[{'text': 'Hoàn thành tất cả', 'callback_data': 'done'}]]}
                        result = await asyncio.to_thread(bot_request, config['token'], 'sendMessage', payload)
                        if result.get('message_id'):
                            receipt.setdefault('messageIds', []).append(result['message_id'])
                    except BotError as error:
                        store.put('botDelivery', notice['id'], receipt)
                        store.put('meta', 'botStatus', status | {'error': str(error), 'retryAt': (now + timedelta(seconds=error.retry_after)).isoformat()})
                        return
                    receipt['sent'] += 1
                    sent += 1
                    receipt['sentAt'] = now.isoformat() if receipt['sent'] == len(receipt['parts']) else None
                    store.put('botDelivery', notice['id'], receipt)
                    status = {'error': None, 'lastSentAt': now.isoformat(), 'retryAt': None}
                    store.put('meta', 'botStatus', status)
                    if only_id and receipt['sentAt']:
                        return
                    await asyncio.sleep(1)


bot = BotService()
