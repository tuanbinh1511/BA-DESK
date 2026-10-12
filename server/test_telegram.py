import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from telethon import errors
from telethon.tl.types import User
from server import store
from server.analyzer import TZ
from server.telegram_service import TelegramService


class TelegramHistoryTest(unittest.IsolatedAsyncioTestCase):
    async def test_configuration_saves_private_credentials(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(store, 'DATA_DIR', Path(directory)), patch('server.telegram_service.TelegramClient') as factory:
            factory.return_value.connect = AsyncMock()
            service = TelegramService()
            await service.configure(123, 'x' * 32)
            self.assertEqual((store.DATA_DIR / 'telegram.json').stat().st_mode & 0o777, 0o600)

    async def test_different_phone_does_not_reuse_old_logged_in_account(self):
        client = SimpleNamespace(get_me=AsyncMock(return_value=User(id=123, phone='84901234567')), log_out=AsyncMock(), send_code_request=AsyncMock(return_value=SimpleNamespace(phone_code_hash='test')))
        service = TelegramService()
        service.client = client
        service.configure = AsyncMock()
        service.authorized = AsyncMock(return_value=True)
        result = await service.send_code(123, 'x' * 32, '+84999999999')
        self.assertEqual(result['step'], 'code')
        client.log_out.assert_awaited_once()
        self.assertEqual(service.configure.await_count, 2)
        self.assertEqual(service.phone, '+84999999999')

    async def test_full_history_reads_every_message_and_records_coverage(self):
        me, other = User(id=123, first_name='Bình'), User(id=456, first_name='An')
        async def sender():
            return other
        dialog = SimpleNamespace(id=456, name='An', is_user=True, is_group=False, entity=other)
        class Client:
            async def is_user_authorized(self): return True
            async def get_me(self): return me
            async def iter_dialogs(self): yield dialog
            async def iter_messages(self, entity, **options):
                assert options['limit'] is None
                for index in range(4):
                    yield SimpleNamespace(id=index + 1, date=datetime.now(TZ) - timedelta(days=index), message='Bạn kiểm tra nhé?', media=None, out=False, entities=[], reply_to_msg_id=None, get_sender=sender)
        with tempfile.TemporaryDirectory() as directory, patch.object(store, 'DATA_DIR', Path(directory)):
            service = TelegramService()
            service.client = Client()
            self.assertEqual(await service.full_history('456'), 4)
            self.assertEqual(len(store.conversation('456')), 4)
            self.assertTrue(store.get('history', '456')['complete'])
            self.assertFalse(service.status['running'])

    async def test_report_context_reads_all_since_request_plus_twenty_older_messages(self):
        me, other = User(id=123, first_name='Bình'), User(id=456, first_name='An')
        since = (datetime.now(TZ) - timedelta(days=1)).isoformat()
        async def sender(): return other
        dialog = SimpleNamespace(id=456, name='An', is_user=True, is_group=False, entity=other)
        class Client:
            async def is_user_authorized(self): return True
            async def get_me(self): return me
            async def iter_dialogs(self): yield dialog
            async def iter_messages(self, entity, **options):
                for index in range(40):
                    yield SimpleNamespace(id=index+1, date=datetime.now(TZ) - timedelta(days=0 if index<2 else index), message='Bạn kiểm tra nhé?', media=None, out=False, entities=[], reply_to_msg_id=None, get_sender=sender)
        with tempfile.TemporaryDirectory() as directory, patch.object(store, 'DATA_DIR', Path(directory)):
            service = TelegramService()
            service.client = Client()
            self.assertEqual(await service.full_history('456', since=since), 22)
            coverage = store.get('history', '456')
            self.assertFalse(coverage['complete'])
            self.assertEqual(coverage['coveredSince'], since)
            self.assertEqual(len(store.conversation('456')), 22)

    async def test_all_dialogs_download_but_only_people_create_tasks(self):
        me = User(id=123, first_name='Bình', username='binh')
        other = User(id=456, first_name='An')
        async def sender():
            return other
        dialogs = [
            SimpleNamespace(id=456, name='An', is_user=True, is_group=False, entity=SimpleNamespace(username='an', bot=False)),
            SimpleNamespace(id=-10099, name='Team', is_user=False, is_group=True, entity=SimpleNamespace(username='team', bot=False)),
            SimpleNamespace(id=789, name='Bot', is_user=True, is_group=False, entity=SimpleNamespace(username='bot', bot=True)),
            SimpleNamespace(id=123, name='Saved', is_user=True, is_group=False, entity=me),
            SimpleNamespace(id=-10088, name='Channel', is_user=False, is_group=False, entity=SimpleNamespace(username='news', bot=False)),
            SimpleNamespace(id=900, name='Inactive', is_user=True, is_group=False, date=datetime.now(TZ) - timedelta(days=1), entity=SimpleNamespace(username='inactive', bot=False)),
        ]
        class Client:
            async def is_user_authorized(self):
                return True
            async def get_me(self):
                return me
            async def iter_dialogs(self):
                for dialog in dialogs:
                    yield dialog
            async def iter_messages(self, entity, **options):
                assert entity.username != 'inactive'
                yield SimpleNamespace(id=1, date=datetime.now(TZ), message='@binh review BRD nhé', media=None, out=False, entities=[], reply_to_msg_id=None, get_sender=sender)
        with tempfile.TemporaryDirectory() as directory, patch.object(store, 'DATA_DIR', Path(directory)):
            service = TelegramService()
            service.client = Client()
            await service.sync_day(datetime.now(TZ).date().isoformat())
            self.assertIsNone(service.status['error'])
            self.assertEqual({item['kind'] for item in store.get_all('message')}, {'group', 'private', 'channel', 'bot', 'saved'})
            self.assertEqual(len(store.get_all('task')), 2)
            channel = next(item for item in store.get_all('message') if item['kind'] == 'channel')
            self.assertEqual(channel['url'], 'https://t.me/news/1')

    async def test_rate_limit_during_dialog_fetch_sets_retry_time(self):
        class Client:
            async def is_user_authorized(self):
                return True
            async def get_me(self):
                return User(id=123, first_name='Bình')
            async def iter_dialogs(self):
                raise errors.FloodWaitError(None, 90)
                yield
        with tempfile.TemporaryDirectory() as directory, patch.object(store, 'DATA_DIR', Path(directory)):
            service = TelegramService()
            service.client = Client()
            await service.sync_day(datetime.now(TZ).date().isoformat())
            self.assertIn('90', service.status['error'])
            self.assertGreater(datetime.fromisoformat(service.status['retryAt']), datetime.now(TZ) + timedelta(seconds=85))
            self.assertEqual(store.get('meta', 'syncRetryAt'), service.status['retryAt'])
            self.assertFalse(service.status['running'])

    async def test_group_reply_to_old_message_keeps_parent_context(self):
        me = User(id=123, first_name='Bình', username='binh')
        other = User(id=456, first_name='An')
        day = datetime.now(TZ).date().isoformat()
        async def my_sender():
            return me
        async def other_sender():
            return other
        parent = SimpleNamespace(id=1, date=datetime.now(TZ) - timedelta(days=1), message='Đã gửi BRD', media=None, out=True, entities=[], reply_to_msg_id=None, get_sender=my_sender)
        incoming = SimpleNamespace(id=2, date=datetime.fromisoformat(day).replace(hour=9, tzinfo=TZ), message='Bạn cập nhật rule thanh toán giúp mình nhé', media=None, out=False, entities=[], reply_to_msg_id=1, get_sender=other_sender)
        dialog = SimpleNamespace(id=-10099, name='Product team', is_user=False, is_group=True, entity=SimpleNamespace(username='product_team', bot=False))
        fetched = []
        class Client:
            async def is_user_authorized(self):
                return True
            async def get_me(self):
                return me
            async def iter_dialogs(self):
                yield dialog
            async def iter_messages(self, entity, **options):
                self_options = options
                assert self_options['limit'] is None
                yield incoming
                yield parent
            async def get_messages(self, entity, ids):
                fetched.extend(ids)
                return [parent]
        with tempfile.TemporaryDirectory() as directory, patch.object(store, 'DATA_DIR', Path(directory)):
            service = TelegramService()
            service.client = Client()
            await service.sync_day(day)
            self.assertIsNone(service.status['error'])
            self.assertEqual(fetched, [1])
            tasks = store.get_all('task')
            self.assertEqual(len(tasks), 1)
            self.assertTrue(any(item['outgoing'] for item in tasks[0]['context']))
            self.assertEqual(len(store.day_messages(day)), 1)
