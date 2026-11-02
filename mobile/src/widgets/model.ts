import { amount, countdown, isSampleStale, percentRemaining } from '../domain/format';
import { PROVIDER_LABELS, type SavedData } from '../domain/types';

export interface WidgetMetric {
  id: string;
  label: string;
  value: string;
  percent?: number;
  resetText: string;
  stale: boolean;
}

export interface WidgetAccount {
  id: string;
  name: string;
  provider: string;
  metrics: WidgetMetric[];
  updatedLabel: string;
  status: string;
  url: string;
}

export interface WidgetData {
  accounts: WidgetAccount[];
  focusId: string;
  threshold: number;
}

const timestamp = (value?: string) => value ? Date.parse(value) : NaN;
const validDate = (value: number) => Number.isFinite(value) && Math.abs(value) <= 8.64e15;

/** Display-only projection: credentials and raw backend payloads never enter the shared group. */
export function widgetData(data: SavedData, now = Date.now()): WidgetData {
  const accounts = [...data.sources].filter(source => source.enabled)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned))
    .map(source => {
      const state = data.states[source.id];
      const snapshot = state?.snapshot;
      const fetched = timestamp(snapshot?.fetchedAt);
      const old = !validDate(fetched) || now - fetched >= 15 * 60_000 || fetched > now + 5 * 60_000;
      const metrics = (snapshot?.metrics ?? []).map(metric => {
        const percent = percentRemaining(metric);
        return {
          id: metric.id, label: metric.label,
          value: metric.unlimited ? '不限额' : amount(metric.remaining, metric.unit, true),
          // Expo writes props directly to UserDefaults; absent values must be omitted.
          ...(percent !== undefined && Number.isFinite(percent) ? { percent } : {}),
          resetText: metric.resetAt ? `${metric.resetEstimated ? '预计 ' : ''}${countdown(metric.resetAt, now)}` : '',
          stale: old || !!state?.error || isSampleStale(metric, now),
        };
      });
      const updatedLabel = validDate(fetched) ? new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(fetched)) : '尚未更新';
      return {
        id: source.id, name: source.name, provider: PROVIDER_LABELS[source.resolvedKind ?? source.kind], metrics, updatedLabel,
        status: state?.error ? '连接待检查' : !snapshot ? '打开应用查询' : metrics.some(metric => metric.stale) ? '待更新' : '上次查询',
        url: `quotadeck:///?sourceId=${encodeURIComponent(source.id)}`,
      };
    });
  return { accounts, focusId: data.preferences.widgetSourceId ?? '', threshold: data.preferences.lowThreshold };
}

export function focusAccount(data: WidgetData): WidgetAccount | undefined {
  return data.accounts.find(account => account.id === data.focusId) ?? data.accounts[0];
}

/** Future entries age the last observation; they never predict a renewed allowance. */
export function widgetTimeline(data: SavedData, now = Date.now()): { date: Date; props: WidgetData }[] {
  const deadlines = new Set<number>([now]);
  for (const source of data.sources.filter(item => item.enabled)) {
    const snapshot = data.states[source.id]?.snapshot;
    for (const date of [timestamp(snapshot?.fetchedAt) + 15 * 60_000,
      ...(snapshot?.metrics.flatMap(metric => [timestamp(metric.sampledAt) + 15 * 60_000 + 1, timestamp(metric.resetAt)]) ?? [])]) {
      if (validDate(date) && date > now && date <= now + 8 * 86400_000) deadlines.add(date);
    }
  }
  return [...deadlines].sort((a, b) => a - b).map(date => ({ date: new Date(date), props: widgetData(data, date) }));
}
