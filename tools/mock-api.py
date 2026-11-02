"""Local-only read-only quota fixtures for browser integration checks.

Run: python tools/mock-api.py. Test credentials are intentionally fake.
"""
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from urllib.parse import parse_qs, urlparse

def iso(hours=0): return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def send(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        origin = self.headers.get('Origin', '')
        if origin in ('http://localhost:8088', 'http://127.0.0.1:8089', 'http://localhost:8089'):
            self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-api-key')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    def do_OPTIONS(self): self.send(200, {})
    def do_POST(self):
        path = urlparse(self.path).path
        try: body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
        except (ValueError, json.JSONDecodeError): return self.send(400, {})
        if path == '/sub/api/v1/auth/login':
            if body.get('password') != 'test-only-password': return self.send(401, {})
            if body.get('email') == '2fa@example.invalid': return self.send(200, {'data': {'requires_2fa': True, 'temp_token': 'test-only-challenge'}})
            if body.get('email') != 'test@example.invalid': return self.send(401, {})
        elif path == '/sub/api/v1/auth/login/2fa':
            if body.get('temp_token') != 'test-only-challenge' or body.get('totp_code') != '123456': return self.send(401, {})
        elif path == '/sub/api/v1/auth/refresh':
            if body.get('refresh_token') != 'test-only-refresh': return self.send(401, {})
        else: return self.send(404, {})
        return self.send(200, {'data': {'access_token': 'test-only-user-jwt', 'refresh_token': 'test-only-refresh', 'expires_in': 3600, 'user': {'id': 10, 'role': 'user'}}})
    def do_GET(self):
        url = urlparse(self.path)
        path = url.path
        query = parse_qs(url.query)
        token = self.headers.get('Authorization')
        admin = self.headers.get('x-api-key')
        if path == '/sub/api/v1/keys':
            if token != 'Bearer test-only-user-jwt': return self.send(401, {})
            return self.send(200, {'data': {'items': [{'id': 23, 'user_id': 10, 'key': 'test-only-key'}], 'page': 1, 'pages': 1}})
        if path == '/sub/api/v1/usage':
            if token != 'Bearer test-only-user-jwt': return self.send(401, {})
            if query.get('api_key_id', [''])[0] != '23': return self.send(400, {})
            page = int(query.get('page', ['1'])[0])
            rows = [{'id': i + 1, 'user_id': 10, 'api_key_id': 23, 'model': 'test-model-' + ('reasoning' if i % 3 else 'fast'),
                     'created_at': (datetime.now(timezone.utc) - timedelta(minutes=i * 3 + 1)).isoformat(),
                     'actual_cost': .034814 if i % 3 else .000028, 'input_tokens': 1410, 'output_tokens': 2114,
                     'cache_read_tokens': 108500, 'cache_creation_tokens': 0, 'first_token_ms': 2720,
                     'duration_ms': 66200, 'reasoning_effort': 'high', 'stream': True} for i in range(23)]
            return self.send(200, {'data': {'items': rows[(page - 1) * 20:page * 20], 'page': page, 'page_size': 20, 'pages': 2}})
        if path == '/admin/api/v1/admin/usage':
            if admin != 'test-only-admin': return self.send(401, {})
            account_id = query.get('account_id', [''])[0]
            if account_id not in ('42', '43'): return self.send(400, {})
            page = int(query.get('page', ['1'])[0])
            rows = [{'id': index + 1, 'account_id': int(account_id), 'model': 'test-model-' + ('reasoning' if index % 3 else 'fast'),
                     'created_at': (datetime.now(timezone.utc) - timedelta(minutes=index * 3 + 1)).isoformat(),
                     'input_tokens': 1410 + index, 'output_tokens': 2114 - index, 'cache_read_tokens': 108500,
                     'cache_creation_tokens': 0, 'actual_cost': .034814 if index % 3 else .000028,
                     'total_cost': .17407, 'duration_ms': 66200, 'first_token_ms': 2720,
                     'reasoning_effort': 'high', 'stream': True} for index in range(23)]
            return self.send(200, {'data': {'items': rows[(page - 1) * 20:page * 20], 'page': page, 'page_size': 20, 'pages': 2, 'total': 23}})
        if path == '/new/api/status':
            return self.send(200, {'data': {'quota_per_unit': 250000, 'quota_display_type': 'USD'}})
        if path == '/new/api/usage/token/':
            if token != 'Bearer test-only-key': return self.send(401, {})
            return self.send(200, {'data': {'object': 'token_usage', 'total_available': 500000, 'total_used': 250000, 'total_granted': 750000}})
        if path == '/new/api/log/token':
            if token != 'Bearer test-only-key': return self.send(401, {})
            return self.send(200, {'success': True, 'data': [{'id': 1, 'type': 2, 'model_name': 'test-model', 'created_at': int(datetime.now(timezone.utc).timestamp()),
                'quota': 8700, 'prompt_tokens': 0, 'completion_tokens': 84, 'use_time': 12, 'is_stream': True,
                'other': json.dumps({'cache_tokens': 400, 'frt': 2400})}]})
        if path == '/denied/api/v1/admin/usage': return self.send(403, {})
        if path.startswith('/denied/api/v1/admin/accounts'):
            return self.send(200, {'data': {'id': 42, 'name': '测试权限不足', 'platform': 'openai', 'type': 'oauth', 'extra': {'codex_5h_used_percent': 18, 'codex_usage_updated_at': iso()}}})
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
