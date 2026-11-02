"""Exercise publication without credentials, network access or real IPA uploads."""
import base64
from contextlib import redirect_stdout
from copy import deepcopy
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import release_channel  # noqa: E402

REPO = 'Suxifang/Yudu'
SHA = 'a' * 40
RUN_ID = 123
PAYLOAD = b'PK\x03\x04test-only-unsigned-package'
DIGEST = hashlib.sha256(PAYLOAD).hexdigest()
FILENAME = 'Yudu-0.2.1.ipa'


class GitHub:
    def __init__(self):
        self.calls = []
        self.assets = []
        self.uploads = 0
        self.private = False
        self.exists = False
        self.draft = True
        self.target = None
        self.bad_upload_digest = False
        self.run = {'id': RUN_ID, 'status': 'completed', 'conclusion': 'success', 'head_branch': 'main', 'head_sha': SHA}

    def release(self):
        return {'id': 7, 'tag_name': 'v0.2.1', 'draft': self.draft, 'prerelease': False,
                'html_url': f'https://github.com/{REPO}/releases/tag/v0.2.1', 'assets': deepcopy(self.assets)}

    def __call__(self, path, body=None, method=None):
        self.calls.append((path, deepcopy(body), method))
        if path == f'/repos/{REPO}':
            return {'private': self.private, 'full_name': REPO}
        if path == f'/repos/{REPO}/actions/runs/{RUN_ID}':
            return deepcopy(self.run)
        if path == f'/repos/{REPO}/contents/mobile/app.json?ref={SHA}':
            content = json.dumps({'expo': {'version': '0.2.1', 'ios': {'buildNumber': '3'}}})
            return {'content': base64.b64encode(content.encode()).decode()}
        if path == f'/repos/{REPO}/contents/docs/releases/v0.2.1.md?ref={SHA}':
            return {'content': base64.b64encode(b'Open source release notes').decode()}
        if path == f'/repos/{REPO}/git/ref/tags/v0.2.1':
            if self.target is None:
                raise HTTPError(path, 404, 'Not found', {}, None)
            return {'object': {'type': 'commit', 'sha': self.target}}
        if path == f'/repos/{REPO}/releases/tags/v0.2.1':
            if not self.exists:
                raise HTTPError(path, 404, 'Not found', {}, None)
            return self.release()
        if path == f'/repos/{REPO}/releases' and body:
            self.exists = True
            return self.release()
        if path == f'/repos/{REPO}/releases/7/assets':
            return deepcopy(self.assets)
        if path == f'/repos/{REPO}/releases/7':
            if method == 'PATCH':
                self.draft = body['draft']
                self.target = self.target or body['target_commitish']
                for asset in self.assets:
                    asset['browser_download_url'] = f'https://github.com/{REPO}/releases/download/v0.2.1/{asset["name"]}'
            return self.release()
        raise AssertionError(f'Unexpected API request: {path}')

    def open(self, request, timeout):
        name = parse_qs(urlparse(request.full_url).query)['name'][0]
        asset = {'name': name, 'state': 'uploaded', 'size': len(request.data),
                 'digest': 'sha256:' + ('0' * 64 if self.bad_upload_digest else hashlib.sha256(request.data).hexdigest()),
                 'browser_download_url': f'https://github.com/{REPO}/releases/download/untagged-draft/{name}'}
        self.uploads += 1
        self.assets.append(asset)
        return io.BytesIO(json.dumps(asset).encode())


class PublicationTests(unittest.TestCase):
    def setUp(self):
        (ROOT / '.cache').mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / '.cache')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'artifacts').mkdir()
        (self.root / '.cache').mkdir()
        (self.root / 'artifacts/Yudu-unsigned.ipa').write_bytes(PAYLOAD)
        self.download_record = self.root / '.cache/ipa-download.json'
        self.download_record.write_text(json.dumps({'runId': RUN_ID, 'headSha': SHA, 'sha256': DIGEST}), encoding='utf-8')
        self.github = GitHub()
        validator = patch.object(release_channel.runpy, 'run_path', return_value={'validate_ipa': lambda *args: {
            'version': '0.2.1', 'build': '3', 'bytes': len(PAYLOAD), 'sha256': DIGEST}})
        validator.start()
        self.addCleanup(validator.stop)

    def publish(self):
        output = io.StringIO()
        with redirect_stdout(output):
            release_channel.publish(self.github, self.github, 'test-token', 'Suxifang', self.root, RUN_ID)
        return json.loads(output.getvalue())

    def test_new_release_binds_source_commit_and_records_post_publish_download_url(self):
        result = self.publish()
        self.assertFalse(result['alreadyPublished'])
        self.assertEqual(result['assetUrl'], f'https://github.com/{REPO}/releases/download/v0.2.1/{FILENAME}')
        self.assertEqual(result['headSha'], SHA)
        self.assertEqual(result['runId'], RUN_ID)
        creation = next(body for path, body, _ in self.github.calls if path == f'/repos/{REPO}/releases' and body)
        self.assertEqual(creation['target_commitish'], SHA)
        self.assertTrue(creation['draft'])
        self.assertEqual(self.github.target, SHA)
        self.assertEqual(self.github.uploads, 2)
        saved = json.loads((self.root / 'artifacts/release-publication.json').read_text(encoding='utf-8'))
        self.assertEqual(saved['assetUrl'], result['assetUrl'])
        self.assertTrue(all('/Yudu-Releases' not in path for path, _, _ in self.github.calls))

    def test_repeating_identical_release_revalidates_without_uploading_again(self):
        self.publish()
        result = self.publish()
        self.assertTrue(result['alreadyPublished'])
        self.assertEqual(self.github.uploads, 2)

    def test_download_must_belong_to_the_selected_build(self):
        self.download_record.write_text(json.dumps({'runId': RUN_ID + 1, 'headSha': SHA, 'sha256': DIGEST}), encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError, 'selected build'):
            self.publish()
        self.assertFalse(self.github.exists)
        self.assertEqual(self.github.uploads, 0)

    def test_existing_tag_must_point_to_the_build_commit(self):
        self.github.target = 'b' * 40
        with self.assertRaisesRegex(RuntimeError, 'another commit'):
            self.publish()
        self.assertFalse(self.github.exists)
        self.assertEqual(self.github.uploads, 0)

    def test_changed_public_package_is_not_replaced(self):
        self.publish()
        self.github.assets[0]['digest'] = 'sha256:' + 'b' * 64
        with self.assertRaisesRegex(RuntimeError, 'invalid'):
            self.publish()
        self.assertEqual(self.github.uploads, 2)

    def test_invalid_uploaded_digest_keeps_the_release_draft(self):
        self.github.bad_upload_digest = True
        with self.assertRaisesRegex(RuntimeError, 'checksum mismatch'):
            self.publish()
        self.assertTrue(self.github.draft)
        self.assertIsNone(self.github.target)
        self.assertFalse((self.root / 'artifacts/release-publication.json').exists())

    def test_setup_does_not_make_a_private_repo_public_or_create_another_repo(self):
        self.github.private = True
        with self.assertRaisesRegex(RuntimeError, 'public Yudu'):
            release_channel.setup(self.github, 'Suxifang', self.root)
        self.assertEqual(len(self.github.calls), 1)
        self.assertEqual(self.github.calls[0][0], f'/repos/{REPO}')


if __name__ == '__main__':
    unittest.main()
