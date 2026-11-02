"""Use the existing Git credential helper without printing or persisting tokens.

Usage: python tools/github-sync.py create|push|runs|jobs RUN_ID|download RUN_ID
       python tools/github-sync.py release-setup|release-info|publish-release RUN_ID
The user has authorized syncing QuotaDeck to their GitHub account.
"""
import base64
import hashlib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import io
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request
from urllib.parse import urlparse
import zipfile

ROOT = Path(__file__).resolve().parents[1]
os.environ['GIT_TERMINAL_PROMPT'] = '0'
os.environ['GCM_INTERACTIVE'] = 'never'
result = subprocess.run(['git', '-c', 'credential.interactive=never', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n', text=True, capture_output=True, timeout=30, cwd=ROOT)
fields = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
token = fields.get('password')
if not token:
    raise SystemExit('No existing GitHub credential is available.')
proxy = subprocess.run(['git', 'config', '--get', 'http.proxy'], text=True, capture_output=True, cwd=ROOT).stdout.strip()
class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected and urlparse(req.full_url).netloc != urlparse(newurl).netloc:
            redirected.remove_header('Authorization')
        return redirected

opener = urllib.request.build_opener(urllib.request.ProxyHandler({'https': proxy, 'http': proxy}) if proxy else urllib.request.ProxyHandler(), SafeRedirect())

def api(path, body=None, raw=False, method=None):
    url = path if path.startswith('https://') else 'https://api.github.com' + path
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), headers={
        'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
        'User-Agent': 'QuotaDeck-project-sync', 'X-GitHub-Api-Version': '2022-11-28',
    }, method=method or ('GET' if body is None else 'POST'))
    with opener.open(req, timeout=45) as response:
        data = response.read()
        return data if raw else json.loads(data)

