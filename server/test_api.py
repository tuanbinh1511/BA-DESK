import json
from http.client import HTTPConnection
from urllib.parse import urlparse
import os
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import closing
from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from server.analyzer import TZ


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        cls.base = f'http://127.0.0.1:{port}'
        cls.process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'server.app:app', '--host', '127.0.0.1', '--port', str(port)], env=os.environ | {'BA_DESK_DATA_DIR': cls.directory.name, 'BA_DESK_AI_DISABLED': '1'}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                with urlopen(cls.base + '/api/state', timeout=1):
                    return
            except (URLError, OSError):
                time.sleep(.1)
        cls.process.terminate()
        raise RuntimeError('Test API did not start')

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=5)
        cls.directory.cleanup()

    def request(self, method, path, body=None, headers=None):
        request = Request(self.base + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={'Content-Type': 'application/json'} | (headers or {}))
        try:
            with urlopen(request, timeout=5) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            with error:
                return error.code, error.read().decode()

    def setUp(self):
        with closing(sqlite3.connect(os.path.join(self.directory.name, 'desk.sqlite'))) as connection:
            with connection:
                connection.execute('DELETE FROM records')

    def test_end_to_end_import_tasks_report_and_validation(self):
        day = datetime.now(TZ).date().isoformat()
        payload = {'id': 99, 'type': 'personal_chat', 'name': 'An', 'messages': [{'id': 1, 'type': 'message', 'from': 'An', 'from_id': 'user456', 'date': f'{day}T09:00:00', 'text': 'Bạn kiểm tra BRD trước 15h giúp mình nhé?'}]}
        body = {'payload': payload, 'selfId': '123', 'username': 'binh', 'day': day}
        self.assertEqual(self.request('POST', '/import', body)[0], 200)
        self.assertEqual(self.request('POST', '/import', body)[0], 200)
        status, workspace = self.request('GET', f'/state?day={day}')
        self.assertEqual(status, 200)
        self.assertEqual(len(workspace['tasks']), 1)
        self.assertEqual(workspace['mode'], 'import')
        key = workspace['tasks'][0]['id']
        self.assertEqual(self.request('PATCH', '/tasks/' + key, {'status': 'done'})[0], 200)
        self.assertEqual(self.request('POST', '/import', body)[0], 200)
        self.assertEqual(self.request('GET', f'/state?day={day}')[1]['tasks'][0]['status'], 'done')
        status, report = self.request('POST', '/reports', {'day': day})
        self.assertEqual(status, 200)
        self.assertIn('✓ Hoàn thành', report['body'])
        self.assertEqual(self.request('PUT', '/settings', {'morning': '18:00', 'evening': '17:00', 'enabled': True})[0], 422)
        self.assertEqual(self.request('POST', '/tasks', {'title': '   '})[0], 422)

        self.assertEqual(self.request('PATCH', '/tasks/' + key, {'status': None})[0], 422)
        self.assertEqual(self.request('POST', '/events', {'title': 'Review', 'start': f'{day}T15:00:00+07:00', 'end': f'{day}T14:00:00+07:00'})[0], 422)
        tomorrow = (datetime.now(TZ) + timedelta(days=1)).date().isoformat()
        self.assertEqual(self.request('GET', '/state?day=' + tomorrow)[0], 200)
        self.assertEqual(self.request('POST', '/sync', {'day': tomorrow})[0], 422)

    def test_library_search_validation_and_account_isolation(self):
        day = datetime.now(TZ).date().isoformat()
        payload = {'id': 99, 'type': 'personal_chat', 'name': 'Payment', 'messages': [{'id': 1, 'type': 'message', 'from': 'Minh Anh', 'from_id': 'user456', 'date': f'{day}T09:00:00', 'text': 'Review BRD Payment', 'file': 'files/BRD_v2.docx'}]}
        self.assertEqual(self.request('POST', '/import', {'payload': payload, 'selfId': '123', 'day': day})[0], 200)
        status, result = self.request('GET', '/resources?query=BRD%20minh&kind=file&direction=received&sender=456')
        self.assertEqual(status, 200)
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['items'][0]['sourceId'], '99:1')
        self.assertEqual(result['accountRevision'], 1)
        for path in ('/resources?limit=101', '/resources?offset=-1', '/resources?kind=unsafe', '/resources?start=bad', '/resources?start=2026-10-11&end=2026-10-10'):
            self.assertEqual(self.request('GET', path)[0], 422)
        payload['messages'][0]['file'] = 'files/UAT_new.xlsx'
        self.assertEqual(self.request('POST', '/import', {'payload': payload, 'selfId': '999', 'day': day})[0], 200)
        self.assertEqual(self.request('GET', '/resources?query=BRD_v2')[1]['total'], 0)
        self.assertEqual(self.request('GET', '/resources?kind=file')[1]['items'][0]['name'], 'UAT_new.xlsx')

    def test_local_origin_and_host_boundaries(self):
        self.assertEqual(self.request('POST', '/tasks', {'title': 'Bad origin'}, {'Origin': 'https://untrusted.example'})[0], 403)
        self.assertEqual(self.request('GET', '/state', headers={'Host': 'untrusted.example'})[0], 400)
        self.assertEqual(self.request('GET', '/state?day=bad-date')[0], 422)
        self.assertEqual(self.request('POST', '/telegram/connect', {'apiId': 0, 'apiHash': 'bad', 'phone': 'bad'})[0], 422)

    def test_bot_setup_requires_valid_token_and_connected_account(self):
        self.assertEqual(self.request('POST', '/telegram/bot', {'token': 'bad'})[0], 422)
        self.assertEqual(self.request('POST', '/telegram/bot', {'token': '123456789:' + 'x' * 35})[0], 409)
        self.assertEqual(self.request('POST', '/telegram/bot/test', {})[0], 409)
        self.assertEqual(self.request('DELETE', '/telegram/bot')[0], 200)
        config = {'morning': '08:30', 'evening': '17:00', 'enabled': True, 'autoSync': False, 'telegramNotifications': False}
        self.assertEqual(self.request('PUT', '/settings', config)[0], 200)
        self.assertEqual(self.request('PUT', '/settings', {'morning': '08:30', 'evening': '17:00', 'enabled': False})[0], 200)
        workspace = self.request('GET', '/state')[1]
        self.assertFalse(workspace['settings']['autoSync'])
        self.assertFalse(workspace['settings']['telegramNotifications'])
        self.assertFalse(workspace['bot']['configured'])

    def test_account_revision_rejects_stale_mutation_after_import_switch(self):
        day = datetime.now(TZ).date().isoformat()
        payload = {'id': 99, 'type': 'personal_chat', 'name': 'An', 'messages': [{'id': 1, 'type': 'message', 'from': 'An', 'from_id': 'user456', 'date': f'{day}T09:00:00', 'text': 'Bạn kiểm tra BRD giúp mình nhé?'}]}
        self.request('POST', '/import', {'payload': payload, 'selfId': '123', 'day': day})
        first = self.request('GET', '/state')[1]
        self.request('POST', '/import', {'payload': payload | {'name': 'Tài khoản mới'}, 'selfId': '999', 'day': day})
        second = self.request('GET', '/state')[1]
        self.assertEqual(second['accountId'], '999')
        self.assertGreater(second['accountRevision'], first['accountRevision'])
        self.assertEqual(len(second['messages']), 1)
        self.assertEqual(second['messages'][0]['chat'], 'Tài khoản mới')
        self.assertEqual(self.request('PATCH', '/tasks/tg-99:1', {'status': 'done'}, {'X-Account-Revision': str(first['accountRevision'])})[0], 409)
        self.assertEqual(second['tasks'][0]['status'], 'todo')

    def test_account_switch_while_request_body_uploads_cannot_patch_new_account(self):
        day = datetime.now(TZ).date().isoformat()
        payload = {'id': 99, 'type': 'personal_chat', 'name': 'An', 'messages': [{'id': 1, 'type': 'message', 'from': 'An', 'from_id': 'user456', 'date': f'{day}T09:00:00', 'text': 'Bạn kiểm tra BRD giúp mình?'}]}
        self.request('POST', '/import', {'payload': payload, 'selfId': '123', 'day': day})
        revision = self.request('GET', '/state')[1]['accountRevision']
        parsed = urlparse(self.base)
        connection = HTTPConnection(parsed.hostname, parsed.port, timeout=5)
        body = json.dumps({'status': 'done'}).encode()
        try:
            connection.putrequest('PATCH', '/api/tasks/tg-99:1')
            connection.putheader('Content-Type', 'application/json')
            connection.putheader('Content-Length', str(len(body)))
            connection.putheader('X-Account-Revision', str(revision))
            connection.endheaders()
            connection.send(body[:4])
            time.sleep(.05)
            self.request('POST', '/import', {'payload': payload, 'selfId': '999', 'day': day})
            connection.send(body[4:])
            response = connection.getresponse()
            self.assertEqual(response.status, 409)
            response.read()
            self.assertEqual(self.request('GET', '/state')[1]['tasks'][0]['status'], 'todo')
        finally:
            connection.close()

    def test_groups_ignore_and_restore_api(self):
        day = datetime.now(TZ).date().isoformat()
        payload = {'id': 99, 'type': 'private_group', 'name': 'Group', 'messages': [{'id': 1, 'type': 'message', 'from': 'An', 'from_id': 'user456', 'date': f'{day}T09:00:00', 'text': '@binh kiểm tra BRD giúp mình nhé?'}]}
        self.request('POST', '/import', {'payload': payload, 'selfId': '123', 'username': 'binh', 'day': day})
        self.assertEqual(len(self.request('GET', '/state')[1]['groups']), 1)
        self.assertEqual(self.request('PATCH', '/groups/99', {'ignored': True})[0], 200)
        state = self.request('GET', '/state')[1]
        self.assertEqual(state['tasks'], [])
        self.assertEqual(len(state['messages']), 1)
        self.assertEqual(self.request('PATCH', '/groups/99', {'ignored': False})[0], 200)
        self.assertEqual(len(self.request('GET', '/state')[1]['tasks']), 1)
        self.assertEqual(self.request('PATCH', '/groups/unknown', {'ignored': True})[0], 404)
        self.assertEqual(self.request('POST', '/ai/analyze', {'day': day})[0], 409)

    def test_start_local_workspace_and_keep_data(self):
        self.assertEqual(self.request('POST', '/workspace/start', {})[0], 200)
        self.assertEqual(self.request('GET', '/state')[1]['mode'], 'local')
        status, task = self.request('POST', '/tasks', {'title': 'Local BA task', 'project': 'Internal'})
        self.assertEqual(status, 200)
        self.assertEqual(self.request('POST', '/workspace/start', {})[0], 200)
        self.assertTrue(any(item['id'] == task['id'] for item in self.request('GET', '/state')[1]['tasks']))
        self.assertEqual(self.request('DELETE', '/tasks/' + task['id'])[0], 200)
