"""Publish only a validated IPA and release notes to the separate public repo."""
import base64
import hashlib
import json
from pathlib import Path
import re
import runpy
import urllib.error
import urllib.parse
import urllib.request

REPO_NAME = 'Yudu-Releases'


def public_repo(api, owner):
    repo = f'{owner}/{REPO_NAME}'
    result = api('/repos/' + repo)
    if result['private'] or result['full_name'].lower() != repo.lower():
        raise RuntimeError('Expected the separate public release repository')
    return repo


def setup(api, owner, root):
    # Explicitly authorized: this new repository contains no private source files.
    if not api(f'/repos/{owner}/QuotaDeck')['private']:
        raise RuntimeError('Source repository privacy changed; inspect before publishing')
    try:
        repo = public_repo(api, owner)
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        result = api('/user/repos', {'name': REPO_NAME, 'private': False, 'auto_init': False,
            'description': '余度 · Yudu — iOS IPA releases and update notes'})
        repo = result['full_name']
    try:
        api('/repos/' + repo + '/contents/README.md')
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        content = (root / 'docs/RELEASE_README.md').read_bytes()
        api('/repos/' + repo + '/contents/README.md', {'message': 'Add Yudu installation guide', 'content': base64.b64encode(content).decode()}, method='PUT')
    print(json.dumps({'repository': repo, 'private': False, 'sourcePrivate': True}, ensure_ascii=False))


def source_text(api, source_repo, sha, path):
    data = api(f'/repos/{source_repo}/contents/{path}?ref={sha}')
    return base64.b64decode(data['content']).decode('utf-8')


def publish(api, opener, token, owner, root, run_id):
    source_repo = f'{owner}/QuotaDeck'
    if not api('/repos/' + source_repo)['private']:
        raise RuntimeError('Source repository privacy changed; inspect before publishing')
    repo = public_repo(api, owner)
    run = api(f'/repos/{source_repo}/actions/runs/{int(run_id)}')
    if run['status'] != 'completed' or run['conclusion'] != 'success' or run['head_branch'] != 'main':
        raise RuntimeError('Only a successful main build can be published')
    config = json.loads(source_text(api, source_repo, run['head_sha'], 'mobile/app.json'))['expo']
    version = config['version']; build = config['ios']['buildNumber']
    if not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', version):
        raise RuntimeError('Expected a stable semantic version')
    path = root / 'artifacts/QuotaDeck-unsigned.ipa'
    downloaded = json.loads((root / '.cache/ipa-download.json').read_text(encoding='utf-8'))
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if str(downloaded['runId']) != str(run_id) or downloaded['headSha'] != run['head_sha'] or downloaded['sha256'] != digest:
        raise RuntimeError('IPA does not match the selected build download')
    validate = runpy.run_path(str(root / 'tools/validate-ipa.py'))['validate_ipa']
    evidence = validate(path, version, build)
    if evidence['bytes'] > 128 * 1024 * 1024:
        raise RuntimeError('IPA exceeds the in-app updater limit')
    notes = source_text(api, source_repo, run['head_sha'], f'docs/releases/v{version}.md')
    tag = f'v{version}'; filename = f'Yudu-{version}.ipa'
    try:
        release = api(f'/repos/{repo}/releases/tags/{tag}')
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        # Draft first: incomplete uploads are never offered by releases/latest.
        release = api(f'/repos/{repo}/releases', {'tag_name': tag, 'name': f'余度 {version}', 'body': notes, 'draft': True, 'prerelease': False})
    if not release['draft']:
        assets = [item for item in release['assets'] if item['name'] == filename]
        if len(assets) == 1 and assets[0].get('digest') == 'sha256:' + digest:
            print(json.dumps({'alreadyPublished': True, 'url': release['html_url'], **evidence}, ensure_ascii=False)); return
        raise RuntimeError('This version is already public with different contents; bump the version')

    def upload(name, content, content_type):
        assets = api(f'/repos/{repo}/releases/{release["id"]}/assets')
        existing = [item for item in assets if item['name'] == name]
        expected = 'sha256:' + hashlib.sha256(content).hexdigest()
        if existing:
            if len(existing) != 1 or existing[0].get('digest') != expected:
                raise RuntimeError('A draft asset with different contents exists; inspect before replacing it')
            return existing[0]
        url = f'https://uploads.github.com/repos/{repo}/releases/{release["id"]}/assets?name={urllib.parse.quote(name)}'
        request = urllib.request.Request(url, data=content, method='POST', headers={'Authorization': 'Bearer ' + token,
            'Content-Type': content_type, 'Accept': 'application/vnd.github+json', 'User-Agent': 'Yudu-release-publisher'})
        with opener.open(request, timeout=180) as response:
            result = json.loads(response.read())
        if result.get('digest') != expected or result.get('size') != len(content):
            raise RuntimeError('GitHub asset checksum mismatch; release remains a draft')
        return result

    upload(filename, path.read_bytes(), 'application/octet-stream')
    upload('SHA256SUMS.txt', f'{digest}  {filename}\n'.encode(), 'text/plain')
    assets = api(f'/repos/{repo}/releases/{release["id"]}/assets')
    ipas = [item for item in assets if item['name'].lower().endswith('.ipa')]
    if len(ipas) != 1 or ipas[0]['name'] != filename or ipas[0].get('digest') != 'sha256:' + digest:
        raise RuntimeError('Draft IPA is missing, ambiguous or invalid; not published')
    release = api(f'/repos/{repo}/releases/{release["id"]}', {'draft': False, 'make_latest': 'true'}, method='PATCH')
    evidence.update(repository=repo, url=release['html_url'], assetUrl=ipas[0]['browser_download_url'], runId=int(run_id), headSha=run['head_sha'])
    (root / 'artifacts/release-publication.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(evidence, ensure_ascii=False))
