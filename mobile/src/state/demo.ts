import type { QuotaSnapshot, SavedData, Source, UsagePage, UsageRecord } from '../domain/types';
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

export function createDemoUsage(sourceId: string, page: number): UsagePage {
  const now = new Date().toISOString();
  const records: UsageRecord[] = Array.from({ length: 46 }, (_, index) => ({
    id: `demo-usage-${sourceId}-${index}`,
    model: index % 4 === 3 ? 'claude-sonnet-4.5' : 'gpt-5',
    createdAt: new Date(Date.now() - (index * 19 + 2) * 60_000).toISOString(),
    cost: { value: [.034814, .021742, .000028, .023088, .030894][index % 5], unit: 'USD', kind: 'actual' },
    inputTokens: 1410 + index * 87, outputTokens: 2114 - index * 23,
    cacheReadTokens: 108500 + index * 2130, cacheWriteTokens: index % 3 === 0 ? 0 : 1400,
    firstTokenMs: 2720 + index * 130, durationMs: 66200 - index * 431,
    reasoningEffort: index % 4 === 3 ? undefined : 'high', stream: true,
  }));
  const recentOnly = sourceId === 'demo-new';
  return { records: recentOnly ? records : records.slice((page - 1) * 20, page * 20), page,
    ...(!recentOnly && page < 3 ? { nextPage: page + 1 } : {}), recentOnly, fetchedAt: now,
    notice: '界面示例；真实记录的可用范围取决于站点接口与权限。' };
}
