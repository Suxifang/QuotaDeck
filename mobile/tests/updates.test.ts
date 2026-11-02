import { describe, expect, it, vi } from 'vitest';
import { AUTO_CHECK_INTERVAL, compareVersions, fetchLatestRelease, LATEST_RELEASE_API, MAX_IPA_BYTES, parseGitHubRelease, RELEASE_REPOSITORY, RELEASES_URL, shouldAutoCheck, validateRelease, verifyAssetBytes, type ReleaseFetcher } from '../src/updates/releases';

const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
async function hash(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
const sha256 = await hash(bytes);
function github() {
  return { tag_name: 'v0.3.0', name: '余度 0.3.0', body: '更新说明', draft: false, prerelease: false,
    html_url: `${RELEASES_URL}/tag/v0.3.0`, published_at: '2026-11-02T03:00:00Z', assets: [{ id: 12, name: 'Yudu-0.3.0.ipa', state: 'uploaded', size: bytes.length,
      digest: `sha256:${sha256}`, browser_download_url: `${RELEASES_URL}/download/v0.3.0/Yudu-0.3.0.ipa` }] };
}

describe('official update metadata and version ordering', () => {
  it('uses the source repository and rejects packages or cached metadata from the retired channel', () => {
    expect(RELEASE_REPOSITORY).toBe('Suxifang/Yudu');
    for (const oldRepo of ['QuotaDeck', 'Yudu-Releases']) {
      const oldUrl = `https://github.com/Suxifang/${oldRepo}/releases`;
      const retired = { ...github(), html_url: `${oldUrl}/tag/v0.3.0`, assets: [{ ...github().assets[0], browser_download_url: `${oldUrl}/download/v0.3.0/Yudu-0.3.0.ipa` }] };
      expect(() => parseGitHubRelease(retired)).toThrow();
      const cached = parseGitHubRelease(github());
      expect(() => validateRelease({ ...cached, pageUrl: retired.html_url, downloadUrl: retired.assets[0].browser_download_url })).toThrow();
    }
  });
  it('compares numbers instead of lexicographic strings and refuses prerelease or malformed versions', () => {
    expect(compareVersions('0.10.0', '0.2.0')).toBe(1);
    expect(compareVersions('1.0.0', '0.99.99')).toBe(1);
    expect(compareVersions('0.2.0', '0.2.0')).toBe(0);
    expect(compareVersions('0.1.9', '0.2.0')).toBe(-1);
    for (const version of ['0.3', '01.2.0', '0.3.0-beta', 'v0.3.0', '0.3.9007199254740992']) expect(() => compareVersions(version, '0.2.0')).toThrow();
  });
  it('accepts a single uploaded stable IPA with the official path and digest', () => {
    expect(parseGitHubRelease(github())).toMatchObject({ version: '0.3.0', sha256, size: 8, assetId: 12 });
    expect(validateRelease(parseGitHubRelease(github()))).toEqual(parseGitHubRelease(github()));
  });
  it('rejects missing, duplicate and incomplete assets and non-stable releases', () => {
    for (const patch of [{ draft: true }, { prerelease: true }, { assets: [] }, { assets: [...github().assets, ...github().assets] }]) {
      expect(() => parseGitHubRelease({ ...github(), ...patch })).toThrow();
    }
    for (const patch of [{ state: 'new' }, { digest: null }, { size: 0 }, { size: MAX_IPA_BYTES + 1 }, { id: -1 }, { name: 'Wrong.ipa' }]) {
      expect(() => parseGitHubRelease({ ...github(), assets: [{ ...github().assets[0], ...patch }] })).toThrow();
    }
  });
  it('refuses foreign hosts, mismatched versions, alternate repos, query strings and cached URL substitution', () => {
    for (const url of ['http://github.com/test.ipa', 'https://github.com.evil.test/app.ipa', 'https://evil.test/app.ipa', `${github().assets[0].browser_download_url}?other=1`, github().assets[0].browser_download_url.replace('v0.3.0/', 'v0.4.0/')]) {
      expect(() => parseGitHubRelease({ ...github(), assets: [{ ...github().assets[0], browser_download_url: url }] })).toThrow();
    }
    expect(() => validateRelease({ ...parseGitHubRelease(github()), downloadUrl: 'https://evil.test/app.ipa' })).toThrow();
    expect(() => parseGitHubRelease({ ...github(), html_url: 'https://evil.test/release' })).toThrow();
  });
});

describe('file integrity before LCSign handoff', () => {
  it('accepts intact bytes and rejects same-size tampering', async () => {
    const release = parseGitHubRelease(github());
    await expect(verifyAssetBytes(release, bytes, hash)).resolves.toBeUndefined();
    const tampered = bytes.slice(); tampered[7] = 0;
    await expect(verifyAssetBytes(release, tampered, hash)).rejects.toThrow('SHA-256');
  });
  it('rejects truncated downloads and HTML pretending to be an IPA', async () => {
    const release = parseGitHubRelease(github());
    await expect(verifyAssetBytes(release, bytes.slice(0, -1), hash)).rejects.toThrow('大小');
    await expect(verifyAssetBytes(release, new TextEncoder().encode('<html>!!'), hash)).rejects.toThrow('IPA');
  });
});

describe('GitHub requests and foreground auto-check limits', () => {
  it('uses the fixed public endpoint without credentials and separates no release from network failures', async () => {
    const fetcher = vi.fn<ReleaseFetcher>().mockResolvedValue(new Response(JSON.stringify(github()), { status: 200 }));
    await expect(fetchLatestRelease(fetcher)).resolves.toMatchObject({ version: '0.3.0' });
    expect(fetcher.mock.calls[0][0]).toBe(LATEST_RELEASE_API);
    expect(fetcher.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization');
    fetcher.mockResolvedValue(new Response('{}', { status: 404 }));
    await expect(fetchLatestRelease(fetcher)).resolves.toBeUndefined();
    for (const status of [403, 429, 503]) {
      fetcher.mockResolvedValue(new Response('{}', { status }));
      await expect(fetchLatestRelease(fetcher)).rejects.toThrow();
    }
    fetcher.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchLatestRelease(fetcher)).rejects.toThrow('无法连接 GitHub');
  });
  it('times out a stalled check', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<ReleaseFetcher>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
        options!.signal!.addEventListener('abort', () => reject(new Error('aborted')));
      }));
      const result = expect(fetchLatestRelease(fetcher)).rejects.toThrow('超时');
      await vi.advanceTimersByTimeAsync(20000); await result;
    } finally { vi.useRealTimers(); }
  });
  it('honors opt-out and six-hour attempts, recovering after a clock change', () => {
    const now = 10 * AUTO_CHECK_INTERVAL;
    expect(shouldAutoCheck(false, 0, now)).toBe(false);
    expect(shouldAutoCheck(true, 0, now)).toBe(true);
    expect(shouldAutoCheck(true, now - AUTO_CHECK_INTERVAL + 1, now)).toBe(false);
    expect(shouldAutoCheck(true, now - AUTO_CHECK_INTERVAL, now)).toBe(true);
    expect(shouldAutoCheck(true, now + 1, now)).toBe(true);
  });
});
