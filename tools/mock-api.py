"""Local-only read-only quota fixtures for browser integration checks.

Run: python tools/mock-api.py. Test credentials are intentionally fake.
"""
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json

def iso(hours=0): return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def send(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', 'http://localhost:8088')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-api-key')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    def do_OPTIONS(self): self.send(200, {})
    def do_GET(self):
        path = self.path.split('?')[0]
        token = self.headers.get('Authorization')
        admin = self.headers.get('x-api-key')
        if path == '/sub/v1/usage':
            if token != 'Bearer test-only-key': return self.send(401, {})
            return self.send(200, {'data': {'subscription': {'weekly_limit_usd': 600, 'weekly_usage_usd': 5.43, 'weekly_reset_at': iso(48), 'daily_limit_usd': 100, 'daily_usage_usd': 5.43}, 'usage': {'today': {'actual_cost': 5.43}}}})
        if path.startswith('/admin/api/v1/admin/accounts'):
            if admin != 'test-only-admin': return self.send(401, {})
            def account(id): return {'id': id, 'name': '测试反代 ' + str(id), 'platform': 'openai', 'type': 'oauth', 'extra': {'codex_5h_used_percent': 18, 'codex_7d_used_percent': 84, 'codex_usage_updated_at': iso(), 'codex_5h_reset_at': iso(3), 'codex_7d_reset_at': iso(29)}}
            if path == '/admin/api/v1/admin/accounts': return self.send(200, {'data': {'items': [account(42), account(43)], 'total': 2}})
            if path.rsplit('/', 1)[-1] in ('42', '43'): return self.send(200, {'data': account(int(path.rsplit('/', 1)[-1]))})
        if path == '/custom/balance':
            if token != 'Bearer test-only-key': return self.send(401, {})
            return self.send(200, {'data': {'balance': 28.64}})
        return self.send(404, {})

print('Yudu mock API: http://127.0.0.1:8091', flush=True)
ThreadingHTTPServer(('127.0.0.1', 8091), Handler).serve_forever()
