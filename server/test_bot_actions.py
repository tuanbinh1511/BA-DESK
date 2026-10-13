import json
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from server import store
from server.analyzer import TZ
from server.bot_service import BotError, BotService, completion_reply

NOW = datetime(2026, 10, 13, 10, tzinfo=TZ)


class BotActionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.patch = patch.object(store, 'DATA_DIR', Path(self.directory.name))
        self.patch.start()
        store.put('meta', 'accountId', '123')
        store.put('meta', 'accountRevision', 1)
        (store.DATA_DIR / 'telegram-bot.json').write_text(json.dumps({'token': 'test', 'chatId': 123, 'username': 'ba_bot', 'enabledSince': NOW.isoformat()}))
        for key in ('a', 'b', 'unrelated'):
            store.put('task', key, {'id': key, 'status': 'todo', 'replyStatus': 'unanswered'})
        self.receipt = {'noticeId': 'notice', 'taskIds': ['a', 'b'], 'messageIds': [11, 12], 'chatId': 123, 'botUsername': 'ba_bot'}
        store.put('botDelivery', 'notice', self.receipt)
        self.bot = BotService()

    def tearDown(self):
        self.patch.stop()
        self.directory.cleanup()

    def reply(self, text='done', actor=123, target=11, update_id=1):
        return {'update_id': update_id, 'message': {'message_id': 99, 'from': {'id': actor}, 'chat': {'id': 123}, 'text': text, 'reply_to_message': {'message_id': target}}}

    def test_completion_phrases_and_negations(self):
        for text in ('DONE!', 'Đã hoàn thành', 'Mình đã hoàn thành hết rồi', 'xong', 'done tất cả', 'ok done'):
            self.assertTrue(completion_reply(text), text)
        for text in ('chưa done', 'chưa hoàn thành', 'not done', 'xong chưa?', 'done?', 'đang làm', 'hôm qua đã xong, hôm nay chưa xong'):
            # A question must never close work.
            self.assertFalse(completion_reply(text), text)

    async def test_reply_only_completes_bound_tasks_and_persists_offset(self):
        with patch('server.bot_service.bot_request', side_effect=[[self.reply('đã hoàn thành')], {'message_id': 100}]) as request:
            await self.bot.receive(NOW)
            self.assertEqual(request.call_args_list[0].args[2]['allowed_updates'], ['message', 'callback_query', 'message_reaction'])
        self.assertEqual([store.get('task', key)['status'] for key in ('a', 'b', 'unrelated')], ['done', 'done', 'todo'])
        self.assertEqual(store.get('task', 'a')['replyStatus'], 'unanswered')
        self.assertEqual(store.get('meta', 'botInbox')['offset'], 2)
        self.bot.complete_delivery(self.receipt, NOW + timedelta(minutes=1))
        self.assertEqual(store.get('task', 'a')['completedAt'], NOW.isoformat())

    async def test_wrong_user_unbound_message_and_negation_are_ignored(self):
        for update in (self.reply(actor=999), self.reply(target=999), self.reply('chưa hoàn thành')):
            with patch('server.bot_service.bot_request', return_value=[update]) as request:
                await self.bot.receive(NOW)
                request.assert_called_once()
        self.assertEqual(store.get('task', 'a')['status'], 'todo')

    async def test_inline_button_completes_report_and_answers_callback(self):
        update = {'update_id': 2, 'callback_query': {'id': 'query', 'data': 'done', 'from': {'id': 123}, 'message': {'message_id': 12, 'chat': {'id': 123}}}}
        with patch('server.bot_service.bot_request', side_effect=[[update], True]) as request:
            await self.bot.receive(NOW)
            self.assertEqual(request.call_args.args[1], 'answerCallbackQuery')
        self.assertEqual(store.get('task', 'b')['status'], 'done')

    async def test_only_own_reaction_completes_and_does_not_reclose_reopened_work(self):
        other = SimpleNamespace(id=11, reactions=SimpleNamespace(results=[SimpleNamespace(chosen_order=None)]))
        own = SimpleNamespace(id=12, reactions=SimpleNamespace(results=[SimpleNamespace(chosen_order=0)]))
        client = SimpleNamespace(get_messages=AsyncMock(return_value=[other]))
        with patch('server.bot_service.bot_request', return_value=[]):
            await self.bot.receive(NOW, client)
            self.assertEqual(store.get('task', 'a')['status'], 'todo')
            client.get_messages.return_value = [own]
            await self.bot.receive(NOW, client)
            self.assertEqual(store.get('task', 'a')['status'], 'done')
            store.set_task_status(['a'], 'todo', NOW)
            client.get_messages.return_value = [other]
            await self.bot.receive(NOW, client)
            self.assertEqual(client.get_messages.call_args.kwargs['ids'], [11])
            self.assertEqual(store.get('task', 'a')['status'], 'todo')

    async def test_account_switch_while_fetching_discards_actions(self):
        def switch(*args):
            store.put('meta', 'accountRevision', 2)
            return [self.reply()]
        with patch('server.bot_service.bot_request', side_effect=switch):
            await self.bot.receive(NOW)
        self.assertEqual(store.get('task', 'a')['status'], 'todo')

    async def test_failed_confirmation_retries_without_changing_completion_time(self):
        with patch('server.bot_service.bot_request', side_effect=[[self.reply()], BotError('Mất mạng', 60)]):
            await self.bot.receive(NOW)
        self.assertEqual(store.get('task', 'a')['status'], 'done')
        with patch('server.bot_service.bot_request', side_effect=[[self.reply()], {'message_id': 100}]) as request:
            await self.bot.receive(NOW + timedelta(seconds=30))
            request.assert_not_called()
            await self.bot.receive(NOW + timedelta(seconds=60))
        self.assertEqual(store.get('task', 'a')['completedAt'], NOW.isoformat())
        self.assertEqual(store.get('meta', 'botInbox')['offset'], 2)
        self.assertIsNone(self.bot.state()['error'])

    async def test_delivery_saves_message_ids_and_button(self):
        store.put('notification', 'new', {'id': 'new', 'taskIds': ['a'], 'title': 'Nhắc việc', 'body': 'Kiểm tra BRD', 'createdAt': NOW.isoformat()})
        with patch('server.bot_service.bot_request', return_value={'message_id': 20}) as request, patch('server.bot_service.asyncio.sleep', new_callable=AsyncMock):
            await self.bot.flush(NOW)
            self.assertEqual(request.call_args.args[2]['reply_markup']['inline_keyboard'][0][0]['callback_data'], 'done')
        self.assertEqual(store.get('botDelivery', 'new')['messageIds'], [20])
        self.assertEqual(store.get('botDelivery', 'new')['taskIds'], ['a'])

    async def test_report_actions_keep_snapshot_scope_after_task_removed(self):
        store.put('notification', 'report', {'id': 'report', 'title': 'Báo cáo', 'body': '', 'createdAt': NOW.isoformat()})
        tasks = [{'id': key, 'status': 'todo', 'replyStatus': 'unanswered', 'title': 'Review BRD ' + 'x' * 140, 'createdAt': NOW.isoformat()} for key in ('a', 'b')]
        store.put('report', 'report', {'date': '2026-10-13', 'people': [{'name': 'An', 'tasks': tasks}], 'body': ''})
        with patch('server.bot_service.bot_request', return_value={'message_id': 25}), patch('server.bot_service.asyncio.sleep', new_callable=AsyncMock):
            await self.bot.flush(NOW)
        receipt = store.get('botDelivery', 'report')
        self.assertEqual(receipt['taskIds'], ['a', 'b'])
        store.remove('task', 'b')
        with patch('server.bot_service.bot_request', side_effect=[[self.reply(target=25)], {'message_id': 101}]):
            await self.bot.receive(NOW)
        self.assertEqual(store.get('task', 'a')['status'], 'done')
        self.assertEqual(store.get('task', 'unrelated')['status'], 'todo')
