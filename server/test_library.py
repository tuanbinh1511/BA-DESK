import tempfile
import time
import unittest
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from telethon.tl.types import DocumentAttributeCustomEmoji, DocumentAttributeSticker, InputStickerSetEmpty, User
from server import store
from server.ai_service import AIService
from server.analyzer import TZ, analyze, parse_export
from server.app import generate_report, telegram
from server.bot_service import formatted_parts
from server.library import references
from server.telegram_service import TelegramService

DAY = '2026-10-11'


def message(key='1:1', **fields):
    return {'id': key, 'chatId': '1', 'chat': 'Payment · BA', 'sender': 'Minh Anh', 'senderId': '456', 'text': 'Bạn kiểm tra BRD giúp mình?', 'date': DAY + 'T09:00:00+07:00', 'outgoing': False, 'replyTo': None, 'kind': 'private', 'mentioned': False, 'url': 'https://t.me/minhanh'} | fields


class LibraryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.data = patch.object(store, 'DATA_DIR', Path(self.directory.name))
        self.data.start()
        store.bind_account('123')

    def tearDown(self):
        self.data.stop()
        self.directory.cleanup()

    def test_extraction_preserves_real_attachment_hidden_link_and_quoted_paths(self):
        text = 'Review "BRD Payment v2.docx" trong "C:\\Work Space\\BA Docs\\" và /projects/payment. Link: https://example.test/spec_(v2).'
        source = message(text=text, attachment={'name': 'BRD Payment v2.docx', 'size': 4096}, links=['https://docs.example.test/uat'])
        items = references(source)
        self.assertEqual({item['value'] for item in items}, {'BRD Payment v2.docx', 'C:\\Work Space\\BA Docs\\', '/projects/payment', 'https://example.test/spec_(v2)', 'https://docs.example.test/uat'})
        file = next(item for item in items if item['kind'] == 'file')
        self.assertEqual(file['origin'], 'attachment')
        self.assertEqual(file['size'], 4096)
        self.assertTrue(all(item['sourceId'] == '1:1' and item['text'] == text for item in items))
        self.assertTrue(all(item['sourceUrl'] is None for item in items))
        self.assertEqual(file['chatUrl'], 'https://t.me/minhanh')

    def test_search_combines_people_context_dates_direction_and_literal_symbols(self):
        one = message(text='Review hoàn tiền', attachment={'name': 'BRD_100%.docx'}, date='2026-10-10T18:05:00+00:00')
        two = message('1:2', sender='Bạn', senderId='123', outgoing=True, text='Mình đã gửi bản BRD khác', attachment={'name': 'BRD_other.docx'})
        store.save_messages_and_tasks([one, two], [])
        result = store.resources(query='minh payment hoan tien BRD_100%', start=DAY, end=DAY, direction='received', sender='456', chat='1', kind='file')
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['items'][0]['name'], 'BRD_100%.docx')
        self.assertEqual(store.resources(direction='sent')['items'][0]['sourceId'], '1:2')
        self.assertEqual(store.resources(query='BRD_100X')['total'], 0)

    def test_edits_remove_stale_references_and_resync_does_not_duplicate(self):
        source = message(text='https://example.test/old')
        store.save_messages_and_tasks([source], [])
        store.resources()
        store.save_messages_and_tasks([source, source], [])
        self.assertEqual(store.resources()['total'], 1)
        store.save_messages_and_tasks([source | {'text': 'https://example.test/new'}], [])
        self.assertEqual(store.resources(query='old')['total'], 0)
        self.assertEqual(store.resources(query='new')['total'], 1)
        store.save_messages_and_tasks([source | {'text': 'Không còn link'}], [])
        self.assertEqual(store.resources()['total'], 0)

    def test_backfill_same_url_keeps_each_exchange_and_switch_clears_library(self):
        for source in [message(text='https://example.test/brd'), message('2:1', chatId='2', sender='An', senderId='999', date=DAY + 'T10:00:00+07:00', text='https://example.test/brd')]:
            store.put('message', source['id'], source)
        self.assertEqual(store.resources()['total'], 2)
        self.assertEqual(store.resources(offset=1, limit=1)['items'][0]['sourceId'], '1:1')
        store.bind_account('777')
        self.assertEqual(store.resources()['total'], 0)

    def test_export_keeps_filename_caption_and_hidden_links(self):
        payload = {'id': 1, 'type': 'personal_chat', 'name': 'An', 'messages': [{'id': 9, 'type': 'message', 'from': 'An', 'from_id': 'user456', 'date': DAY + 'T09:00:00', 'file': 'files/BRD Payment.docx', 'file_size': 2000, 'text': [{'type': 'text_link', 'text': 'Tài liệu UAT', 'href': 'https://example.test/uat'}]}]}
        messages, _ = parse_export(payload, '123', '')
        self.assertEqual(messages[0]['attachment']['name'], 'BRD Payment.docx')
        self.assertEqual(messages[0]['text'], 'Tài liệu UAT')
        self.assertEqual(len(references(messages[0])), 2)
        payload['messages'][0].update(file_name=[], file_size='bad', text_entities={})
        self.assertEqual(parse_export(payload, '123', '')[0][0]['attachment']['name'], 'BRD Payment.docx')

    def test_unsafe_links_and_dates_are_not_invented_as_folders(self):
        items = references(message(text='https://user:secret@example.test/doc và ngày 11/10', links=['javascript:alert(1)', 'data:text/html,hi']))
        self.assertEqual(items, [])

    def test_named_folder_and_caption_filename_do_not_duplicate_attachment(self):
        items = references(message(text='UAT Checklist.xlsx trong thư mục "Payment Specs"', attachment={'name': 'UAT_Checklist.xlsx'}))
        self.assertEqual({item['name'] for item in items}, {'UAT_Checklist.xlsx', 'Payment Specs'})
        self.assertEqual(next(item for item in items if item['name'] == 'Payment Specs')['kind'], 'folder')

    def test_library_excludes_media_but_keeps_office_files_and_original_messages(self):
        for name, mime, media in [('sticker.webp', 'image/webp', None), ('icon.svg', 'image/svg+xml', None), ('animation.tgs', 'application/x-tgsticker', 'sticker'), ('fake.docx', 'application/octet-stream', 'emoji'), ('photo.docx', 'image/png', None)]:
            source = message(text='Gửi nhãn dán', attachment={'name': name, 'mimeType': mime, 'mediaType': media})
            self.assertEqual(references(source), [])
            store.save_messages_and_tasks([source], [])
            self.assertEqual(store.resources()['total'], 0)
            self.assertEqual(store.get('message', source['id'])['text'], source['text'])
        for name in ['Budget.xlsm', 'Plan.pptx', 'Brief.docx', 'Notes.odt', 'Checklist.tsv']:
            self.assertEqual(references(message(attachment={'name': name}))[0]['name'], name)
        self.assertEqual(references(message(text='"icon.svg" /stickers/a.webp https://example.test/emoji.png')), [])

    def test_old_media_index_is_rebuilt_without_losing_exchange_context(self):
        source = message(text='Mình gửi bản cập nhật trước họp', outgoing=True, attachment={'name': 'Plan.pptx'})
        store.put('message', source['id'], source)
        store.put('message', '1:2', message('1:2', attachment={'name': 'sticker.webp'}))
        store.put('resource', 'legacy-sticker', {'sourceId': '1:2', 'name': 'sticker.webp'})
        store.put('meta', 'libraryVersion', '2')
        result = store.resources(direction='sent')
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['items'][0]['name'], 'Plan.pptx')
        self.assertEqual(result['items'][0]['text'], source['text'])
        self.assertEqual(result['items'][0]['chat'], source['chat'])
        self.assertEqual(len(store.get_all('message')), 2)

    def test_export_sticker_metadata_is_preserved_but_not_indexed(self):
        payload = {'id': 1, 'type': 'personal_chat', 'name': 'An', 'messages': [{'id': 9, 'type': 'message', 'from_id': 'user456', 'date': DAY + 'T09:00:00', 'file': 'files/fake.docx', 'media_type': 'sticker', 'text': ''}]}
        messages, _ = parse_export(payload, '123', '')
        self.assertEqual(messages[0]['attachment']['mediaType'], 'sticker')
        self.assertEqual(references(messages[0]), [])

    async def test_live_metadata_keeps_filename_and_caption(self):
        original = SimpleNamespace(id=9, message='Review tài liệu giúp mình', media=True, entities=[], date=datetime(2026, 10, 11, 9, tzinfo=TZ), out=False, reply_to_msg_id=None, file=SimpleNamespace(name='UAT Checklist.xlsx', mime_type='application/vnd.ms-excel', size=3000), get_sender=AsyncMock(return_value=User(id=456, first_name='An')))
        dialog = SimpleNamespace(id=456, name='An', is_user=True, is_group=False, entity=SimpleNamespace(username='an'))
        record = await TelegramService().normalize_message(dialog, SimpleNamespace(id=123, username='self'), original)
        self.assertEqual(record['attachment']['name'], 'UAT Checklist.xlsx')
        self.assertEqual(record['text'], 'Review tài liệu giúp mình')

    async def test_live_sticker_and_custom_emoji_are_not_documents_even_when_renamed(self):
        dialog = SimpleNamespace(id=456, name='An', is_user=True, is_group=False, entity=SimpleNamespace(username='an'))
        for attribute, media_type in [(DocumentAttributeSticker('', InputStickerSetEmpty()), 'sticker'), (DocumentAttributeCustomEmoji('', InputStickerSetEmpty()), 'emoji')]:
            original = SimpleNamespace(id=9, message='', media=True, entities=[], date=datetime(2026, 10, 11, 9, tzinfo=TZ), out=False, reply_to_msg_id=None, file=SimpleNamespace(name='fake.docx', mime_type='application/octet-stream', size=3000), document=SimpleNamespace(attributes=[attribute]), get_sender=AsyncMock(return_value=User(id=456, first_name='An')))
            record = await TelegramService().normalize_message(dialog, SimpleNamespace(id=123, username='self'), original)
            self.assertEqual(record['attachment']['mediaType'], media_type)
            self.assertEqual(references(record), [])

    async def test_daily_ai_never_sends_old_or_next_day_messages_or_fetches_history(self):
        old = message('1:0', text='Bạn kiểm tra việc cũ?', date='2026-10-10T10:00:00+07:00')
        today = message(kind='group', mentioned=False)
        later = message('1:2', outgoing=True, date='2026-10-12T09:00:00+07:00', text='Đã gửi BRD hôm sau')
        store.save_messages_and_tasks([old, today, later], analyze([old], '2026-10-10'))
        store.put('meta', 'lastSync', datetime.now(TZ).isoformat())
        store.put('meta', 'lastSyncDay', DAY)
        service = AIService()
        service.available, service.checked_at = True, time.monotonic()
        service.run_cli = AsyncMock(return_value={'findings': []})
        with patch.object(telegram, 'authorized', AsyncMock(return_value=True)), patch.object(telegram, 'full_history', new_callable=AsyncMock) as history:
            coverage = await service.analyze_day(DAY)
            history.assert_not_awaited()
        payload = service.run_cli.call_args.args[0]
        self.assertEqual([item['id'] for item in payload['messages']], ['1:1'])
        self.assertEqual(payload['knownRequests'], [])
        self.assertEqual(coverage['messages'], 1)
        self.assertEqual(len(store.watched_tasks()), 1)

    def test_daily_report_omits_backlog_and_repetition_but_keeps_detail(self):
        old = message('1:0', text='Bạn kiểm tra việc cũ?', date='2026-10-10T10:00:00+07:00')
        source = message()
        tasks = analyze([source], DAY) + analyze([old], '2026-10-10')
        tasks[0]['ai'] = {'summary': 'Phân tích dài ' * 50, 'nextAction': 'Bước tiếp theo ' * 30, 'stale': False}
        store.save_messages_and_tasks([source, old], tasks, refresh_replies=False)
        report = generate_report(DAY, 'manual')
        self.assertNotIn('việc cũ', report['body'])
        self.assertNotIn('Phân tích dài', report['body'])
        self.assertLess(len(report['body']), 350)
        self.assertIn('Phân tích dài', report['people'][0]['tasks'][0]['summary'])
        self.assertEqual(len(store.watched_tasks()), 2)

    def test_telegram_html_is_balanced_escaped_and_keeps_pending_reply_after_done(self):
        source = message(sender='An <script>', text='Review <BRD> & "UAT"?')
        tasks = [analyze([source], DAY)[0] | {'id': str(index), 'title': f'Việc {index} <BRD> & UAT 📝', 'status': 'done' if index == 0 else 'todo', 'url': 'https://t.me/team/9'} for index in range(60)]
        report = {'date': DAY, 'people': [{'name': source['sender'], 'tasks': tasks}]}
        parts = formatted_parts({'title': 'Bản tin'}, report)
        class Checker(HTMLParser):
            def __init__(self):
                super().__init__()
                self.stack, self.text = [], ''
            def handle_starttag(self, tag, attrs):
                self.stack.append(tag)
            def handle_endtag(self, tag):
                self.assert_tag = self.stack.pop()
                if self.assert_tag != tag:
                    raise AssertionError('Unbalanced markup')
            def handle_data(self, data):
                self.text += data
        texts = []
        for part in parts:
            parser = Checker()
            parser.feed(part)
            self.assertEqual(parser.stack, [])
            self.assertLessEqual(len(parser.text.encode('utf-16-le')) // 2, 4096)
            self.assertNotIn('<script>', part)
            texts.append(parser.text)
        combined = '\n'.join(texts)
        self.assertIn('60 cần phản hồi', combined)
        self.assertIn('Đã hoàn thành', combined)
        for task in tasks:
            self.assertIn(task['title'], combined)
