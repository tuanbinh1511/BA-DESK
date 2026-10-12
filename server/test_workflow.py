import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch
from server import store
from server.analyzer import TZ, analyze, group_tasks
from server.ai_service import AIService, message_chunks, validated_finding
from server.app import day_tasks, generate_report

DAY = '2026-10-11'

def message(key='1:1', sender='An', outgoing=False, text='Bạn gửi BRD giúp mình?', minute=0, chat='1'):
    return {'id': key, 'chatId': chat, 'chat': 'Dự án A', 'sender': sender, 'senderId': '123' if outgoing else '456', 'text': text, 'date': f'{DAY}T09:{minute:02}:00+07:00', 'outgoing': outgoing, 'replyTo': None, 'kind': 'private', 'mentioned': False, 'url': None}


def finding(state='replied', responses=None):
    return {'sourceId': '1:1', 'title': 'Gửi BRD', 'summary': 'An cần bản BRD, bạn đã gửi bản tài liệu.', 'replyStatus': state, 'confidence': .95, 'reason': 'Tin 1:2 gửi link BRD trả lời đúng yêu cầu.', 'evidenceIds': ['1:1', '1:2'], 'responseIds': ['1:2'] if responses is None else responses, 'suggestedReply': 'Mình đã gửi bản BRD ở trên, bạn kiểm tra giúp mình nhé.', 'nextAction': 'Chờ An xác nhận bản BRD.', 'completionSuggested': True, 'assignedToSelf': True}


class WorkflowTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.patch = patch.object(store, 'DATA_DIR', Path(self.directory.name))
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.directory.cleanup()

    def test_switch_account_isolates_colliding_messages_and_derived_records(self):
        store.bind_account('123')
        first = message()
        store.save_messages_and_tasks([first], analyze([first], DAY))
        for kind in ('group', 'report', 'notification', 'aiCache', 'botDelivery', 'history'):
            store.put(kind, 'old', {'id': 'old'})
        store.put('task', 'manual', {'id': 'manual', 'kind': 'manual'})
        store.put('event', 'meeting', {'id': 'meeting'})
        self.assertTrue(store.bind_account('999'))
        self.assertEqual(store.get('meta', 'accountRevision'), 2)
        self.assertEqual(store.get_all('task'), [{'id': 'manual', 'kind': 'manual'}])
        self.assertEqual(len(store.get_all('event')), 1)
        for kind in ('message', 'group', 'report', 'notification', 'aiCache', 'botDelivery', 'history'):
            self.assertEqual(store.get_all(kind), [])
        second = message(text='Tin của tài khoản mới')
        store.save_messages_and_tasks([second], [])
        self.assertFalse(store.bind_account('999'))
        self.assertEqual(store.get_all('message')[0]['text'], second['text'])

    def test_legacy_migration_keeps_one_private_recovery_copy(self):
        store.put('message', 'old', message())
        store.bind_account('123')
        copies = list(store.DATA_DIR.glob('legacy-*.sqlite'))
        self.assertEqual(len(copies), 1)
        self.assertEqual(copies[0].stat().st_mode & 0o777, 0o600)
        self.assertEqual(store.get_all('message'), [])
        store.bind_account('123')
        self.assertEqual(len(list(store.DATA_DIR.glob('legacy-*.sqlite'))), 1)

    def test_ignored_group_excluded_from_work_and_report_keeps_raw_messages(self):
        source = message(chat='-1009', key='-1009:1') | {'kind': 'group', 'mentioned': True}
        store.save_messages_and_tasks([source], analyze([source], DAY))
        store.save_group('-1009', 'Dự án đã bàn giao')
        group = store.get('group', '-1009') | {'ignored': True}
        store.put('group', '-1009', group)
        self.assertEqual(day_tasks(DAY, True), [])
        self.assertNotIn('Gửi BRD', generate_report(DAY, 'manual')['body'])
        self.assertEqual(len(store.day_messages(DAY)), 1)
        store.put('group', '-1009', group | {'ignored': False})
        self.assertEqual(len(day_tasks(DAY, True)), 1)

    def test_group_by_identity_not_same_display_name(self):
        first = analyze([message()], DAY)[0]
        second = first | {'id': 'tg-2:1', 'senderId': '789', 'project': 'B'}
        self.assertEqual(len(group_tasks([first, second])), 2)

    def test_old_task_completed_today_included_in_day(self):
        task = analyze([message()], DAY)[0] | {'createdAt': '2026-10-10T09:00:00+07:00', 'status': 'done', 'replyStatus': 'replied', 'completedAt': f'{DAY}T10:00:00+07:00'}
        store.put('task', task['id'], task)
        self.assertEqual(day_tasks(DAY), [task])

    def test_chunking_never_drops_oversized_message_text(self):
        source = message(text='a' * 80000)
        parts = message_chunks([source], limit=1000)
        self.assertEqual(''.join(item['text'] for chunk in parts for item in chunk), source['text'])
        self.assertTrue(all(item['id'] == source['id'] for chunk in parts for item in chunk))

    def test_reply_requires_real_own_same_chat_later_evidence(self):
        incoming, own = message(), message('1:2', outgoing=True, text='BRD: https://example.test/brd', minute=5)
        valid = {'1:1': incoming, '1:2': own}
        self.assertEqual(validated_finding(finding(), valid, {'1:1'}, DAY)['replyStatus'], 'replied')
        self.assertEqual(validated_finding(finding(responses=[]), valid, {'1:1'}, DAY)['replyStatus'], 'uncertain')
        self.assertIsNone(validated_finding(finding(), valid | {'1:2': own | {'outgoing': False}}, {'1:1'}, DAY))
        self.assertIsNone(validated_finding(finding(), valid | {'1:2': own | {'chatId': '2'}}, {'1:1'}, DAY))
        self.assertIsNone(validated_finding(finding() | {'evidenceIds': ['invented']}, valid, {'1:1'}, DAY))

    async def test_semantic_reply_cache_manual_state_and_edits(self):
        store.bind_account('123')
        messages = [message(), message('1:2', outgoing=True, text='BRD: https://example.test/brd', minute=5)]
        task = analyze(messages, DAY)[0] | {'status': 'doing'}
        store.save_messages_and_tasks(messages, [task])
        service = AIService()
        service.available, service.checked_at = True, __import__('time').monotonic()
        service.run_cli = AsyncMock(return_value={'findings': [finding()]})
        await service.analyze_day(DAY, fetch_history=False)
        updated = store.get('task', task['id'])
        self.assertEqual(updated['replyStatus'], 'replied')
        self.assertEqual(updated['status'], 'doing')
        self.assertTrue(updated['ai']['completionSuggested'])
        await service.analyze_day(DAY, fetch_history=False)
        self.assertEqual(service.run_cli.await_count, 1)
        store.save_messages_and_tasks(messages, analyze(messages, DAY))
        self.assertEqual(store.get('task', task['id'])['replyStatus'], 'replied')
        edited = messages[1] | {'text': 'Mình vẫn chưa gửi BRD'}
        store.save_messages_and_tasks([edited], [])
        self.assertTrue(store.get('task', task['id'])['ai']['stale'])
        updated = store.get('task', task['id']) | {'replyStatus': 'unanswered', 'replyOverride': True}
        store.put('task', task['id'], updated)
        await service.analyze_day(DAY, fetch_history=False)
        self.assertEqual(store.get('task', task['id'])['replyStatus'], 'unanswered')

    async def test_irrelevant_request_is_hidden_without_deleting_source(self):
        store.bind_account('123')
        messages = [message(text='Ăn cơm chưa?'), message('1:2', outgoing=True, minute=5)]
        store.save_messages_and_tasks(messages, analyze(messages, DAY))
        service = AIService()
        service.available, service.checked_at = True, __import__('time').monotonic()
        service.run_cli = AsyncMock(return_value={'findings': [finding() | {'assignedToSelf': False, 'summary': 'Câu hỏi xã giao, không giao công việc.'}]})
        await service.analyze_day(DAY, fetch_history=False)
        self.assertEqual(store.watched_tasks(), [])
        self.assertEqual(len(store.day_messages(DAY)), 2)

    async def test_messages_changed_during_ai_do_not_apply_stale_answer(self):
        store.bind_account('123')
        messages = [message(), message('1:2', outgoing=True, minute=5)]
        store.save_messages_and_tasks(messages, analyze(messages, DAY))
        service = AIService()
        service.available, service.checked_at = True, __import__('time').monotonic()
        async def change(*args):
            store.save_messages_and_tasks([messages[1] | {'text': 'Đính chính: mình chưa gửi BRD'}], [])
            return {'findings': [finding()]}
        service.run_cli = change
        with self.assertRaisesRegex(ValueError, 'tin mới'):
            await service.analyze_day(DAY, fetch_history=False)
        self.assertNotIn('ai', store.get('task', 'tg-1:1'))

    async def test_account_switch_during_ai_discards_result(self):
        store.bind_account('123')
        messages = [message(), message('1:2', outgoing=True, minute=5)]
        store.save_messages_and_tasks(messages, analyze(messages, DAY))
        service = AIService()
        service.available, service.checked_at = True, __import__('time').monotonic()
        async def change(*args):
            store.bind_account('999')
            return {'findings': [finding()]}
        service.run_cli = change
        with self.assertRaisesRegex(ValueError, 'Tài khoản đã đổi'):
            await service.analyze_day(DAY, fetch_history=False)
        self.assertEqual(store.get_all('task'), [])
        self.assertEqual(store.get_all('aiCache'), [])
