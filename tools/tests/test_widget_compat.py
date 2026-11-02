"""Check compatibility authorization and keep the formal release group fixed."""
from pathlib import Path
import hashlib
import plistlib
import runpy
import sys
import struct
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import widget_compat


def ad_hoc_executable():
    info, resources = b'test info plist', b'test resource envelope'
    identifier = b'test.binary\0'
    special = 3
    hash_offset = 88 + len(identifier) + special * 32
    directory_size = hash_offset + 32
    signature_size = 28 + directory_size + 8
    binary = struct.pack('<8I', 0xfeedfacf, 0x100000c, 0, 2, 1, 16, 0, 0)
    binary += struct.pack('<4I', 0x1d, 16, 48, signature_size)
    directory = bytearray(directory_size)
    struct.pack_into('>9I', directory, 0, 0xfade0c02, directory_size, 0x20400, 2, hash_offset, 88, special, 1, 48)
    struct.pack_into('>4B', directory, 36, 32, 2, 0, 12)
    directory[88:88 + len(identifier)] = identifier
    directory[hash_offset - 32:hash_offset] = hashlib.sha256(info).digest()
    directory[hash_offset - 96:hash_offset - 64] = hashlib.sha256(resources).digest()
    directory[hash_offset:hash_offset + 32] = hashlib.sha256(binary).digest()
    signature = struct.pack('>7I', 0xfade0cc0, signature_size, 2, 0, 28, 65536, 28 + directory_size)
    signature += directory + struct.pack('>2I', 0xfade0b01, 8)
    return binary + signature, info, resources


class CompatibilityTests(unittest.TestCase):
    def test_checks_certificate_free_code_and_metadata_hashes(self):
        binary, info, resources = ad_hoc_executable()
        result = widget_compat.verify_adhoc_hashes(binary, info, resources)
        self.assertEqual(result['codePageHashesVerified'], 1)
        self.assertEqual(result['specialSlotHashesVerified'], [1, 3])
        self.assertTrue(result['adHocWithoutDeveloperCertificate'])

    def test_detects_code_or_info_changes_after_signing(self):
        binary, info, resources = ad_hoc_executable()
        changed = bytearray(binary)
        changed[8] ^= 1
        with self.assertRaisesRegex(ValueError, 'Changed code page'):
            widget_compat.verify_adhoc_hashes(changed, info, resources)
        with self.assertRaisesRegex(ValueError, 'special slot 1'):
            widget_compat.verify_adhoc_hashes(binary, info + b'changed', resources)

    def test_requires_authorization_from_profile_and_both_executables(self):
        self.assertEqual(widget_compat.authorized_group('group.example.widget',
                         [['group.example.widget'], ['group.example.widget']], ['group.example.widget']), 'group.example.widget')
        with self.assertRaisesRegex(ValueError, 'not authorized'):
            widget_compat.authorized_group('group.example.widget', [['group.example.widget'], []], ['group.example.widget'])
        with self.assertRaisesRegex(ValueError, 'not authorized'):
            widget_compat.authorized_group('group.example.widget', [['group.example.widget']] * 2, ['group.other'])

    def test_rejects_wildcard_or_non_group_identifier(self):
        for group in ['group.*', 'example.widget', 'group.example/widget']:
            with self.assertRaisesRegex(ValueError, 'concrete'):
                widget_compat.authorized_group(group, [[group]] * 2, [group])

    def test_rejects_archive_paths_escaping_the_workspace(self):
        self.assertEqual(str(widget_compat.safe_member('Payload/App.app/Info.plist')), 'Payload/App.app/Info.plist')
        for name in ['../outside', '/outside', 'Payload/../../outside', 'C:/outside', 'Payload\\outside']:
            with self.assertRaisesRegex(ValueError, 'Unsafe'):
                widget_compat.safe_member(name)

    def test_official_validator_rejects_a_remapped_group_unless_explicitly_selected(self):
        executable = runpy.run_path(str(ROOT / 'tools/tests/test_ipa_entitlements.py'))['executable']
        group = 'group.example.widget'
        main = {'CFBundleIdentifier': 'app.quotadeck.mobile', 'CFBundleDisplayName': '余度',
                'CFBundleShortVersionString': '0.2.3', 'CFBundleVersion': '5', 'CFBundleExecutable': 'Yudu',
                widget_compat.RUNTIME_KEY: group}
        widget = {**main, 'CFBundleIdentifier': 'app.quotadeck.mobile.widgets', 'CFBundleExecutable': 'Widgets'}
        cache = ROOT / '.cache'
        cache.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache) as directory:
            self.assertTrue(Path(directory).resolve().is_relative_to(cache.resolve()))
            path = Path(directory) / 'compat.ipa'
            with zipfile.ZipFile(path, 'w') as package:
                package.writestr('Payload/Yudu.app/Info.plist', plistlib.dumps(main))
                package.writestr('Payload/Yudu.app/Yudu', executable({widget_compat.GROUP_KEY: [group]}))
                package.writestr('Payload/Yudu.app/main.jsbundle', b'test application bundle')
                package.writestr('Payload/Yudu.app/PlugIns/Widgets.appex/Info.plist', plistlib.dumps(widget))
                package.writestr('Payload/Yudu.app/PlugIns/Widgets.appex/Widgets', executable({widget_compat.GROUP_KEY: [group]}))
            with self.assertRaisesRegex(RuntimeError, 'shared group Info.plist'):
                widget_compat.validate_ipa(path, '0.2.3', '5')
            result = widget_compat.validate_ipa(path, '0.2.3', '5', app_group=group)
            self.assertEqual(result['appGroup'], group)
            self.assertTrue(result['embeddedGroupEntitlements'])


if __name__ == '__main__':
    unittest.main()
