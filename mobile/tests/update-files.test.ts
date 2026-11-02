import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadRelease, restoreDownload, shareDownload } from '../src/updates/files.native';
import { InvalidDownloadError, parseGitHubRelease, RELEASES_URL } from '../src/updates/releases';

const bridge = vi.hoisted(() => ({ files: new Map<string, Uint8Array>(), folders: new Set<string>(), data: new Uint8Array(), status: 200, downloads: 0, shares: vi.fn(), available: true }));
vi.mock('expo-file-system', () => {
  class Entry {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = parts.map(part => typeof part === 'string' ? part : part.uri).join('/'); }
  }
  return { Paths: { cache: 'file://cache' },
    Directory: class extends Entry {
      get exists() { return bridge.folders.has(this.uri); }
      create() { bridge.folders.add(this.uri); }
      delete() { bridge.folders.delete(this.uri); for (const name of bridge.files.keys()) if (name.startsWith(this.uri + '/')) bridge.files.delete(name); }
    },
    File: class extends Entry {
      get exists() { return bridge.files.has(this.uri); }
      get size() { return bridge.files.get(this.uri)?.byteLength ?? 0; }
      async bytes() { return bridge.files.get(this.uri)!; }
      async text() { return new TextDecoder().decode(bridge.files.get(this.uri)); }
      write(data: string) { bridge.files.set(this.uri, new TextEncoder().encode(data)); }
      delete() { bridge.files.delete(this.uri); }
      move(target: Entry) { bridge.files.set(target.uri, bridge.files.get(this.uri)!); bridge.files.delete(this.uri); this.uri = target.uri; }
    } };
});
vi.mock('expo-file-system/legacy', () => ({ FileSystemSessionType: { FOREGROUND: 1 }, createDownloadResumable: (_url: string, uri: string, _options: unknown, progress: (value: { totalBytesWritten: number }) => void) => ({
  downloadAsync: async () => { bridge.downloads++; bridge.files.set(uri, bridge.data.slice()); progress({ totalBytesWritten: bridge.data.length }); return { uri, status: bridge.status }; },
  cancelAsync: async () => {},
}) }));
vi.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digest: (algorithm: string, bytes: Uint8Array<ArrayBuffer>) => crypto.subtle.digest(algorithm, bytes) }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => bridge.available, shareAsync: bridge.shares }));

const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
const release = parseGitHubRelease({ tag_name: 'v0.3.0', name: '余度', body: '', draft: false, prerelease: false, published_at: '2026-11-02T03:00:00Z', html_url: `${RELEASES_URL}/tag/v0.3.0`,
  assets: [{ id: 12, state: 'uploaded', name: 'Yudu-0.3.0.ipa', size: bytes.length, digest: `sha256:${digest}`, browser_download_url: `${RELEASES_URL}/download/v0.3.0/Yudu-0.3.0.ipa` }] });
beforeEach(() => { bridge.files.clear(); bridge.folders.clear(); bridge.data = bytes.slice(); bridge.status = 200; bridge.downloads = 0; bridge.shares.mockReset(); bridge.available = true; });
const prepare = () => downloadRelease(release, () => {}, () => {}).promise;

describe('native update cache and signing-app handoff', () => {
  it('downloads, verifies, restores and shares a local IPA without changing its extension', async () => {
    const progress = vi.fn(); const verifying = vi.fn();
    await downloadRelease(release, progress, verifying).promise;
    expect(progress).toHaveBeenCalledWith(bytes.length); expect(verifying).toHaveBeenCalledOnce();
    expect(await restoreDownload('0.2.0')).toEqual(release);
    await shareDownload(release);
    expect(bridge.shares).toHaveBeenCalledWith('file://cache/yudu-updates/Yudu-0.3.0.ipa', { dialogTitle: '用 LCSign 打开余度更新包' });
    expect(bridge.files.size).toBe(2); // Keep the verified package for a cancelled share or failed install.
  });
  it('cleans an installed or superseded version on the next launch', async () => {
    await prepare();
    expect(await restoreDownload('0.3.0')).toBeUndefined();
    expect(bridge.files.size).toBe(0);
    await prepare();
    expect(await restoreDownload('0.4.0')).toBeUndefined();
    expect(bridge.files.size).toBe(0);
  });
  it('rechecks bytes before handoff and removes a tampered cache', async () => {
    await prepare(); bridge.files.get('file://cache/yudu-updates/Yudu-0.3.0.ipa')![7] = 0;
    await expect(shareDownload(release)).rejects.toBeInstanceOf(InvalidDownloadError);
    expect(bridge.shares).not.toHaveBeenCalled(); expect(bridge.files.size).toBe(0);
  });
  it('rejects changed cache metadata and partial files after a restart', async () => {
    await prepare();
    bridge.files.set('file://cache/yudu-updates/release.json', new TextEncoder().encode(JSON.stringify({ ...release, downloadUrl: 'https://evil.test/a.ipa' })));
    expect(await restoreDownload('0.2.0')).toBeUndefined(); expect(bridge.files.size).toBe(0);
    bridge.files.set('file://cache/yudu-updates/download.part', bytes); bridge.folders.add('file://cache/yudu-updates');
    expect(await restoreDownload('0.2.0')).toBeUndefined(); expect(bridge.files.size).toBe(0);
  });
  it('allows cancellation even before the native task has been created', async () => {
    const task = downloadRelease(release, () => {}, () => {}); await task.cancel();
    await expect(task.promise).rejects.toThrow('取消');
    expect(bridge.downloads).toBe(0); expect(bridge.files.size).toBe(0);
  });
  it('drops incomplete, oversized, corrupt and failed HTTP downloads', async () => {
    for (const payload of [bytes.slice(0, -1), new Uint8Array([...bytes, 5]), new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 0])]) {
      bridge.data = payload; await expect(prepare()).rejects.toThrow(); expect(bridge.files.size).toBe(0);
    }
    bridge.data = bytes; bridge.status = 503;
    await expect(prepare()).rejects.toThrow('503'); expect(bridge.files.size).toBe(0);
  });
  it('retains an intact package when system sharing is unavailable', async () => {
    await prepare(); bridge.available = false;
    await expect(shareDownload(release)).rejects.toThrow('分享'); expect(bridge.files.size).toBe(2);
  });
});
