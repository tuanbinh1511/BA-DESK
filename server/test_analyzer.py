import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from server import store
from server.analyzer import TZ, analyze, deadline, local_day, parse_export
from server.app import scheduler_tick, day_tasks

DAY = '2026-10-11'


def message(key='1', text='@binh kiểm tra BRD trước 14h30 nhé', outgoing=False, reply=None, kind='group', mentioned=True, day=DAY, hour='09:00'):
    return {'id': f'chat:{key}', 'chatId': 'chat', 'chat': 'Product team', 'sender': 'An', 'text': text, 'date': f'{day}T{hour}:00+07:00', 'outgoing': outgoing, 'replyTo': f'chat:{reply}' if reply else None, 'kind': kind, 'mentioned': mentioned, 'url': None}


class AnalyzerTests(unittest.TestCase):
    def test_mentions_and_actions_only(self):
        messages = [message(), message('2', 'Team review bản mới nhé', mentioned=False), message('3', '@binh chào buổi sáng')]
        tasks = analyze(messages, DAY)
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0]['dueAt'], f'{DAY}T14:30:00+07:00')
        self.assertEqual(tasks[0]['replyStatus'], 'unanswered')

    def test_direct_reply_is_answered_on_later_day(self):
        tasks = analyze([message(), message('2', 'Đã kiểm tra', True, '1', day='2026-10-12')], DAY)
        self.assertEqual(tasks[0]['replyStatus'], 'replied')

    def test_private_outgoing_is_uncertain_without_reply(self):
        tasks = analyze([message(kind='private', mentioned=False), message('2', 'Mình đang họp', True, kind='private', mentioned=False, hour='09:10')], DAY)
        self.assertEqual(tasks[0]['replyStatus'], 'uncertain')

    def test_other_group_reply_does_not_complete_mine(self):
        tasks = analyze([message(), message('2', 'Đã xem', True, 'different', hour='09:10')], DAY)
        self.assertEqual(tasks[0]['replyStatus'], 'unanswered')

    def test_reply_to_me_detected_without_username(self):
        tasks = analyze([message('0', 'Đã gửi tài liệu', True, mentioned=False, hour='08:00'), message('1', 'Bạn cập nhật phần rule nhé', reply='0', mentioned=False)], DAY)
        self.assertEqual(len(tasks), 1)
        self.assertTrue(any(item['id'] == 'chat:0' for item in tasks[0]['context']))

    def test_timezone_boundary_and_tomorrow(self):
        self.assertEqual(local_day('2026-10-10T18:00:00+00:00'), DAY)
        self.assertEqual(deadline('Gửi lúc 9h ngày mai', f'{DAY}T08:00:00+07:00'), '2026-10-12T09:00:00+07:00')
        self.assertIsNone(deadline('Cần gửi khi thuận tiện', f'{DAY}T08:00:00+07:00'))

    def test_export_identity_and_structured_text(self):
        payload = {'id': 99, 'name': 'An', 'type': 'personal_chat', 'messages': [
            {'id': 1, 'type': 'message', 'from': 'An', 'from_id': 'user456', 'date': f'{DAY}T09:00:00', 'text': ['@binh ', {'type': 'bold', 'text': 'review BRD'}]},
            {'id': 2, 'type': 'message', 'from': 'Bình', 'from_id': 'user123', 'date': f'{DAY}T09:10:00', 'reply_to_message_id': 1, 'text': 'Đã review'},
        ]}
        messages, self_id = parse_export(payload, '123', 'binh')
        self.assertEqual(self_id, '123')
        self.assertTrue(messages[1]['outgoing'])
        self.assertTrue(messages[0]['mentioned'])
        self.assertEqual(analyze(messages, DAY)[0]['replyStatus'], 'replied')
        with self.assertRaises(ValueError):
            parse_export(payload, '', 'binh')

    def test_mixed_timezone_ordering(self):
        request = message(hour='09:00', kind='private')
        reply = message('2', 'Xong', True, '1', kind='private')
        reply['date'] = f'{DAY}T03:00:00+00:00'
        self.assertEqual(analyze([reply, request], DAY)[0]['replyStatus'], 'replied')


class PersistenceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.patch = patch.object(store, 'DATA_DIR', Path(self.directory.name))
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.directory.cleanup()

    async def test_duplicate_sync_preserves_work_and_updates_old_reply(self):
        incoming = message()
        task = analyze([incoming], DAY)[0]
        store.save_messages_and_tasks([incoming], [task])
        task['status'] = 'done'
        store.put('task', task['id'], task)
        later = message('2', 'Đã gửi', True, '1', day='2026-10-12')
        store.save_messages_and_tasks([later], [])
        self.assertEqual(store.get('task', task['id'])['status'], 'done')
        self.assertEqual(store.get('task', task['id'])['replyStatus'], 'replied')
        store.save_messages_and_tasks([incoming, later], analyze([incoming, later], DAY))
        self.assertEqual(len(store.get_all('task')), 1)
        self.assertEqual(store.get('task', task['id'])['status'], 'done')

    async def test_manual_reply_override_survives_resync(self):
        incoming = message()
        task = analyze([incoming], DAY)[0]
        task.update(replyStatus='replied', replyOverride=True)
        store.put('task', task['id'], task)
        store.save_messages_and_tasks([incoming], analyze([incoming], DAY))
        self.assertEqual(store.get('task', task['id'])['replyStatus'], 'replied')

    async def test_scheduler_slots_and_reminders_are_idempotent(self):
        task = analyze([message()], DAY)[0]
        task['dueAt'] = f'{DAY}T16:00:00+07:00'
        store.put('task', task['id'], task)
        store.put('meta', 'mode', 'import')
        store.put('event', 'event', {'id': 'event', 'title': 'UAT', 'start': f'{DAY}T17:10:00+07:00', 'end': f'{DAY}T18:00:00+07:00'})
        now = datetime(2026, 10, 11, 17, 0, tzinfo=TZ)
        await scheduler_tick(now)
        await scheduler_tick(now)
        self.assertEqual(len(store.get_all('report')), 2)
        self.assertEqual(len(store.get_all('notification')), 4)
        self.assertTrue(any('1 chưa xong' in report['body'] for report in store.get_all('report')))

    async def test_disabled_schedule(self):
        store.put('meta', 'mode', 'import')
        store.put('settings', 'main', {'enabled': False})
        await scheduler_tick(datetime(2026, 10, 11, 17, 0, tzinfo=TZ))
        self.assertEqual(store.get_all('notification'), [])

    async def test_completed_work_still_needs_a_reply(self):
        task = analyze([message()], DAY)[0]
        task['status'] = 'done'
        store.put('task', task['id'], task)
        carry = day_tasks('2026-10-12', carry=True)
        self.assertEqual(len(carry), 1)
        from server.analyzer import report_text
        self.assertIn('1 cần phản hồi', report_text(carry, '2026-10-12'))

    async def test_stored_messages_filter_by_vietnam_day(self):
        incoming = message()
        incoming['date'] = '2026-10-10T18:00:00+00:00'
        store.save_messages_and_tasks([incoming], [])
        self.assertEqual(len(store.day_messages(DAY)), 1)
        self.assertEqual(len(store.day_messages('2026-10-10')), 0)
