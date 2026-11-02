"""Prepare a local widget compatibility IPA; never publish it as a release.

The reference IPA is only read to establish authorized shared groups. Its
profile, certificates, devices and account identifiers are never copied.
The result is ad-hoc signed and MUST be re-signed by the user before install.
"""
import argparse
from copy import copy
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import re
import runpy
import stat
import struct
import subprocess
import uuid
import zipfile

from ipa_entitlements import read_entitlements

ROOT = Path(__file__).resolve().parents[1]
GROUP_KEY = 'com.apple.security.application-groups'
RUNTIME_KEY = 'ExpoWidgetsAppGroupIdentifier'
validate_ipa = runpy.run_path(str(ROOT / 'tools/validate-ipa.py'))['validate_ipa']


def targets(package):
    names = package.namelist()
    mains = [name for name in names if re.fullmatch(r'Payload/[^/]+\.app/Info\.plist', name)]
    if len(mains) != 1:
        raise ValueError('Expected exactly one main application')
    main = mains[0]
    widgets = [name for name in names if re.fullmatch(re.escape(main.removesuffix('Info.plist')) + r'PlugIns/[^/]+\.appex/Info\.plist', name)]
    if len(widgets) != 1:
        raise ValueError('Expected exactly one widget extension')
    return [main, widgets[0]]


def authorized_group(group, signed_groups, profile_groups):
    if not re.fullmatch(r'group\.[A-Za-z0-9][A-Za-z0-9.-]*', group):
        raise ValueError('Choose a concrete App Group identifier')
    if len(signed_groups) != 2 or group not in profile_groups or any(group not in groups for groups in signed_groups):
        raise ValueError('The selected group is not authorized in the reference profile and both executable signatures')
    return group


def reference_authorization(path, group, openssl):
    with zipfile.ZipFile(path) as package:
        entries = targets(package)
        signed_groups = []
        profile_groups = []
        profile_count = 0
        for entry in entries:
            info = plistlib.loads(package.read(entry))
            executable = entry.removesuffix('Info.plist') + info['CFBundleExecutable']
            signed_groups.append(read_entitlements(package.read(executable)).get(GROUP_KEY, []))
            profile_name = entry.removesuffix('Info.plist') + 'embedded.mobileprovision'
            if profile_name not in package.namelist():
                if entry == entries[0]:
                    raise ValueError('Reference main application has no provisioning profile')
                continue
            result = subprocess.run([str(openssl), 'cms', '-verify', '-inform', 'DER', '-noverify'],
                                    input=package.read(profile_name), capture_output=True, timeout=30, check=True)
            profile = plistlib.loads(result.stdout)
            expiry = profile.get('ExpirationDate')
            if not isinstance(expiry, datetime) or expiry.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
                raise ValueError('Reference provisioning profile has expired or has no expiration date')
            allowed = profile.get('Entitlements', {}).get(GROUP_KEY, [])
            profile_groups.append(allowed)
            profile_count += 1
        common = set(profile_groups[0]).intersection(*map(set, profile_groups[1:]))
        authorized_group(group, signed_groups, common)
        return {'group': group, 'referenceVersion': plistlib.loads(package.read(entries[0]))['CFBundleShortVersionString'],
                'matchingExecutableSignatures': len(signed_groups), 'matchingEmbeddedProfiles': profile_count,
                'referenceWidgetHasOwnProfile': profile_count == 2}


def safe_member(name):
    path = PurePosixPath(name)
    if not name or path.is_absolute() or '..' in path.parts or '\\' in name or ':' in name:
        raise ValueError('Unsafe IPA archive path')
    return path


