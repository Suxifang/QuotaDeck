import type { QuotaMetric, QuotaSnapshot } from './types';

export function percentRemaining(metric: QuotaMetric): number | undefined {
  if (metric.unlimited) return undefined;
  if (metric.unit === '%' && metric.remaining !== undefined) return Math.min(100, Math.max(0, metric.remaining));
  if (metric.remaining !== undefined && metric.limit !== undefined && metric.limit > 0) {
    return Math.min(100, Math.max(0, metric.remaining / metric.limit * 100));
  }
  return undefined;
}

export function amount(value: number | undefined, unit: string, compact = false): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  const digits = unit === '%' || unit === 'tokens' || unit === 'requests' ? 0 : 2;
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits,
    ...(compact && value >= 10000 ? { notation: 'compact' as const, minimumFractionDigits: 0 } : {}) }).format(value);
  if (unit === 'USD') return `$${formatted}`;
  if (unit === 'CNY') return `¥${formatted}`;
  if (unit === '%') return `${formatted}%`;
  return `${formatted} ${unit}`;
}

export function isExpired(metric: QuotaMetric, now = Date.now()): boolean {
  return !!metric.resetAt && Date.parse(metric.resetAt) <= now;
}

export function isSampleStale(metric: QuotaMetric, now = Date.now()): boolean {
  const sampled = metric.sampledAt ? Date.parse(metric.sampledAt) : NaN;
  return isExpired(metric, now) || (metric.scope === 'upstream' && (!Number.isFinite(sampled) || now - sampled > 15 * 60_000 || sampled > now + 5 * 60_000));
}

export function countdown(resetAt: string | undefined, now = Date.now()): string {
  if (!resetAt) return '未提供重置时间';
  const delta = Date.parse(resetAt) - now;
  if (!Number.isFinite(delta)) return '未提供重置时间';
  if (delta <= 0) return '等待重置确认';
  const minutes = Math.ceil(delta / 60_000);
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)} 天 ${Math.floor(minutes % 1440 / 60)} 小时后重置`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分后重置`;
  return `${minutes} 分钟后重置`;
}

export function relativeTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '尚未更新';
  const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(seconds)) return '尚未更新';
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}

export function attention(snapshot: QuotaSnapshot | undefined, threshold: number): boolean {
  return !!snapshot?.metrics.some(metric => !isSampleStale(metric) && (percentRemaining(metric) ?? 101) <= threshold);
}

export function hostLabel(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}