try:
    profile = api('/user')
    owner = profile['login']
    repo = owner + '/QuotaDeck'
    action = sys.argv[1]
    if action == 'create':
        try:
            data = api('/repos/' + repo)
            print(json.dumps({'existing': True, 'repository': data['full_name'], 'private': data['private']}))
        except urllib.error.HTTPError as error:
            if error.code != 404: raise
            data = api('/user/repos', {'name': 'QuotaDeck', 'private': False, 'description': '余度 · Yudu — open-source iOS quota dashboard for Sub2API relays and other API providers', 'auto_init': False})
            print(json.dumps({'created': True, 'repository': data['full_name'], 'private': data['private']}))
    elif action == 'release-setup':
        from release_channel import setup
        setup(api, owner, ROOT)
    elif action == 'release-info':
        from release_channel import public_repo
        release_repo = public_repo(api, owner)
        releases = api('/repos/' + release_repo + '/releases?per_page=3')
        print(json.dumps([{'tag': release['tag_name'], 'draft': release['draft'], 'url': release['html_url'], 'assets': [{'name': asset['name'], 'size': asset['size'], 'digest': asset.get('digest'), 'url': asset['browser_download_url']} for asset in release['assets']]} for release in releases]))
    elif action == 'publish-release':
        from release_channel import publish
        publish(api, opener, token, owner, ROOT, sys.argv[2])
    elif action == 'push':
        # This path is useful when github.com Git transport is unreachable but
        # the authenticated GitHub API is available. Preserve local Git objects.
        commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True, cwd=ROOT).strip()
        local = subprocess.check_output(['git', 'cat-file', 'commit', commit], cwd=ROOT)
        headers, message = local.decode().split('\n\n', 1)
        parents = [line[7:] for line in headers.splitlines() if line.startswith('parent ')]
        def identity(label):
            line = next(line for line in headers.splitlines() if line.startswith(label + ' '))
            match = re.match(r'.*? (.*) <(.*)> (\d+) ([+-]\d{4})$', line)
            name, email, seconds, zone = match.groups()
            offset = int(zone[1:3]) * 60 + int(zone[3:])
            if zone[0] == '-': offset *= -1
            stamp = datetime.fromtimestamp(int(seconds), timezone(timedelta(minutes=offset))).isoformat()
            return {'name': name, 'email': email, 'date': stamp}
        seed = None
        try:
            head = api('/repos/' + repo + '/git/ref/heads/main')['object']['sha']
            if head == commit:
                print('Already synchronized:', commit); raise SystemExit(0)
            seed_path = ROOT / '.cache' / 'api-seed.json'
            if not parents and seed_path.exists() and json.loads(seed_path.read_text(encoding='utf-8'))['sha'] == head: seed = head
            elif not parents or head != parents[0]: raise SystemExit('Remote main has changed; inspect it before synchronizing.')
        except urllib.error.HTTPError as error:
            if error.code not in (404, 409): raise
            if parents: raise SystemExit('Remote branch missing; inspect before synchronizing.')
            seed_data = api('/repos/' + repo + '/contents/.gitattributes', {'message': 'Initialize QuotaDeck repository', 'content': base64.b64encode((ROOT / '.gitattributes').read_bytes()).decode()}, method='PUT')
            seed = seed_data['commit']['sha']
            (ROOT / '.cache').mkdir(exist_ok=True)
            (ROOT / '.cache' / 'api-seed.json').write_text(json.dumps({'sha': seed}), encoding='utf-8')
        rows = subprocess.check_output(['git', 'ls-tree', '-rz', 'HEAD'], cwd=ROOT).split(b'\0')
        entries = []
        def entry(row):
            meta, path = row.split(b'\t', 1)
            mode, kind, sha = meta.decode().split()
            content = subprocess.check_output(['git', 'cat-file', 'blob', sha], cwd=ROOT)
            result = {'path': path.decode(), 'mode': mode, 'type': kind}
            try: result['content'] = content.decode('utf-8')
            except UnicodeDecodeError:
                blob = api('/repos/' + repo + '/git/blobs', {'content': base64.b64encode(content).decode(), 'encoding': 'base64'})
                if blob['sha'] != sha: raise RuntimeError('Uploaded blob mismatch')
                result['sha'] = sha
            return result
        with ThreadPoolExecutor(max_workers=4) as pool: entries = list(pool.map(entry, [row for row in rows if row]))
        tree = api('/repos/' + repo + '/git/trees', {'tree': entries})
        expected_tree = subprocess.check_output(['git', 'rev-parse', 'HEAD^{tree}'], text=True, cwd=ROOT).strip()
        if tree['sha'] != expected_tree: raise SystemExit('Uploaded tree mismatch')
        remote = api('/repos/' + repo + '/git/commits', {'message': message, 'tree': tree['sha'], 'parents': parents, 'author': identity('author'), 'committer': identity('committer')})
        if remote['sha'] != commit:
            (ROOT / '.cache' / 'commit-mismatch.json').write_text(json.dumps(remote, indent=2), encoding='utf-8')
            raise SystemExit('Uploaded commit mismatch; branch was not modified.')
        current = api('/repos/' + repo + '/git/ref/heads/main')['object']['sha']
        if current != (seed or parents[0]): raise SystemExit('Remote changed during upload; branch was not modified.')
        api('/repos/' + repo + '/git/refs/heads/main', {'sha': commit, 'force': bool(seed)}, method='PATCH')
        subprocess.run(['git', 'update-ref', 'refs/remotes/origin/main', commit], cwd=ROOT, check=True)
        subprocess.run(['git', 'branch', '--set-upstream-to=origin/main', 'main'], cwd=ROOT, check=True, capture_output=True)
        print('Synchronized:', repo, commit)
    elif action == 'runs':
        data = api('/repos/' + repo + '/actions/runs?per_page=3')
        print(json.dumps([{key: run[key] for key in ('id', 'status', 'conclusion', 'html_url', 'head_sha')} for run in data['workflow_runs']]))
    elif action == 'jobs':
        data = api('/repos/' + repo + '/actions/runs/' + sys.argv[2] + '/jobs')
        print(json.dumps([{'id': job['id'], 'name': job['name'], 'status': job['status'], 'conclusion': job['conclusion'], 'steps': [{key: step[key] for key in ('name', 'status', 'conclusion')} for step in job['steps']]} for job in data['jobs']]))
    elif action == 'download':
        data = api('/repos/' + repo + '/actions/runs/' + sys.argv[2] + '/artifacts')
        for artifact in data['artifacts']:
            if artifact['name'] != 'QuotaDeck-unsigned-IPA': continue
            # GitHub redirects to a temporary blob URL. Do not forward the token.
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, req, fp, code, msg, headers, newurl): return None
            direct = urllib.request.build_opener(urllib.request.ProxyHandler({'https': proxy}) if proxy else urllib.request.ProxyHandler(), NoRedirect())
            req = urllib.request.Request(artifact['archive_download_url'], headers={'Authorization': 'Bearer ' + token, 'User-Agent': 'QuotaDeck-project-sync'})
            try:
                response = direct.open(req, timeout=45); archive = response.read()
            except urllib.error.HTTPError as error:
                if error.code not in (301, 302, 303, 307, 308): raise
                with opener.open(urllib.request.Request(error.headers['Location'], headers={'User-Agent': 'QuotaDeck-project-sync'}), timeout=90) as response: archive = response.read()
            with zipfile.ZipFile(io.BytesIO(archive)) as package:
                for name in package.namelist():
                    if Path(name).name == 'QuotaDeck-unsigned.ipa':
                        target = ROOT / 'artifacts' / 'QuotaDeck-unsigned.ipa'
                        target.parent.mkdir(exist_ok=True)
                        payload = package.read(name)
                        target.write_bytes(payload)
                        run = api('/repos/' + repo + '/actions/runs/' + sys.argv[2])
                        (ROOT / '.cache' / 'ipa-download.json').write_text(json.dumps({'runId': int(sys.argv[2]), 'headSha': run['head_sha'], 'sha256': hashlib.sha256(payload).hexdigest()}), encoding='utf-8')
                        print('Saved', target)
    else: raise SystemExit('Unknown action')
except urllib.error.HTTPError as error:
    raise SystemExit('GitHub API returned HTTP ' + str(error.code))
except urllib.error.URLError as error:
    raise SystemExit('GitHub connection failed: ' + str(error.reason))
