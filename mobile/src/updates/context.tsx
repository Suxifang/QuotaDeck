import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import config from '../../app.json';
import { assetKey, compareVersions, fetchLatestRelease, InvalidDownloadError, shouldAutoCheck, type ReleaseInfo } from './releases';
import { clearDownload, downloadRelease, restoreDownload, shareDownload, type DownloadJob } from './files';

export const APP_VERSION = config.expo.version;
const STORAGE_KEY = 'quotadeck.updates.v1';
type Operation = 'idle' | 'checking' | 'downloading' | 'verifying' | 'sharing' | 'clearing';
interface UpdateState {
  loaded: boolean; autoCheck: boolean; lastAttempt: number; lastChecked: number;
  operation: Operation; release?: ReleaseInfo; downloaded: boolean; bytes: number;
  message: string; error: string;
}
const initial: UpdateState = { loaded: false, autoCheck: false, lastAttempt: 0, lastChecked: 0, operation: 'idle', downloaded: false, bytes: 0, message: '', error: '' };

function useUpdateController() {
  const [state, setState] = useState<UpdateState>(initial);
  const ref = useRef(state); const busy = useRef(false); const job = useRef<DownloadJob | undefined>(undefined);
  const pendingSave = useRef(Promise.resolve());
  const update = useCallback((patch: Partial<UpdateState>) => { ref.current = { ...ref.current, ...patch }; setState(ref.current); }, []);
  const persist = useCallback(() => {
    const { autoCheck, lastAttempt, lastChecked } = ref.current;
    pendingSave.current = pendingSave.current.catch(() => {}).then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ autoCheck, lastAttempt, lastChecked })));
    void pendingSave.current.catch(() => update({ error: '更新偏好保存失败，请检查设备存储空间' }));
  }, [update]);

  const check = useCallback(async (automatic = false) => {
    if (!ref.current.loaded || busy.current || (automatic && !shouldAutoCheck(ref.current.autoCheck, ref.current.lastAttempt))) return;
    busy.current = true;
    update({ operation: 'checking', error: '', message: '', lastAttempt: Date.now() }); persist();
    try {
      const release = await fetchLatestRelease();
      const newer = release && compareVersions(release.version, APP_VERSION) > 0 ? release : undefined;
      const downloaded = !!(newer && ref.current.downloaded && ref.current.release && assetKey(newer) === assetKey(ref.current.release));
      if (!downloaded && ref.current.downloaded) await clearDownload();
      update({ release: newer, downloaded, lastChecked: Date.now(), message: newer ? `发现新版本 ${newer.version}` : release ? '已是最新版本' : '暂未发布正式版本' });
      persist();
    } catch (error) { update({ error: error instanceof Error ? error.message : '检查更新失败，请稍后重试' }); }
    finally { busy.current = false; update({ operation: 'idle' }); }
  }, [persist, update]);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      let prefs: Partial<UpdateState> = {};
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          prefs = { autoCheck: data.autoCheck === true, lastAttempt: typeof data.lastAttempt === 'number' && Number.isFinite(data.lastAttempt) ? data.lastAttempt : 0,
            lastChecked: typeof data.lastChecked === 'number' && Number.isFinite(data.lastChecked) ? data.lastChecked : 0 };
        }
      } catch { prefs = { error: '更新偏好读取失败，可手动检查更新' }; }
      let cached: ReleaseInfo | undefined;
      try { cached = await restoreDownload(APP_VERSION); } catch { prefs.error = '更新缓存读取失败，请重新下载'; }
      if (disposed) return;
      update({ ...prefs, loaded: true, release: cached, downloaded: !!cached });
      void check(true);
    })();
    const listener = AppState.addEventListener('change', next => { if (next === 'active') void check(true); });
    return () => { disposed = true; listener.remove(); };
  }, [check, update]);

  const setAutoCheck = useCallback((enabled: boolean) => { update({ autoCheck: enabled }); persist(); if (enabled) void check(true); }, [check, persist, update]);
  const download = useCallback(async () => {
    const release = ref.current.release;
    if (!release || busy.current) return;
    busy.current = true; update({ operation: 'downloading', bytes: 0, downloaded: false, error: '', message: '' });
    try {
      const active = downloadRelease(release, bytes => update({ bytes }), () => update({ operation: 'verifying' }));
      job.current = active; await active.promise;
      update({ downloaded: true, bytes: release.size, message: '更新包已校验，可导入 LCSign' });
    } catch (error) { update({ error: error instanceof Error ? error.message : '下载中断，请保持应用在前台后重试' }); }
    finally { job.current = undefined; busy.current = false; update({ operation: 'idle' }); }
  }, [update]);
  const cancel = useCallback(async () => { try { await job.current?.cancel(); } catch { update({ error: '暂时无法取消，请稍后重试' }); } }, [update]);
  const share = useCallback(async () => {
    const release = ref.current.release;
    if (!release || !ref.current.downloaded || busy.current) return;
    busy.current = true; update({ operation: 'sharing', error: '', message: '' });
    try {
      await shareDownload(release);
      update({ message: '分享面板已关闭；安装结果请以 LCSign 和新版启动为准' });
    } catch (error) { update({ ...(error instanceof InvalidDownloadError ? { downloaded: false, bytes: 0 } : {}), error: error instanceof Error ? error.message : '暂时无法导入，请重试' }); }
    finally { busy.current = false; update({ operation: 'idle' }); }
  }, [update]);
  const clear = useCallback(async () => {
    if (busy.current) return;
    busy.current = true; update({ operation: 'clearing', error: '' });
    try { await clearDownload(); update({ downloaded: false, bytes: 0, message: '更新包缓存已清理' }); }
    catch { update({ error: '缓存清理失败，请稍后重试' }); }
    finally { busy.current = false; update({ operation: 'idle' }); }
  }, [update]);
  return { ...state, check, setAutoCheck, download, cancel, share, clear };
}

type UpdateController = ReturnType<typeof useUpdateController>;
const UpdateContext = createContext<UpdateController | undefined>(undefined);
export function UpdateProvider({ children }: React.PropsWithChildren) {
  const controller = useUpdateController();
  return <UpdateContext.Provider value={controller}>{children}</UpdateContext.Provider>;
}
export function useUpdates() {
  const updates = useContext(UpdateContext);
  if (!updates) throw new Error('Missing UpdateProvider');
  return updates;
}