def verify_adhoc_hashes(binary, info=None, resources=None):
    """Check SHA-256 code/special-slot hashes, not Apple trust or installability.

    rcodesign 0.29's verify rejects the empty CMS wrapper of its own ad-hoc
    signatures. Check the supported arm64 artifact format independently.
    """
    if binary[:4] != b'\xcf\xfa\xed\xfe':
        raise ValueError('Ad-hoc hash checks require a thin 64-bit little-endian Mach-O')
    offset = 32
    blobs = None
    signature_start = None
    for _ in range(struct.unpack_from('<I', binary, 16)[0]):
        command, size = struct.unpack_from('<II', binary, offset)
        if size < 8 or offset + size > len(binary):
            raise ValueError('Invalid Mach-O load command')
        if command == 0x1d:
            signature_start, extent = struct.unpack_from('<II', binary, offset + 8)
            signature = binary[signature_start:signature_start + extent]
            magic, length, count = struct.unpack_from('>III', signature)
            if magic != 0xfade0cc0 or length > len(signature) or 12 + count * 8 > length:
                raise ValueError('Invalid ad-hoc signature bounds')
            blobs = {}
            for index in range(count):
                slot, start = struct.unpack_from('>II', signature, 12 + index * 8)
                _, length = struct.unpack_from('>II', signature, start)
                if start + length > len(signature):
                    raise ValueError('Invalid ad-hoc blob bounds')
                blobs[slot] = signature[start:start + length]
            break
        offset += size
    if not blobs or 0 not in blobs:
        raise ValueError('Missing ad-hoc CodeDirectory')
    directory = blobs[0]
    magic, length, version, flags, hashes, _, special, pages, limit = struct.unpack_from('>9I', directory)
    if magic != 0xfade0c02 or length != len(directory) or not flags & 2 or len(blobs.get(65536, b'')) not in (0, 8):
        raise ValueError('Expected a certificate-free ad-hoc CodeDirectory')
    hash_size, hash_type, _, exponent = struct.unpack_from('>4B', directory, 36)
    if hash_size != 32 or hash_type != 2 or not 1 <= exponent <= 20:
        raise ValueError('Unsupported CodeDirectory hash format')
    if version >= 0x20300 and struct.unpack_from('>Q', directory, 56)[0]:
        limit = struct.unpack_from('>Q', directory, 56)[0]
    page_size = 1 << exponent
    if limit > signature_start or pages != (limit + page_size - 1) // page_size or hashes < special * 32 or hashes + pages * 32 > len(directory):
        raise ValueError('Invalid CodeDirectory page bounds')
    for index in range(pages):
        digest = hashlib.sha256(binary[index * page_size:min((index + 1) * page_size, limit)]).digest()
        if digest != directory[hashes + index * 32:hashes + (index + 1) * 32]:
            raise ValueError(f'Changed code page {index}')
    payloads = {1: info, 2: blobs.get(2), 3: resources, 5: blobs.get(5), 7: blobs.get(7)}
    checked = []
    for slot in range(1, special + 1):
        digest = directory[hashes - slot * 32:hashes - (slot - 1) * 32]
        if digest == bytes(32):
            continue
        if payloads.get(slot) is None or hashlib.sha256(payloads[slot]).digest() != digest:
            raise ValueError(f'Changed or unsupported special slot {slot}')
        checked.append(slot)
    return {'codePageHashesVerified': pages, 'specialSlotHashesVerified': checked,
            'cdhash': hashlib.sha256(directory).digest()[:20].hex(), 'adHocWithoutDeveloperCertificate': True}


def verify_resources(bundle, code_hashes):
    resources = plistlib.loads((bundle / '_CodeSignature/CodeResources').read_bytes())
    checked = 0
    for name, entry in resources.get('files2', {}).items():
        path = bundle.joinpath(*safe_member(name).parts)
        if not path.exists() and isinstance(entry, dict) and entry.get('optional'):
            continue
        if isinstance(entry, bytes):
            entry = {'hash': entry}
        for key, algorithm in [('hash', hashlib.sha1), ('hash2', hashlib.sha256)]:
            if key in entry:
                if algorithm(path.read_bytes()).digest() != entry[key]:
                    raise ValueError('Changed sealed bundle resource: ' + name)
                checked += 1
        if 'cdhash' in entry:
            if path not in code_hashes or code_hashes[path]['cdhash'] != entry['cdhash'].hex():
                raise ValueError('Changed nested executable signature: ' + name)
            checked += 1
    return checked


