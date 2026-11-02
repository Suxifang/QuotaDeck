import type { UsageRecord } from './types';

export function usageCost(cost: UsageRecord['cost']): string {
  if (!cost || !Number.isFinite(cost.value)) return '—';
  const currency = cost.unit === 'USD' ? '$' : cost.unit === 'CNY' ? '¥' : '';
  const digits = cost.unit === 'tokens' ? 0 : 6;
  if (cost.value > 0 && cost.value < 10 ** -digits) return `<${currency}${(10 ** -digits).toFixed(digits)}${currency ? '' : ` ${cost.unit}`}`;
  const value = new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: currency ? 2 : 0 }).format(cost.value);
  return currency ? `${currency}${value}` : `${value} ${cost.unit}`;
}

export function tokenCount(value?: number): string {
  return value === undefined ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export function duration(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.floor(value / 60_000)} 分 ${Math.floor(value % 60_000 / 1000)} 秒`;
}

export function usageDay(iso?: string): string {
  if (!iso) return '时间未提供';
  const date = new Date(iso);
  const today = new Date();
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(date, today)) return '今天';
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (same(date, yesterday)) return '昨天';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function usageTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '时间未提供';
}
