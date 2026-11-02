export const RELEASE_REPOSITORY = 'Suxifang/QuotaDeck';
export const RELEASES_URL = `https://github.com/${RELEASE_REPOSITORY}/releases`;
export const LATEST_RELEASE_API = `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/latest`;
export const AUTO_CHECK_INTERVAL = 6 * 60 * 60 * 1000;
export const MAX_IPA_BYTES = 128 * 1024 * 1024;
export class InvalidDownloadError extends Error {}

export interface ReleaseInfo {
  version: string;
  tag: string;
  name: string;
  notes: string;
  pageUrl: string;
  publishedAt: string;
  assetId: number;
  filename: string;
  downloadUrl: string;
  size: number;
  sha256: string;
}

function versionParts(version: string): number[] {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('版本号格式不受支持');
  const parts = version.split('.').map(Number);
  if (parts.some(part => !Number.isSafeInteger(part))) throw new Error('版本号格式不受支持');
  return parts;
}

export function compareVersions(a: string, b: string): number {
  const left = versionParts(a); const right = versionParts(b);
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  return 0;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('版本信息不完整，请稍后重试');
  return value as Record<string, unknown>;
}

/** Revalidate persisted metadata too; no cached URL becomes a new trust source. */
export function validateRelease(value: unknown): ReleaseInfo {
  const data = record(value);
  if (typeof data.version !== 'string') throw new Error('版本信息缺少版本号');
  versionParts(data.version);
  const tag = `v${data.version}`;
  const filename = `Yudu-${data.version}.ipa`;
  if (data.tag !== tag || data.filename !== filename || data.pageUrl !== `${RELEASES_URL}/tag/${tag}` ||
    data.downloadUrl !== `https://github.com/${RELEASE_REPOSITORY}/releases/download/${tag}/${filename}`) {
    throw new Error('更新包来源与正式发行版本不一致');
  }
  if (!Number.isSafeInteger(data.assetId) || Number(data.assetId) <= 0 || !Number.isSafeInteger(data.size) || Number(data.size) <= 0 || Number(data.size) > MAX_IPA_BYTES) {
    throw new Error('更新包大小或编号不受支持');
  }
  if (typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.sha256)) throw new Error('发行版本尚未提供 SHA-256 校验，暂不能下载');
  if (typeof data.publishedAt !== 'string' || !Number.isFinite(Date.parse(data.publishedAt))) throw new Error('版本发布时间无效');
  if (typeof data.name !== 'string' || typeof data.notes !== 'string') throw new Error('版本说明无效');
  return { version: data.version, tag, filename, pageUrl: data.pageUrl, downloadUrl: data.downloadUrl, assetId: Number(data.assetId),
    size: Number(data.size), sha256: data.sha256, publishedAt: data.publishedAt, name: data.name.slice(0, 120), notes: data.notes.slice(0, 12000) };
}

export function parseGitHubRelease(value: unknown): ReleaseInfo {
  const data = record(value);
  if (data.draft !== false || data.prerelease !== false) throw new Error('只接受已发布的正式版本');
  if (typeof data.tag_name !== 'string' || !data.tag_name.startsWith('v')) throw new Error('发行标签无效');
  if (!Array.isArray(data.assets)) throw new Error('该版本尚未上传安装包');
  const ipas = data.assets.map(record).filter(asset => typeof asset.name === 'string' && /\.ipa$/i.test(asset.name));
  if (ipas.length !== 1) throw new Error('该版本的 IPA 缺失或不唯一，请稍后重试');
  const asset = ipas[0];
  if (asset.state !== 'uploaded') throw new Error('更新包还未上传完成');
  const sha256 = typeof asset.digest === 'string' && /^sha256:[a-f\d]{64}$/i.test(asset.digest) ? asset.digest.slice(7).toLowerCase() : '';
  return validateRelease({ version: data.tag_name.slice(1), tag: data.tag_name, filename: asset.name,
    name: typeof data.name === 'string' ? data.name : data.tag_name, notes: typeof data.body === 'string' ? data.body : '',
    pageUrl: data.html_url, publishedAt: data.published_at, assetId: asset.id, downloadUrl: asset.browser_download_url, size: asset.size, sha256 });
}

export type ReleaseFetcher = (url: string, options: RequestInit) => Promise<Response>;
export async function fetchLatestRelease(fetcher: ReleaseFetcher = fetch): Promise<ReleaseInfo | undefined> {
  const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 20000);
  try {
    const response = await fetcher(LATEST_RELEASE_API, { signal: abort.signal, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    if (response.status === 404) return undefined;
    if (response.status === 403 || response.status === 429) throw new Error('GitHub 暂时限制了请求，请稍后再检查');
    if (!response.ok) throw new Error(`版本服务暂时不可用（${response.status}）`);
    return parseGitHubRelease(await response.json());
  } catch (error) {
    if (abort.signal.aborted) throw new Error('检查更新超时，请检查网络后重试');
    if (error instanceof TypeError) throw new Error('无法连接 GitHub，请检查网络后重试');
    throw error;
  } finally { clearTimeout(timer); }
}

export async function verifyAssetBytes(release: ReleaseInfo, bytes: Uint8Array, hash: (bytes: Uint8Array) => Promise<string>): Promise<void> {
  validateRelease(release);
  if (bytes.byteLength !== release.size) throw new Error('下载大小不一致，请重新下载');
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) throw new Error('下载内容不是有效的 IPA 文件');
  if (await hash(bytes) !== release.sha256) throw new Error('SHA-256 校验未通过，文件已丢弃，请重新下载');
}

export function shouldAutoCheck(enabled: boolean, lastAttempt: number, now = Date.now()): boolean {
  return enabled && (!lastAttempt || now < lastAttempt || now - lastAttempt >= AUTO_CHECK_INTERVAL);
}

export function assetKey(release: ReleaseInfo): string { return `${release.tag}:${release.assetId}:${release.sha256}:${release.size}`; }
export function formatBytes(bytes: number): string { return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
