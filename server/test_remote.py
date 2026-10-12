import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class RemoteAccessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        cls.base = f'http://127.0.0.1:{port}'
        cls.env = os.environ | {
            'BA_DESK_DATA_DIR': cls.directory.name,
            'BA_DESK_AI_DISABLED': '1',
            'BA_DESK_REMOTE_MODE': 'tailscale',
            'BA_DESK_TAILSCALE_LOGIN': 'owner@example.invalid',
            'BA_DESK_ALLOWED_HOSTS': 'desk.test.ts.net',
            'BA_DESK_ALLOWED_ORIGINS': 'https://frontend.example,http://127.0.0.1:5173',
        }
        cls.process = subprocess.Popen(
            [sys.executable, '-m', 'uvicorn', 'server.app:app', '--host', '127.0.0.1', '--port', str(port), '--no-proxy-headers'],
            env=cls.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        for _ in range(100):
            try:
                if cls.request()[0] == 403:
                    return
            except (URLError, OSError):
                time.sleep(.1)
        cls.process.terminate()
        cls.process.wait(timeout=5)
        cls.directory.cleanup()
        raise RuntimeError('Remote test API did not start')

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=5)
        cls.directory.cleanup()

    @classmethod
    def request(cls, method='GET', headers=None):
        request = Request(cls.base + '/api/state', method=method, headers=headers or {})
        try:
            with urlopen(request, timeout=2) as response:
                return response.status, response.headers
        except HTTPError as error:
            with error:
                return error.code, error.headers

    def test_identity_is_required_even_without_origin(self):
        self.assertEqual(self.request()[0], 403)
        self.assertEqual(self.request(headers={'Tailscale-User-Login': 'wrong@example.invalid'})[0], 403)
        status, headers = self.request(headers={'Tailscale-User-Login': 'owner@example.invalid', 'Host': 'desk.test.ts.net'})
        self.assertEqual(status, 200)
        self.assertEqual(headers['Cache-Control'], 'no-store')

    def test_origin_and_host_boundaries(self):
        identity = {'Tailscale-User-Login': 'owner@example.invalid'}
        self.assertEqual(self.request(headers=identity | {'Origin': 'https://untrusted.example'})[0], 403)
        self.assertEqual(self.request(headers=identity | {'Host': 'untrusted.example'})[0], 400)
        status, headers = self.request(headers=identity | {'Origin': 'https://frontend.example'})
        self.assertEqual(status, 200)
        self.assertEqual(headers['Access-Control-Allow-Origin'], 'https://frontend.example')
        status, headers = self.request(headers={'Origin': 'https://frontend.example'})
        self.assertEqual(status, 403)
        self.assertEqual(headers['Access-Control-Allow-Origin'], 'https://frontend.example')

    def test_preflight_does_not_require_identity_or_allow_identity_spoofing(self):
        preflight = {'Origin': 'https://frontend.example', 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'content-type,x-account-revision'}
        self.assertEqual(self.request('OPTIONS', preflight)[0], 200)
        self.assertEqual(self.request('OPTIONS', preflight | {'Origin': 'https://untrusted.example'})[0], 400)
        self.assertEqual(self.request('OPTIONS', preflight | {'Access-Control-Request-Headers': 'tailscale-user-login'})[0], 400)

    def test_existing_revision_and_body_guards_are_preserved(self):
        identity = {'Tailscale-User-Login': 'owner@example.invalid'}
        self.assertEqual(self.request('POST', identity | {'X-Account-Revision': '999'})[0], 409)
        self.assertEqual(self.request('POST', identity | {'Content-Length': str(13 * 1024 * 1024)})[0], 413)

    def test_remote_configuration_fails_closed(self):
        invalid = (
            {'BA_DESK_REMOTE_MODE': 'unknown'},
            {'BA_DESK_TAILSCALE_LOGIN': ''},
            {'BA_DESK_ALLOWED_HOSTS': ''},
            {'BA_DESK_ALLOWED_ORIGINS': ''},
            {'BA_DESK_ALLOWED_HOSTS': '*'},
            {'BA_DESK_ALLOWED_HOSTS': 'https://desk.test.ts.net'},
            {'BA_DESK_ALLOWED_ORIGINS': '*'},
            {'BA_DESK_ALLOWED_ORIGINS': 'https://frontend.example/path'},
            {'BA_DESK_ALLOWED_ORIGINS': 'http://frontend.example'},
            {'BA_DESK_ALLOWED_ORIGINS': 'https://user:pass@frontend.example'},
        )
        for change in invalid:
            with self.subTest(change=list(change)):
                result = subprocess.run([sys.executable, '-c', 'from server.app import app'], env=self.env | change, capture_output=True, timeout=10)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(b'RuntimeError', result.stderr)
