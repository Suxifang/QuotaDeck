"""Publish validated IPA assets alongside the public source and exact source tag."""
import base64
import hashlib
import json
import re
import runpy
import urllib.error
import urllib.parse
import urllib.request

REPO_NAME = 'QuotaDeck'


def public_repo(api, owner):
    repo = f'{owner}/{REPO_NAME}'
    result = api('/repos/' + repo)
    if result['private'] or result['full_name'].lower() != repo.lower():
        raise RuntimeError('Expected the public QuotaDeck source and release repository')
    return repo


def setup(api, owner, root):
    # Never create a second repository or change visibility implicitly.
    repo = public_repo(api, owner)
    print(json.dumps({'repository': repo, 'private': False, 'sourceAndReleasesTogether': True}, ensure_ascii=False))


def source_text(api, source_repo, sha, path):
    data = api(f'/repos/{source_repo}/contents/{path}?ref={sha}')
    return base64.b64decode(data['content']).decode('utf-8')


def tag_commit(api, repo, tag):
    try:
        target = api(f'/repos/{repo}/git/ref/tags/{tag}')['object']
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise
    for _ in range(5):
        if target['type'] == 'commit':
            return target['sha']
        if target['type'] != 'tag':
            break
        target = api(f'/repos/{repo}/git/tags/{target["sha"]}')['object']
    raise RuntimeError('Release tag does not resolve to a source commit')


def checked_assets(assets, filename, digest, size):
    ipas = [item for item in assets if item['name'].lower().endswith('.ipa')]
    if len(ipas) != 1 or ipas[0]['name'] != filename or ipas[0].get('digest') != 'sha256:' + digest or ipas[0].get('size') != size or ipas[0].get('state') != 'uploaded':
        raise RuntimeError('Release IPA is missing, ambiguous or invalid')
    checksum_bytes = f'{digest}  {filename}\n'.encode()
    checksums = [item for item in assets if item['name'] == 'SHA256SUMS.txt']
    if len(checksums) != 1 or checksums[0].get('digest') != 'sha256:' + hashlib.sha256(checksum_bytes).hexdigest() or checksums[0].get('size') != len(checksum_bytes) or checksums[0].get('state') != 'uploaded':
        raise RuntimeError('Release checksum file is missing or invalid')
    return ipas[0]


def record_publication(api, repo, release_id, root, evidence, run, already_published=False):
    # Draft asset URLs can contain /untagged-.../. Always refresh AFTER publishing.
    release = api(f'/repos/{repo}/releases/{release_id}')
    version = evidence['version']; tag = f'v{version}'; filename = f'Yudu-{version}.ipa'
    if release['draft'] or release['prerelease'] or release['tag_name'] != tag or release['html_url'] != f'https://github.com/{repo}/releases/tag/{tag}':
        raise RuntimeError('Published release identity mismatch')
    asset = checked_assets(release['assets'], filename, evidence['sha256'], evidence['bytes'])
    if asset['browser_download_url'] != f'https://github.com/{repo}/releases/download/{tag}/{filename}':
        raise RuntimeError('Published download URL is not the canonical release URL')
    if tag_commit(api, repo, tag) != run['head_sha']:
        raise RuntimeError('Published source tag does not match the validated build')
    evidence.update(repository=repo, url=release['html_url'], assetUrl=asset['browser_download_url'], runId=run['id'], headSha=run['head_sha'])
    (root / 'artifacts/release-publication.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'alreadyPublished': already_published, **evidence}, ensure_ascii=False))


def publish(api, opener, token, owner, root, run_id):
    repo = public_repo(api, owner)
    source_repo = repo
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
    target = tag_commit(api, repo, tag)
    if target is not None and target != run['head_sha']:
        raise RuntimeError('Existing source tag points to another commit; do not replace it')
    try:
        release = api(f'/repos/{repo}/releases/tags/{tag}')
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        # Draft first: incomplete uploads are never offered by releases/latest.
        release = api(f'/repos/{repo}/releases', {'tag_name': tag, 'target_commitish': run['head_sha'], 'name': f'余度 {version}', 'body': notes, 'draft': True, 'prerelease': False})
    if not release['draft']:
        record_publication(api, repo, release['id'], root, evidence, run, already_published=True)
        return
    if release['prerelease'] or release['tag_name'] != tag:
        raise RuntimeError('Expected the matching stable release draft')

    def upload(name, content, content_type):
        assets = api(f'/repos/{repo}/releases/{release["id"]}/assets')
        existing = [item for item in assets if item['name'] == name]
        expected = 'sha256:' + hashlib.sha256(content).hexdigest()
        if existing:
            if len(existing) != 1 or existing[0].get('digest') != expected or existing[0].get('size') != len(content) or existing[0].get('state') != 'uploaded':
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
    checked_assets(assets, filename, digest, path.stat().st_size)
    api(f'/repos/{repo}/releases/{release["id"]}', {'draft': False, 'make_latest': 'true', 'target_commitish': run['head_sha']}, method='PATCH')
    record_publication(api, repo, release['id'], root, evidence, run)
