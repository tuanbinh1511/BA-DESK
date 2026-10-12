import asyncio
import json
import os
import re
from datetime import datetime, timedelta
from telethon import TelegramClient, errors, utils
from telethon.tl.types import MessageEntityMentionName
from . import store
from .analyzer import TZ, analyze


class TelegramService:
    def __init__(self):
        self.client = None
        self.phone = None
        self.phone_hash = None
        self.status = {'running': False, 'progress': '', 'error': None, 'retryAt': None, 'partial': False}
        self.lock = asyncio.Lock()

    async def restore(self):
        path = store.DATA_DIR / 'telegram.json'
        if path.exists():
            config = json.loads(path.read_text())
            await self.configure(config['apiId'], config['apiHash'])
            if await self.authorized():
                await self.bind_identity()
            self.status['retryAt'] = store.get('meta', 'syncRetryAt')

    async def configure(self, api_id, api_hash):
        if self.status['running']:
            raise ValueError('Đang đồng bộ. Vui lòng chờ hoàn tất.')
        if self.client:
            await self.client.disconnect()
        store.DATA_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.client = TelegramClient(str(store.DATA_DIR / 'telegram'), api_id, api_hash)
        await self.client.connect()
        path = store.DATA_DIR / 'telegram.json'
        with open(path, 'w', opener=lambda name, flags: os.open(name, flags, 0o600)) as file:
            json.dump({'apiId': api_id, 'apiHash': api_hash}, file)
        session = store.DATA_DIR / 'telegram.session'
        if session.exists():
            os.chmod(session, 0o600)

    async def authorized(self):
        return bool(self.client and await self.client.is_user_authorized())

    async def send_code(self, api_id, api_hash, phone):
        await self.configure(api_id, api_hash)
        if await self.authorized():
            me = await self.client.get_me()
            if re.sub(r'\D', '', getattr(me, 'phone', '') or '') == re.sub(r'\D', '', phone):
                return {'step': 'connected'}
            await self.client.log_out()
            await self.configure(api_id, api_hash)
        sent = await self.client.send_code_request(phone)
        self.phone, self.phone_hash = phone, sent.phone_code_hash
        return {'step': 'code'}

    async def sign_in(self, code, password):
        if not self.client or not self.phone:
            raise ValueError('Hãy yêu cầu mã đăng nhập trước.')
        try:
            if password:
                await self.client.sign_in(password=password)
            else:
                await self.client.sign_in(phone=self.phone, code=code, phone_code_hash=self.phone_hash)
        except errors.SessionPasswordNeededError:
            return {'step': 'password'}
        self.phone, self.phone_hash = None, None
        return {'step': 'connected'}

    async def disconnect(self):
        if self.status['running']:
            raise ValueError('Đang đồng bộ. Vui lòng chờ hoàn tất.')
        if self.client:
            if await self.authorized():
                await self.client.log_out()
            else:
                await self.client.disconnect()
            self.client = None
        for path in store.DATA_DIR.glob('telegram*'):
            if path.is_file():
                path.unlink()

    async def bind_identity(self):
        from .bot_service import bot
        me = await self.client.get_me()
        async with bot.lock:
            changed = store.bind_account(me.id, user=utils.get_display_name(me), username=me.username or '')
            if changed:
                from .ai_service import ai
                ai.reset_account()
                self.status.update(error=None, retryAt=None, partial=False)
        return me

    async def full_history(self, chat_id, since=None):
        if self.lock.locked():
            raise ValueError('Đang đồng bộ. Chờ hoàn tất trước khi đọc toàn bộ hội thoại.')
        async with self.lock:
            retry = self.status.get('retryAt')
            if retry and datetime.fromisoformat(retry) > datetime.now(TZ):
                raise ValueError('Telegram đang giới hạn tốc độ. Chờ hết thời gian trước khi tải lịch sử.')
            if not await self.authorized():
                raise ValueError('Kết nối Telegram để tải toàn bộ lịch sử hội thoại.')
            group = store.get('group', chat_id, {})
            if group.get('ignored'):
                raise ValueError('Nhóm này đang được bỏ qua.')
            self.status.update(running=True, error=None, progress='Đang tải toàn bộ lịch sử hội thoại…')
            try:
                me = await self.bind_identity()
                dialog = None
                async for candidate in self.client.iter_dialogs():
                    if str(candidate.id) == chat_id:
                        dialog = candidate
                        break
                if dialog is None:
                    raise ValueError('Hội thoại không còn truy cập được.')
                batch, count, preceding = [], 0, 0
                async for message in self.client.iter_messages(dialog.entity, limit=None):
                    if since and message.date.astimezone(TZ) < datetime.fromisoformat(since):
                        preceding += 1
                        if preceding > 20:
                            break
                    record = await self.normalize_message(dialog, me, message)
                    if record:
                        batch.append(record)
                        count += 1
                    if len(batch) >= 500:
                        store.save_messages_and_tasks(batch, [], refresh_replies=False)
                        batch = []
                        self.status['progress'] = f'Đang đọc lịch sử · {count} tin'
                store.save_messages_and_tasks(batch, [], refresh_replies=False)
                store.save_messages_and_tasks([], [])
                store.put('history', chat_id, {'complete': since is None, 'coveredSince': since, 'count': count, 'updatedAt': datetime.now(TZ).isoformat()})
                self.status['progress'] = f'Đã đọc {count} tin trong phạm vi hội thoại'
                return count
            except errors.FloodWaitError as error:
                self.status['retryAt'] = (datetime.now(TZ) + timedelta(seconds=error.seconds)).isoformat()
                store.put('meta', 'syncRetryAt', self.status['retryAt'])
                raise ValueError(f'Telegram yêu cầu chờ {error.seconds} giây.') from None
            finally:
                self.status['running'] = False

    async def normalize_message(self, dialog, me, message):
        if not message or not (getattr(message, 'message', None) or getattr(message, 'media', None)):
            return None
        chat_id = str(dialog.id)
        sender = await message.get_sender()
        name = utils.get_display_name(sender) if sender else 'Telegram'
        text = message.message or '[Tin nhắn đính kèm]'
        mentioned = bool(me.username and re.search(r'@' + re.escape(me.username) + r'\b', text, re.I)) or any(isinstance(entity, MessageEntityMentionName) and entity.user_id == me.id for entity in message.entities or [])
        username = getattr(dialog.entity, 'username', None)
        if username:
            url = f'https://t.me/{username}' if dialog.is_user else f'https://t.me/{username}/{message.id}'
        elif not dialog.is_user and chat_id.startswith('-100'):
            url = f'https://t.me/c/{chat_id[4:]}/{message.id}'
        else:
            url = None
        kind = 'saved' if dialog.id == me.id else 'bot' if getattr(dialog.entity, 'bot', False) else 'private' if dialog.is_user else 'group' if dialog.is_group else 'channel'
        record = {'id': f'{chat_id}:{message.id}', 'chatId': chat_id, 'chat': dialog.name, 'sender': name, 'senderId': str(sender.id) if sender else None, 'text': text, 'date': message.date.isoformat(), 'outgoing': bool(message.out), 'replyTo': f'{chat_id}:{message.reply_to_msg_id}' if message.reply_to_msg_id else None, 'kind': kind, 'mentioned': mentioned, 'url': url}
        record['links'] = list(dict.fromkeys(entity.url for entity in message.entities or [] if isinstance(getattr(entity, 'url', None), str)))
        file = getattr(message, 'file', None)
        if file and file.name:
            record['attachment'] = {'name': file.name, 'mimeType': file.mime_type, 'size': file.size}
        return record

    async def sync_day(self, day):
        if self.lock.locked():
            return
        async with self.lock:
            self.status.update(running=True, error=None, retryAt=None, partial=False, progress='Đang đọc danh sách hội thoại…')
            store.remove('meta', 'syncRetryAt')
            try:
                if not await self.authorized():
                    raise ValueError('Chưa kết nối tài khoản Telegram.')
                me = await self.bind_identity()
                start = datetime.fromisoformat(day).replace(tzinfo=TZ)
                end = start + timedelta(days=1)
                now = datetime.now(TZ)
                # Read later messages too, so a reply on another day is not missed.
                until = max(end, now + timedelta(seconds=1))
                messages = []
                failed = []
                async for dialog in self.client.iter_dialogs():
                    if dialog.is_group:
                        stamp = getattr(dialog, 'date', None)
                        store.save_group(dialog.id, dialog.name, stamp.isoformat() if stamp else None)
                    if getattr(dialog, 'date', None) and dialog.date.astimezone(TZ) < start:
                        continue
                    self.status['progress'] = f'Đang đọc {dialog.name} · {len(messages)} tin'
                    chat_messages = {}
                    try:
                        async for message in self.client.iter_messages(dialog.entity, offset_date=until, limit=None):
                            if message.date.astimezone(TZ) < start:
                                break
                            if not getattr(message, 'message', None) and not getattr(message, 'media', None):
                                continue
                            record = await self.normalize_message(dialog, me, message)
                            if record:
                                chat_messages[record['id']] = record
                        attempted_parents = set()
                        while True:
                            missing = {item['replyTo'] for item in chat_messages.values() if item['replyTo'] and item['replyTo'] not in chat_messages} - attempted_parents
                            if not missing:
                                break
                            attempted_parents.update(missing)
                            parents = await self.client.get_messages(dialog.entity, ids=[int(key.split(':')[-1]) for key in missing])
                            for parent in parents:
                                record = await self.normalize_message(dialog, me, parent)
                                if record:
                                    chat_messages[record['id']] = record
                        messages.extend(chat_messages.values())
                    except (errors.ChannelPrivateError, errors.ChatAdminRequiredError):
                        failed.append(dialog.name)
                store.save_messages_and_tasks(messages, analyze(messages, day))
                store.put('meta', 'mode', 'telegram')
                store.put('meta', 'user', utils.get_display_name(me))
                store.put('meta', 'lastSync', datetime.now(TZ).isoformat())
                store.put('meta', 'lastSyncDay', day)
                settings = store.get('settings', 'main', {})
                settings.update(username=me.username or '', selfId=str(me.id))
                store.put('settings', 'main', settings)
                if failed:
                    self.status['error'] = 'Không có quyền đọc: ' + ', '.join(failed)
                    self.status['partial'] = True
                self.status['progress'] = f'Đã đồng bộ {len(messages)} tin nhắn'
            except errors.FloodWaitError as error:
                self.status['retryAt'] = (datetime.now(TZ) + timedelta(seconds=error.seconds)).isoformat()
                store.put('meta', 'syncRetryAt', self.status['retryAt'])
                self.status['error'] = f'Telegram giới hạn tốc độ. Thử lại sau {error.seconds} giây.'
            except Exception as error:
                self.status['error'] = str(error) if isinstance(error, ValueError) else 'Không thể đồng bộ Telegram. Kiểm tra kết nối và trạng thái đăng nhập.'
            finally:
                self.status['running'] = False


telegram = TelegramService()
