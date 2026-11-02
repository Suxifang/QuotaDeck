"""Synthetic Mach-O fixtures exercise entitlement parsing, not cryptographic trust."""
from pathlib import Path
import plistlib
import struct
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ipa_entitlements import read_entitlements


def executable(entitlements):
    xml = plistlib.dumps(entitlements)
    blob = struct.pack('>II', 0xfade7171, len(xml) + 8) + xml
    signature = struct.pack('>IIIII', 0xfade0cc0, len(blob) + 20, 1, 5, 20) + blob
    header = struct.pack('<IIIIIIII', 0xfeedfacf, 0x100000c, 0, 2, 1, 16, 0, 0)
    return header + struct.pack('<IIII', 0x1d, 16, 48, len(signature)) + signature


class EntitlementTests(unittest.TestCase):
    def test_reads_shared_group_from_code_signature(self):
        expected = {'com.apple.security.application-groups': ['group.app.quotadeck.mobile']}
        self.assertEqual(read_entitlements(executable(expected)), expected)

    def test_unsigned_executable_does_not_claim_shared_permissions(self):
        header = struct.pack('<IIIIIIII', 0xfeedfacf, 0x100000c, 0, 2, 0, 0, 0, 0)
        self.assertEqual(read_entitlements(header), {})

    def test_rejects_truncated_signature(self):
        with self.assertRaisesRegex(ValueError, 'signature bounds'):
            read_entitlements(executable({})[:-1])

    def test_requires_all_architectures_to_have_the_same_entitlements(self):
        first = executable({'group': ['one']})
        second = executable({'group': ['two']})
        universal = struct.pack('>II', 0xcafebabe, 2)
        universal += struct.pack('>IIIII', 0x100000c, 0, 48, len(first), 0)
        universal += struct.pack('>IIIII', 0x100000c, 1, 48 + len(first), len(second), 0)
        with self.assertRaisesRegex(ValueError, 'different entitlements'):
            read_entitlements(universal + first + second)


if __name__ == '__main__':
    unittest.main()
