"""Read XML entitlements from thin or universal Mach-O code signatures."""
import plistlib
import struct


def read_entitlements(binary):
    magic = binary[:4]
    if magic in (b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'):
        count = struct.unpack_from('>I', binary, 4)[0]
        wide = magic == b'\xca\xfe\xba\xbf'
        size = 32 if wide else 20
        if not 1 <= count <= 16 or 8 + count * size > len(binary):
            raise ValueError('Invalid universal executable')
        variants = []
        for i in range(count):
            offset, length = struct.unpack_from('>QQ' if wide else '>II', binary, 8 + i * size + 8)
            variants.append(read_entitlements(binary[offset:offset + length]))
        if any(value != variants[0] for value in variants):
            raise ValueError('Executable architectures have different entitlements')
        return variants[0]
    formats = {b'\xcf\xfa\xed\xfe': ('<', 32), b'\xce\xfa\xed\xfe': ('<', 28),
               b'\xfe\xed\xfa\xcf': ('>', 32), b'\xfe\xed\xfa\xce': ('>', 28)}
    if magic not in formats:
        raise ValueError('Not a supported Mach-O executable')
    endian, offset = formats[magic]
    count, commands_length = struct.unpack_from(endian + 'II', binary, 16)
    end = offset + commands_length
    if count > 4096 or end > len(binary):
        raise ValueError('Invalid Mach-O load commands')
    for _ in range(count):
        if offset + 8 > end:
            raise ValueError('Truncated Mach-O load command')
        command, length = struct.unpack_from(endian + 'II', binary, offset)
        if length < 8 or offset + length > end:
            raise ValueError('Invalid Mach-O load command')
        if command == 0x1d:  # LC_CODE_SIGNATURE
            if length < 16:
                raise ValueError('Truncated code signature command')
            start, size = struct.unpack_from(endian + 'II', binary, offset + 8)
            if start + size > len(binary) or size < 12:
                raise ValueError('Invalid code signature bounds')
            blob = binary[start:start + size]
            marker, total, entries = struct.unpack_from('>III', blob)
            if marker != 0xfade0cc0 or total > size or 12 + entries * 8 > total:
                raise ValueError('Invalid embedded code signature')
            for i in range(entries):
                slot, position = struct.unpack_from('>II', blob, 12 + i * 8)
                if slot != 5:  # CSSLOT_ENTITLEMENTS
                    continue
                if position + 8 > total:
                    raise ValueError('Invalid entitlement bounds')
                tag, extent = struct.unpack_from('>II', blob, position)
                if tag != 0xfade7171 or extent < 8 or position + extent > total:
                    raise ValueError('Invalid XML entitlements')
                value = plistlib.loads(blob[position + 8:position + extent])
                if not isinstance(value, dict):
                    raise ValueError('Entitlements must be a dictionary')
                return value
            return {}
        offset += length
    return {}
