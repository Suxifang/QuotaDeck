import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Credential, HistoryPoint, Preferences, SavedData, Source } from '../domain/types';
import { DEFAULT_PREFERENCES } from '../domain/types';
import { isSampleStale } from '../domain/format';
import { fetchSnapshot, refreshSession } from '../providers/registry';
import { QuotaError } from '../providers/transport';
import { createDemo } from './demo';
import { deleteCredential, EMPTY_DATA, readCredential, readData, saveData, writeCredential } from './storage';
import { createSessionRenewal } from './session';
import { syncWidgets } from '../widgets/sync';
import type { WidgetSyncResult } from '../widgets/publisher';
import { fetchUsage } from '../providers/usage';
import { createUsageReader } from './usage-reader';

export function useQuota() {
  const [saved, setSaved] = useState<SavedData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [widgetError, setWidgetError] = useState('');
  const [widgetSyncing, setWidgetSyncing] = useState(false);
  const [widgetSyncResult, setWidgetSyncResult] = useState<WidgetSyncResult>();
  const widgetRequest = useRef(0);
  const [demo, setDemo] = useState<SavedData | null>(null);
  const ref = useRef(saved);
  const refreshing = useRef(new Map<string, symbol>());
  const generations = useRef(new Map<string, number>());
  const sessions = useRef(createSessionRenewal({ read: readCredential, write: writeCredential, refresh: refreshSession }));

  const update = useCallback((change: (data: SavedData) => SavedData) => {
    const next = change(ref.current);
    ref.current = next; setSaved(next);
    saveData(next).catch(() => setStorageError('本机配置保存失败，请检查设备存储空间'));
  }, []);

  const renew = useCallback(async (source: Source, credential: Credential) => {
    return sessions.current.renew(source, credential);
  }, []);

  const loadUsage = useRef(createUsageReader({
    source: id => ref.current.sources.find(source => source.id === id),
    generation: id => generations.current.get(id) ?? 0,
    read: readCredential, renew, fetch: fetchUsage,
  })).current;

  const refreshOne = useCallback(async (id: string) => {
    const source = ref.current.sources.find(item => item.id === id);
    if (!source?.enabled || refreshing.current.has(id)) return;
    const token = Symbol(id);
    refreshing.current.set(id, token);
    const generation = generations.current.get(source.connectionId) ?? 0;
    update(data => ({ ...data, states: { ...data.states, [id]: { ...data.states[id], refreshing: true } } }));
    const stillValid = () => refreshing.current.get(id) === token && (generations.current.get(source.connectionId) ?? 0) === generation && ref.current.sources.some(item => item.id === id && item.enabled && item.connectionId === source.connectionId);
    try {
      let credential = await readCredential(source.connectionId);
      if (!credential) throw new QuotaError('AUTH', '请重新连接这个站点');
      if (credential.mode === 'session' && (!credential.expiresAt || Date.parse(credential.expiresAt) <= Date.now() + 60_000)) credential = await renew(source, credential);
      let result;
      try { result = await fetchSnapshot(source, credential); }
      catch (error) {
        if (error instanceof QuotaError && error.code === 'AUTH' && credential.mode === 'session') result = await fetchSnapshot(source, await renew(source, credential));
        else throw error;
      }
      if (!stillValid()) return;
      const { snapshot, kind } = result;
      update(data => {
        const stamp = new Date(snapshot.fetchedAt);
        const date = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(stamp.getDate()).padStart(2, '0')}`;
        const metrics = snapshot.metrics.filter(metric => !isSampleStale(metric)).map(({ id: metricId, remaining, used, unit }) => ({ id: metricId, remaining, used, unit }));
        const points = data.history[id] ?? [];
        const history: HistoryPoint[] = metrics.length ? [...points.filter(point => point.date !== date), { date, metrics }].slice(-90) : points;
        return { ...data, sources: data.sources.map(item => item.id === id ? { ...item, resolvedKind: kind } : item),
          states: { ...data.states, [id]: { snapshot, refreshing: false, checkedAt: new Date().toISOString() } }, history: { ...data.history, [id]: history } };
      });
    } catch (error) {
      if (stillValid()) update(data => ({ ...data, states: { ...data.states, [id]: { ...data.states[id], refreshing: false,
        error: error instanceof QuotaError ? error.message : '暂时无法读取这个站点，请稍后重试',
        errorCode: error instanceof QuotaError ? error.code : 'NETWORK', checkedAt: new Date().toISOString() } } }));
    } finally { if (refreshing.current.get(id) === token) refreshing.current.delete(id); }
  }, [renew, update]);

  const refreshAll = useCallback(async () => {
    // Small batches avoid flooding a shared backend when many accounts are followed.
    const sources = ref.current.sources.filter(source => source.enabled);
    for (let i = 0; i < sources.length; i += 3) await Promise.allSettled(sources.slice(i, i + 3).map(source => refreshOne(source.id)));
  }, [refreshOne]);

  useEffect(() => {
    let alive = true;
    readData().then(data => { if (alive) { ref.current = data; setSaved(data); } })
      .catch(() => { if (alive) setStorageError('本机配置未能恢复，原数据仍保留，请重新打开应用后重试'); })
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  const publishWidgets = useCallback(async (force = false) => {
    const request = ++widgetRequest.current;
    setWidgetSyncing(true);
    try {
      const result = await syncWidgets(ref.current, force);
      if (request === widgetRequest.current) { setWidgetSyncResult(result); setWidgetError(''); }
    } catch (error) {
      if (request === widgetRequest.current) setWidgetError(error instanceof Error ? error.message : '小组件暂未同步，重新打开应用后会重试');
    } finally { if (request === widgetRequest.current) setWidgetSyncing(false); }
  }, []);

  const demoActive = !!demo;
  useEffect(() => {
    if (!ready) return;
    void publishWidgets();
  }, [ready, saved, publishWidgets]);
  useEffect(() => {
    if (!ready) return;
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void publishWidgets(true); });
    return () => subscription.remove();
  }, [ready, publishWidgets]);
  useEffect(() => {
    if (!ready || demoActive) return;
    void refreshAll();
    const timer = setInterval(() => { if (AppState.currentState === 'active' || AppState.currentState === null) void refreshAll(); }, saved.preferences.refreshSeconds * 1000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refreshAll(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [ready, demoActive, saved.preferences.refreshSeconds, refreshAll]);

  const addSources = useCallback(async (sources: Source[], credential: Credential) => {
    if (!sources.length) return;
    await writeCredential(sources[0].connectionId, credential);
    update(data => ({ ...data, sources: [...data.sources, ...sources] }));
    setDemo(null);
    await Promise.allSettled(sources.map(source => refreshOne(source.id)));
  }, [refreshOne, update]);

  const changeSource = useCallback((id: string, patch: Partial<Pick<Source, 'name' | 'pinned' | 'enabled'>>) => {
    if (patch.enabled === false) refreshing.current.delete(id);
    update(data => ({ ...data, sources: data.sources.map(source => source.id === id ? { ...source, ...patch } : source),
      states: patch.enabled === false ? { ...data.states, [id]: { ...data.states[id], refreshing: false } } : data.states }));
    if (patch.enabled) void refreshOne(id);
  }, [update, refreshOne]);

  const removeSource = useCallback(async (id: string) => {
    const source = ref.current.sources.find(item => item.id === id);
    if (!source) return;
    const unused = !ref.current.sources.some(item => item.id !== id && item.connectionId === source.connectionId);
    if (unused) {
      sessions.current.invalidate(source.connectionId);
      generations.current.set(source.connectionId, (generations.current.get(source.connectionId) ?? 0) + 1);
    }
    update(data => ({ ...data, sources: data.sources.filter(item => item.id !== id),
      states: Object.fromEntries(Object.entries(data.states).filter(([key]) => key !== id)), history: Object.fromEntries(Object.entries(data.history).filter(([key]) => key !== id)) }));
    if (unused) await deleteCredential(source.connectionId);
  }, [update]);

  const reconnect = useCallback(async (connectionId: string, credential: Credential) => {
    sessions.current.invalidate(connectionId);
    generations.current.set(connectionId, (generations.current.get(connectionId) ?? 0) + 1);
    await writeCredential(connectionId, credential);
    const sources = ref.current.sources.filter(source => source.connectionId === connectionId);
    sources.forEach(source => refreshing.current.delete(source.id));
    await Promise.allSettled(sources.map(source => refreshOne(source.id)));
  }, [refreshOne]);

  const changePreferences = useCallback((patch: Partial<Preferences>) => update(data => ({ ...data, preferences: { ...data.preferences, ...patch } })), [update]);
  return { data: demo ? { ...demo, preferences: saved.preferences } : saved, saved, ready, storageError, widgetError, widgetSyncing, widgetSyncResult, publishWidgets,
    isDemo: !!demo, enterDemo: () => setDemo(createDemo()), exitDemo: () => setDemo(null),
    refreshAll: async () => { if (demo) setDemo(createDemo()); else await refreshAll(); },
    refreshOne, loadUsage, addSources, changeSource, removeSource, reconnect, changePreferences,
    clearHistory: () => update(data => ({ ...data, history: {} })), DEFAULT_PREFERENCES };
}

export type QuotaController = ReturnType<typeof useQuota>;
