import type { QuotaSnapshot, SavedData, Source } from '../domain/types';
import { DEFAULT_PREFERENCES } from '../domain/types';

/** Explicit, opt-in sample data. Never sent to a network endpoint or mixed with saved accounts. */
export function createDemo(): SavedData {
  const now = new Date().toISOString();
  const after = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();
  const sources: Source[] = [
    { id: 'demo-pro', connectionId: 'demo-pro', name: 'Pro 工作站', baseUrl: 'https://pro.example.invalid', kind: 'sub2api', pinned: true, enabled: true },
    { id: 'demo-plus', connectionId: 'demo-plus', name: 'Plus 私人反代', baseUrl: 'https://plus.example.invalid', kind: 'sub2-admin', accountId: 1, pinned: true, enabled: true },
    { id: 'demo-new', connectionId: 'demo-new', name: '日常 API', baseUrl: 'https://api.example.invalid', kind: 'newapi', pinned: false, enabled: true },
  ];
  const snapshots: QuotaSnapshot[] = [
    { sourceId: sources[0].id, fetchedAt: now, today: { value: 5.43, unit: 'USD' }, metrics: [
      { id: 'weekly', label: '每周额度', scope: 'subscription', remaining: 594.57, limit: 600, used: 5.43, unit: 'USD', resetAt: after(86), sampledAt: now },
    ] },
    { sourceId: sources[1].id, fetchedAt: now, metrics: [
      { id: '5h', label: '五小时额度', scope: 'upstream', remaining: 82, used: 18, limit: 100, unit: '%', resetAt: after(3.4), sampledAt: now },
      { id: '7d', label: '七天额度', scope: 'upstream', remaining: 16, used: 84, limit: 100, unit: '%', resetAt: after(29), sampledAt: now },
    ] },
    { sourceId: sources[2].id, fetchedAt: now, metrics: [
      { id: 'key', label: '密钥额度', scope: 'key', remaining: 28.64, used: 21.36, limit: 50, unit: 'USD', sampledAt: now },
    ] },
  ];
  const history = Object.fromEntries(sources.map((source, index) => [source.id, Array.from({ length: 7 }, (_, day) => {
    const stamp = new Date(Date.now() - (6 - day) * 86400_000).toISOString();
    return { date: stamp.slice(0, 10), metrics: snapshots[index].metrics.map(metric => ({ id: metric.id, unit: metric.unit,
      remaining: (metric.remaining ?? 0) + (6 - day) * (index === 0 ? 0.8 : index === 1 ? 2 : 1.1), used: metric.used })) };
  })]));
  return { version: 1, sources, states: Object.fromEntries(snapshots.map(snapshot => [snapshot.sourceId, { snapshot }])), history, preferences: { ...DEFAULT_PREFERENCES } };
}
