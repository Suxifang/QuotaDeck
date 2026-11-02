import { Directory, File, Paths } from 'expo-file-system';
import { createDownloadResumable, FileSystemSessionType, type DownloadResumable } from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import { compareVersions, InvalidDownloadError, validateRelease, verifyAssetBytes, type ReleaseInfo } from './releases';
import type { DownloadJob } from './files';

const directory = () => new Directory(Paths.cache, 'yudu-updates');
const metadata = () => new File(directory(), 'release.json');
const payload = (release: ReleaseInfo) => new File(directory(), release.filename);
const partial = () => new File(directory(), 'download.part');

async function verify(release: ReleaseInfo, file: File) {
  if (!file.exists || file.size !== release.size) throw new Error('更新包已丢失或不完整，请重新下载');
  await verifyAssetBytes(release, await file.bytes(), async bytes => {
    const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  });
}

export async function clearDownload(): Promise<void> {
  const folder = directory(); if (folder.exists) folder.delete();
}

export async function restoreDownload(currentVersion: string): Promise<ReleaseInfo | undefined> {
  try {
    if (partial().exists) partial().delete();
    if (!metadata().exists) { await clearDownload(); return; }
    const release = validateRelease(JSON.parse(await metadata().text()));
    if (compareVersions(release.version, currentVersion) <= 0) { await clearDownload(); return; }
    await verify(release, payload(release));
    return release;
  } catch { await clearDownload(); return; }
}

export function downloadRelease(release: ReleaseInfo, progress: (bytes: number) => void, verifying: () => void): DownloadJob {
  let task: DownloadResumable | undefined; let cancelled = false; let timeout = false; let oversized = false;
  const cancel = async () => { cancelled = true; if (task) await task.cancelAsync(); };
  const promise = (async () => {
    validateRelease(release);
    const timer = setTimeout(() => { timeout = true; void cancel().catch(() => {}); }, 10 * 60 * 1000);
    try {
      await clearDownload(); directory().create({ intermediates: true, idempotent: true });
      if (cancelled) throw new Error('下载已取消');
      let lastProgress = 0;
      task = createDownloadResumable(release.downloadUrl, partial().uri, { sessionType: FileSystemSessionType.FOREGROUND }, data => {
        if (data.totalBytesWritten > release.size) { oversized = true; void cancel().catch(() => {}); return; }
        if (Date.now() - lastProgress >= 100 || data.totalBytesWritten === release.size) {
          lastProgress = Date.now(); progress(data.totalBytesWritten);
        }
      });
      const result = await task.downloadAsync();
      if (cancelled || !result) throw new Error('下载已取消');
      if (result.status !== 200) throw new Error(`下载失败（${result.status}），请稍后重试`);
      verifying();
      await verify(release, partial());
      if (cancelled) throw new Error('下载已取消');
      partial().move(payload(release));
      metadata().write(JSON.stringify(release));
    } catch (error) {
      await clearDownload();
      if (oversized) throw new Error('下载大小超出发行信息，文件已丢弃');
      if (timeout) throw new Error('下载超时，请保持应用在前台后重试');
      if (cancelled) throw new Error('下载已取消');
      throw error instanceof Error ? error : new Error('下载中断，请保持应用在前台后重试');
    } finally { clearTimeout(timer); }
  })();
  return { promise, cancel };
}

export async function shareDownload(release: ReleaseInfo): Promise<void> {
  try { await verify(release, payload(release)); }
  catch (error) { await clearDownload(); throw new InvalidDownloadError(error instanceof Error ? error.message : '更新包已失效，请重新下载'); }
  if (!await Sharing.isAvailableAsync()) throw new Error('系统分享暂不可用，请稍后重试');
  // Keep the .ipa extension. A ZIP UTI would append .zip and hide compatible signing apps.
  await Sharing.shareAsync(payload(release).uri, { dialogTitle: '用 LCSign 打开余度更新包' });
}
