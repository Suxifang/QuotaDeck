import type { ReleaseInfo } from './releases';

export interface DownloadJob { promise: Promise<void>; cancel: () => Promise<void> }
export async function restoreDownload(_currentVersion: string): Promise<ReleaseInfo | undefined> { return undefined; }
export async function clearDownload(): Promise<void> { /* Native-only cache. */ }
export function downloadRelease(_release: ReleaseInfo, _progress: (bytes: number) => void, _verifying: () => void): DownloadJob {
  return { promise: Promise.reject(new Error('请在 iPhone 版中下载并校验安装包')), cancel: async () => {} };
}
export async function shareDownload(_release: ReleaseInfo): Promise<void> { throw new Error('请在 iPhone 版中导入 LCSign'); }