def prepare(source, reference, group, codesign, openssl, output):
    source, reference, codesign, openssl, output = map(lambda path: Path(path).resolve(), (source, reference, codesign, openssl, output))
    if not output.is_relative_to((ROOT / 'artifacts').resolve()):
        raise ValueError('Compatibility artifacts must stay in this project artifacts directory')
    if output.exists():
        raise FileExistsError('Do not replace an existing compatibility IPA; choose another output name')
    authorization = reference_authorization(reference, group, openssl)
    work = ROOT / '.cache/widget-compat' / uuid.uuid4().hex
    work.mkdir(parents=True)
    with zipfile.ZipFile(source) as package:
        entries = targets(package)
        main_info = plistlib.loads(package.read(entries[0]))
        baseline = validate_ipa(source, main_info['CFBundleShortVersionString'], main_info['CFBundleVersion'])
        original_infos = {item.filename: copy(item) for item in package.infolist()}
        if len(original_infos) != len(package.infolist()):
            raise ValueError('Duplicate IPA archive entries')
        original_js = hashlib.sha256(package.read(entries[0].removesuffix('Info.plist') + 'main.jsbundle')).hexdigest()
        for item in package.infolist():
            relative = safe_member(item.filename)
            destination = work.joinpath(*relative.parts)
            if stat.S_ISLNK(item.external_attr >> 16):
                raise ValueError('This compatibility tool does not extract symbolic links')
            if item.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(package.read(item))
        for entry in entries:
            destination = work / entry
            original = destination.read_bytes()
            info = plistlib.loads(original)
            info[RUNTIME_KEY] = group
            destination.write_bytes(plistlib.dumps(info, fmt=plistlib.FMT_BINARY if original.startswith(b'bplist') else plistlib.FMT_XML, sort_keys=False))
    (work / 'entitlements.plist').write_bytes(plistlib.dumps({GROUP_KEY: [group]}))
    (work / 'empty.toml').write_text('', encoding='utf-8')
    app_root = entries[0].removesuffix('/Info.plist')
    widget_root = entries[1].removesuffix('/Info.plist')
    command = [str(codesign), 'sign', '--config-file', 'empty.toml', '--timestamp-url', 'none',
               '--entitlements-xml-file', 'entitlements.plist']
    print('Preparing ad-hoc application and widget signatures', flush=True)
    # Explicit child-first signing avoids platform-dependent scope separators.
    # The parent seals the updated child without re-signing nested bundles.
    for label, arguments in [('widget', [widget_root]), ('main', ['--exclude', '**', app_root])]:
        signed = subprocess.run(command + arguments, cwd=work, capture_output=True, text=True,
                                encoding='utf-8', errors='replace', timeout=180)
        (work / (label + '-signing.log')).write_text(signed.stdout + signed.stderr, encoding='utf-8')
        if signed.returncode:
            raise RuntimeError(f'{label} compatibility signing failed: ' + signed.stderr[-4000:])
    verified = {}
    code_hashes = {}
    for executable in sorted((work / app_root).rglob('*')):
        if not executable.is_file():
            continue
        with executable.open('rb') as program:
            if program.read(4) != b'\xcf\xfa\xed\xfe':
                continue
        info_file = executable.parent / 'Info.plist'
        resource_file = executable.parent / '_CodeSignature/CodeResources'
        info_bytes = info_file.read_bytes() if info_file.exists() else None
        checks = verify_adhoc_hashes(executable.read_bytes(), info_bytes,
                                    resource_file.read_bytes() if resource_file.exists() else None)
        verified[executable.relative_to(work).as_posix()] = checks
        code_hashes[executable] = checks
        if info_bytes and plistlib.loads(info_bytes).get('CFBundleExecutable') == executable.name:
            code_hashes[executable.parent] = checks
    resource_checks = sum(verify_resources(path.parent.parent, code_hashes)
                          for path in (work / app_root).rglob('_CodeSignature/CodeResources'))
    for entry in entries:
        info = plistlib.loads((work / entry).read_bytes())
        executable = work / entry.removesuffix('Info.plist') / info['CFBundleExecutable']
        if read_entitlements(executable.read_bytes()).get(GROUP_KEY) != [group]:
            raise RuntimeError(info['CFBundleIdentifier'] + ' did not receive the selected shared group')
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.ipa.part')
    if temporary.exists():
        raise FileExistsError('A partial compatibility artifact already exists')
    with zipfile.ZipFile(temporary, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as package:
        for destination in sorted((work / 'Payload').rglob('*')):
            if not destination.is_file():
                continue
            name = destination.relative_to(work).as_posix()
            item = copy(original_infos.get(name, zipfile.ZipInfo(name)))
            if not item.external_attr:
                item.external_attr = (stat.S_IFREG | 0o644) << 16
            package.writestr(item, destination.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
    evidence = validate_ipa(temporary, baseline['version'], baseline['build'], app_group=group)
    with zipfile.ZipFile(temporary) as package:
        if any(name.endswith('.mobileprovision') for name in package.namelist()):
            raise RuntimeError('A private provisioning profile was unexpectedly copied')
        js = package.read(entries[0].removesuffix('Info.plist') + 'main.jsbundle')
        if hashlib.sha256(js).hexdigest() != original_js:
            raise RuntimeError('Compatibility preparation unexpectedly changed application JavaScript')
    os.replace(temporary, output)
    evidence.update(compatibilityTestOnly=True, requiresUserResigning=True, officialReleaseUnchanged=True,
                    sourceSha256=baseline['sha256'], referenceSha256=hashlib.sha256(reference.read_bytes()).hexdigest(),
                    authorization=authorization, adHocExecutableHashChecks=verified, sealedResourceHashChecks=resource_checks,
                    appleSignatureTrustVerified=False, applicationJavaScriptUnchanged=True,
                    copiedPrivateProfiles=False, output=str(output.relative_to(ROOT)), signingTool='apple-codesign 0.29.0')
    output.with_suffix('.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    output.with_suffix('.sha256').write_text(f'{evidence["sha256"]}  {output.name}\n', encoding='utf-8')
    return evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--signed-reference', type=Path, required=True)
    parser.add_argument('--group', required=True)
    parser.add_argument('--codesign', type=Path, required=True, help='Path to rcodesign (apple-codesign 0.29.0)')
    parser.add_argument('--openssl', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(args.source, args.signed_reference, args.group, args.codesign, args.openssl, args.output), ensure_ascii=False))


if __name__ == '__main__':
    main()
