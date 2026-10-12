import io
import json
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch
from urllib.error import HTTPError, URLError
from server import store
from server.analyzer import TZ
from server.app import automatic_sync, scheduler_tick, telegram, settings
from server.bot_service import BotService, BotError, bot_request, message_parts


NOW = datetime(2026, 10, 11, 10, 0, tzinfo=TZ)
TOKEN = '123456789:' + 'x' * 35


class AutomationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.patch = patch.object(store, 'DATA_DIR', Path(self.directory.name))
        self.patch.start()
        self.status = patch.object(telegram, 'status', {'running': False, 'error': None, 'retryAt': None})
        self.status.start()

    def tearDown(self):
        self.status.stop()
        self.patch.stop()
        self.directory.cleanup()

    async def test_sync_every_five_minutes_and_after_restart(self):
        with patch.object(telegram, 'sync_day', new_callable=AsyncMock) as sync:
            await automatic_sync(NOW, settings(), True)
            await automatic_sync(NOW + timedelta(seconds=30), settings(), True)
            sync.assert_awaited_once_with('2026-10-11')
            await automatic_sync(NOW + timedelta(minutes=5), settings(), True)
            self.assertEqual(sync.await_count, 2)
            self.assertEqual(store.get('meta', 'autoSyncDay'), '2026-10-11')

    async def test_midnight_finishes_yesterday_then_fetches_today(self):
        store.put('meta', 'autoSyncDay', '2026-10-10')
        with patch.object(telegram, 'sync_day', new_callable=AsyncMock) as sync:
            await automatic_sync(NOW, settings(), True)
            self.assertEqual([call.args[0] for call in sync.await_args_list], ['2026-10-10', '2026-10-11'])

    async def test_sync_is_independent_of_report_schedule(self):
        store.put('meta', 'mode', 'telegram')
        store.put('settings', 'main', {'enabled': False})
        with patch.object(telegram, 'authorized', AsyncMock(return_value=True)), patch.object(telegram, 'sync_day', new_callable=AsyncMock) as sync:
            await scheduler_tick(NOW)
            sync.assert_awaited_once_with('2026-10-11')
            self.assertEqual(store.get_all('report'), [])

    async def test_sync_pauses_while_busy_disabled_or_rate_limited(self):
        with patch.object(telegram, 'sync_day', new_callable=AsyncMock) as sync:
            await automatic_sync(NOW, settings() | {'autoSync': False}, True)
            await automatic_sync(NOW, settings(), False)
            telegram.status['running'] = True
            await automatic_sync(NOW, settings(), True)
            telegram.status.update(running=False, retryAt=(NOW + timedelta(minutes=10)).isoformat())
            await automatic_sync(NOW, settings(), True)
            sync.assert_not_awaited()

    async def test_sync_failure_waits_before_retry_and_does_not_advance_day(self):
        async def fail(_day):
            telegram.status['error'] = 'Mất mạng'
        with patch.object(telegram, 'sync_day', AsyncMock(side_effect=fail)) as sync:
            await automatic_sync(NOW, settings(), True)
            await automatic_sync(NOW + timedelta(seconds=30), settings(), True)
            sync.assert_awaited_once()
            self.assertIsNone(store.get('meta', 'autoSyncDay'))

    async def test_partial_permission_error_still_allows_daily_reports(self):
        store.put('meta', 'mode', 'telegram')
        store.put('settings', 'main', {'autoSync': False})
        telegram.status.update(partial=True, error='Không có quyền đọc: Nhóm cũ')
        with patch.object(telegram, 'authorized', AsyncMock(return_value=True)), patch.object(telegram, 'sync_day', new_callable=AsyncMock):
            await scheduler_tick(NOW.replace(hour=17))
            reports = store.get_all('report')
            self.assertEqual(len(reports), 2)
            self.assertTrue(all('Không có quyền đọc: Nhóm cũ' in report['body'] for report in reports))

    async def test_midnight_rate_limit_defers_today_until_allowed(self):
        store.put('meta', 'autoSyncDay', '2026-10-10')
        async def limited(_day):
            telegram.status.update(error='Giới hạn', retryAt=(NOW + timedelta(minutes=10)).isoformat())
        with patch.object(telegram, 'sync_day', AsyncMock(side_effect=limited)) as sync:
            await automatic_sync(NOW, settings(), True)
            sync.assert_awaited_once_with('2026-10-10')
            self.assertEqual(store.get('meta', 'autoSyncDay'), '2026-10-10')


class BotDeliveryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.patch = patch.object(store, 'DATA_DIR', Path(self.directory.name))
        self.patch.start()
        self.bot = BotService()
        self.sleep = patch('server.bot_service.asyncio.sleep', new_callable=AsyncMock)
        self.sleep.start()
        config = {'token': TOKEN, 'chatId': 123, 'username': 'ba_desk_bot', 'enabledSince': NOW.isoformat()}
        (store.DATA_DIR / 'telegram-bot.json').write_text(json.dumps(config))

    def tearDown(self):
        self.sleep.stop()
        self.patch.stop()
        self.directory.cleanup()

    def notice(self, key='notice', body='Kiểm tra BRD', created=None):
        store.put('notification', key, {'id': key, 'title': 'Nhắc việc', 'body': body, 'createdAt': (created or NOW).isoformat(), 'read': False})

    async def test_send_full_report_to_verified_self_and_no_resend_after_restart(self):
        self.notice('report')
        store.put('report', 'report', {'body': 'Nội dung đầy đủ: 3 việc, 2 phản hồi'})
        with patch('server.bot_service.bot_request', return_value={'message_id': 1}) as request:
            await self.bot.flush(NOW)
            await BotService().flush(NOW + timedelta(seconds=30))
            request.assert_called_once()
            payload = request.call_args.args[2]
            self.assertEqual(payload['chat_id'], 123)
            self.assertEqual(payload['parse_mode'], 'HTML')
            self.assertIn('Nội dung đầy đủ', payload['text'])
            self.assertTrue(store.get('botDelivery', 'report')['sentAt'])
            self.assertNotIn(TOKEN, json.dumps(self.bot.state()))

    async def test_failed_chunk_resumes_without_resending_acknowledged_chunks(self):
        self.notice(body='📝' * 2500)
        with patch('server.bot_service.bot_request', side_effect=[{'message_id': 1}, BotError('Giới hạn gửi', 120)]) as request:
            await self.bot.flush(NOW)
            self.assertEqual(request.call_count, 2)
        receipt = store.get('botDelivery', 'notice')
        self.assertEqual(receipt['sent'], 1)
        with patch('server.bot_service.bot_request', return_value={'message_id': 2}) as request:
            await BotService().flush(NOW + timedelta(seconds=30))
            request.assert_not_called()
            await BotService().flush(NOW + timedelta(seconds=120))
            request.assert_called_once()
            self.assertEqual(request.call_args.args[2]['text'], receipt['parts'][1])
            self.assertIsNone(self.bot.state()['error'])

    async def test_backlog_before_connection_is_ignored_and_batch_is_bounded(self):
        self.notice('old', created=NOW - timedelta(days=1))
        for index in range(6):
            self.notice(str(index))
        with patch('server.bot_service.bot_request', return_value={}) as request:
            await self.bot.flush(NOW)
            self.assertEqual(request.call_count, 4)
            await self.bot.flush(NOW + timedelta(seconds=30))
            self.assertEqual(request.call_count, 6)
            self.assertIsNone(store.get('botDelivery', 'old'))

    async def test_configuration_validates_private_recipient_and_protects_token(self):
        with patch('server.bot_service.bot_request', side_effect=[{'username': 'my_ba_bot'}, {'id': 123, 'type': 'private'}]) as request:
            state = await self.bot.configure(TOKEN, 123)
            self.assertEqual(request.call_args.args[2]['chat_id'], 123)
            self.assertTrue(state['configured'])
            self.assertNotIn('token', state)
            self.assertEqual((store.DATA_DIR / 'telegram-bot.json').stat().st_mode & 0o777, 0o600)
        with patch('server.bot_service.bot_request', side_effect=[{'username': 'my_ba_bot'}, {'id': -999, 'type': 'group'}]):
            with self.assertRaises(BotError):
                await self.bot.configure(TOKEN, 123)
        self.assertEqual(self.bot.config()['chatId'], 123)
        await self.bot.disconnect()
        self.assertFalse(self.bot.state()['configured'])

    async def test_disabled_telegram_notifications_do_not_send(self):
        store.put('meta', 'mode', 'local')
        store.put('settings', 'main', {'enabled': False, 'telegramNotifications': False})
        self.notice()
        with patch('server.bot_service.bot_request') as request:
            await scheduler_tick(NOW)
            request.assert_not_called()

    def test_unicode_chunks_preserve_entire_report_and_fit_telegram_limit(self):
        text = ('📝 Việc cần kiểm tra\n' * 400) + 'x' * 5000
        parts = message_parts(text)
        self.assertEqual(''.join(parts), text)
        self.assertTrue(all(len(part.encode('utf-16-le')) // 2 < 4096 for part in parts))

    def test_transport_errors_hide_token_and_honor_retry_after(self):
        error = HTTPError('secret-url', 429, 'Limit', {}, io.BytesIO(b'{"ok":false,"error_code":429,"parameters":{"retry_after":87}}'))
        with patch('server.bot_service.urlopen', side_effect=error):
            with self.assertRaises(BotError) as caught:
                bot_request(TOKEN, 'sendMessage', {'chat_id': 123, 'text': 'test'})
            self.assertEqual(caught.exception.retry_after, 87)
            self.assertNotIn(TOKEN, str(caught.exception))
        with patch('server.bot_service.urlopen', side_effect=URLError('URL includes secret')):
            with self.assertRaises(BotError) as caught:
                bot_request(TOKEN, 'getMe')
            self.assertNotIn('secret', str(caught.exception))
