"""Inspect the built IPA without extracting it. Used before public release."""
import hashlib
import json
from pathlib import Path
import plistlib
import re
import sys
import zipfile


def validate_ipa(path, version, build):
    path = Path(path)
    with zipfile.ZipFile(path) as package:
        if package.testzip() is not None:
            raise RuntimeError('IPA archive integrity check failed')
        names = package.namelist()
        if len(set(names)) != len(names):
            raise RuntimeError('IPA contains duplicate entries')
        plists = [name for name in names if re.fullmatch(r'Payload/[^/]+\.app/Info\.plist', name)]
        if len(plists) != 1:
            raise RuntimeError('IPA must contain exactly one main app')
        app = plists[0].removesuffix('Info.plist')
        info = plistlib.loads(package.read(plists[0]))
        expected = {'CFBundleIdentifier': 'app.quotadeck.mobile', 'CFBundleShortVersionString': version, 'CFBundleVersion': str(build), 'CFBundleDisplayName': '余度'}
        for key, value in expected.items():
            if info.get(key) != value:
                raise RuntimeError(f'IPA {key} mismatch: {info.get(key)!r} != {value!r}')
        for name in [app + info['CFBundleExecutable'], app + 'main.jsbundle']:
            if name not in names or package.getinfo(name).file_size == 0:
                raise RuntimeError('Missing application executable or JS bundle')
        widgets = [name for name in names if re.fullmatch(re.escape(app) + r'PlugIns/[^/]+\.appex/Info\.plist', name)]
        if len(widgets) != 1:
            raise RuntimeError('Expected the bundled widget extension')
        widget = plistlib.loads(package.read(widgets[0]))
        if widget.get('CFBundleIdentifier') != 'app.quotadeck.mobile.widgets':
            raise RuntimeError('Widget identity changed')
        executable = widgets[0].removesuffix('Info.plist') + widget['CFBundleExecutable']
        if executable not in names or not package.getinfo(executable).file_size:
            raise RuntimeError('Widget executable is missing')
    return {'version': version, 'build': str(build), 'bundleId': info['CFBundleIdentifier'], 'displayName': info['CFBundleDisplayName'],
            'widgetBundleId': widget['CFBundleIdentifier'], 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    config = json.loads((root / 'mobile/app.json').read_text(encoding='utf-8'))['expo']
    print(json.dumps(validate_ipa(sys.argv[1] if len(sys.argv) > 1 else root / 'artifacts/QuotaDeck-unsigned.ipa', config['version'], config['ios']['buildNumber']), ensure_ascii=False))
