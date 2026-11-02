import type { CustomMapping, QuotaMetric, QuotaSnapshot, Source } from '../domain/types';
import { atPath, date, nonnegative, numeric, object, QuotaError, string, unwrap } from './transport';
import { normalizeAccount } from '../vendor/sub2api-dashboard/account-normalizer';
import { codexQuota, isOpenAiOAuth, localQuota } from '../vendor/sub2api-dashboard/quota-mapper';

const missing = () => new QuotaError('UNSUPPORTED', '这个接口没有提供可读取的额度；可尝试其他接入方式');
const normalizeMetric = (metric: QuotaMetric): QuotaMetric => {
  if (!metric.unlimited && metric.remaining === undefined && metric.limit !== undefined && metric.used !== undefined) metric.remaining = Math.max(0, metric.limit - metric.used);
  return metric;
};

export function parseSub2(raw: unknown, source: Source, now: string): QuotaSnapshot {
  const data = unwrap(raw);
  const subscription = object(data.subscription);
  const metrics: QuotaMetric[] = [];
  for (const [prefix, label, days] of [['daily', '每日额度', 1], ['weekly', '每周额度', 7], ['monthly', '每月额度', 30]] as const) {
    const limit = nonnegative(subscription?.[`${prefix}_limit_usd`]);
    const used = nonnegative(subscription?.[`${prefix}_usage_usd`]);
    if (limit === undefined || used === undefined) continue;
    let resetAt = date(subscription?.[`${prefix}_reset_at`]);
    const start = date(subscription?.[`${prefix}_window_start`]);
    // Monthly windows may use calendar months. Only derive the documented day/week lengths.
    const resetEstimated = !resetAt && !!start && prefix !== 'monthly';
    if (resetEstimated) resetAt = new Date(Date.parse(start!) + days * 86400_000).toISOString();
    metrics.push(normalizeMetric({ id: prefix, label, scope: 'subscription', unit: 'USD', used, limit,
      unlimited: limit === 0, ...(limit > 0 ? { remaining: Math.max(0, limit - used) } : {}), resetAt, resetEstimated, sampledAt: now }));
  }
  const unit = string(data.unit) ?? 'USD';
  const quota = object(data.quota);
  const balance = nonnegative(data.balance);
  if (balance !== undefined) metrics.push({ id: 'wallet', label: '账户余额', scope: 'account', remaining: balance, unit, sampledAt: now });
  const remaining = nonnegative(quota?.remaining) ?? nonnegative(data.remaining);
  if (!metrics.length && (remaining !== undefined || nonnegative(quota?.used) !== undefined)) {
    metrics.push(normalizeMetric({ id: 'key', label: '密钥额度', scope: 'key', unit,
      remaining, used: nonnegative(quota?.used), limit: nonnegative(quota?.limit), sampledAt: now }));
  }
  if (!metrics.length) throw missing();
  // Prefer the weekly window on a compact card; all windows remain visible in details.
  metrics.sort((a, b) => (a.id === 'weekly' ? -1 : b.id === 'weekly' ? 1 : 0));
  const today = object(object(data.usage)?.today);
  const todayValue = nonnegative(today?.actual_cost);
  return { sourceId: source.id, fetchedAt: now, metrics, expiresAt: date(subscription?.expires_at),
    ...(todayValue !== undefined ? { today: { value: todayValue, unit: 'USD' } } : {}) };
}

export function parseAdmin(raw: unknown, source: Source, now: string): QuotaSnapshot {
  const data = unwrap(raw);
  if (numeric(data.id) !== source.accountId) throw new QuotaError('INVALID', '返回的上游账号与所选账号不一致');
  const normalized = normalizeAccount(data);
  // Numeric strings appear in some forks. Normalise only the explicit quota allowlist.
  for (const key of Object.keys(normalized)) {
    if (key.endsWith('_percent') || key.endsWith('_seconds') || key.endsWith('_used') || key.endsWith('_limit')) {
      const n = nonnegative((normalized as Record<string, unknown>)[key]);
      if (n !== undefined) (normalized as Record<string, unknown>)[key] = n;
    }
  }
  for (const key of ['codex_5h_reset_after_seconds', 'codex_7d_reset_after_seconds'] as const) {
    const seconds = nonnegative(normalized[key]);
    if (seconds !== undefined && seconds > 31536_000) delete normalized[key];
  }
  const codex = isOpenAiOAuth(normalized);
  const quota = codex ? codexQuota(normalized, Date.parse(now)) : localQuota(normalized);
  const sampledAt = codex ? date(normalized.codex_usage_updated_at) : now;
  const labels: Record<string, string> = { '5h': '五小时额度', '7d': '七天额度', daily: '每日额度', monthly: '每月额度', total: '账号额度' };
  const extra = object(data.extra);
  const metrics: QuotaMetric[] = quota.windows.map(window => {
    // Preserve an elapsed explicit reset so the UI can show "等待重置确认".
    const explicitReset = date(extra?.[`codex_${window.kind}_reset_at`]);
    const seconds = nonnegative(extra?.[`codex_${window.kind}_reset_after_seconds`]);
    const elapsedReset = sampledAt && seconds !== undefined && seconds <= 31536_000
      ? new Date(Date.parse(sampledAt) + seconds * 1000).toISOString() : undefined;
    return { id: window.kind, label: labels[window.kind] ?? window.kind, scope: 'upstream', unit: codex ? '%' : 'USD',
      used: window.used, limit: window.limit, remaining: Math.max(0, window.limit - window.used),
      resetAt: window.resetsAt ?? explicitReset ?? elapsedReset, sampledAt };
  });
  if (!metrics.length) throw new QuotaError('UNSUPPORTED', '后台尚无额度采样，或当前管理密钥未开放这些字段');
  return { sourceId: source.id, fetchedAt: now, metrics, accountName: string(data.name),
    ...(!sampledAt ? { notice: '后台未提供采样时间，额度新鲜度待确认' } : {}) };
}

export function parseNewApi(raw: unknown, statusRaw: unknown, source: Source, now: string): QuotaSnapshot {
  const data = unwrap(raw);
  const status = unwrap(statusRaw);
  if (data.object !== 'token_usage') throw missing();
  const perUnit = nonnegative(status.quota_per_unit);
  if (!perUnit) throw new QuotaError('INVALID', '站点未提供额度换算比例，无法准确显示金额');
  const mode = string(status.quota_display_type)?.toUpperCase() ?? (status.display_in_currency === false ? 'TOKENS' : 'USD');
  let factor = 1 / perUnit;
  let unit = 'USD';
  if (mode === 'TOKENS') { factor = 1; unit = 'tokens'; }
  if (mode === 'CNY') {
    const rate = nonnegative(status.usd_exchange_rate);
    if (!rate) throw new QuotaError('INVALID', '站点未提供人民币换算比例');
    factor = rate / perUnit; unit = 'CNY';
  }
  if (mode === 'CUSTOM') {
    const rate = nonnegative(status.custom_currency_exchange_rate);
    const symbol = string(status.custom_currency_symbol);
    if (!rate || !symbol) throw new QuotaError('INVALID', '站点未提供自定义单位的换算规则');
    factor = rate / perUnit; unit = symbol;
  }
  const convert = (value: unknown) => { const n = nonnegative(value); return n === undefined ? undefined : n * factor; };
  const remaining = convert(data.total_available);
  const used = convert(data.total_used);
  const limit = convert(data.total_granted);
  if (remaining === undefined && used === undefined && data.unlimited_quota !== true) throw missing();
  const unlimited = data.unlimited_quota === true;
  return { sourceId: source.id, fetchedAt: now, metrics: [{ id: 'key', label: '密钥额度', scope: 'key', unit,
    used, ...(unlimited ? { unlimited: true } : { remaining, limit }), sampledAt: now }] };
}

export function parseOneApi(subscriptionRaw: unknown, usageRaw: unknown, source: Source, now: string): QuotaSnapshot {
  const subscription = unwrap(subscriptionRaw);
  const usage = unwrap(usageRaw);
  const limit = nonnegative(subscription.hard_limit_usd) ?? nonnegative(subscription.system_hard_limit_usd);
  const cents = nonnegative(usage.total_usage);
  if (limit === undefined || cents === undefined) throw missing();
  const unlimited = subscription.unlimited === true;
  return { sourceId: source.id, fetchedAt: now, metrics: [normalizeMetric({ id: 'key', label: '密钥额度', scope: 'key', unit: 'USD',
    used: cents / 100, sampledAt: now, ...(unlimited ? { unlimited: true } : { limit }) })] };
}

export function parseOpenRouter(raw: unknown, source: Source, now: string): QuotaSnapshot {
  const data = unwrap(raw);
  const total = nonnegative(data.total_credits);
  const used = nonnegative(data.total_usage);
  if (total === undefined || used === undefined) throw missing();
  return { sourceId: source.id, fetchedAt: now, metrics: [normalizeMetric({ id: 'wallet', label: '账户余额', scope: 'account', unit: 'USD', limit: total, used, sampledAt: now })] };
}

export function parseDeepSeek(raw: unknown, source: Source, now: string): QuotaSnapshot {
  const data = unwrap(raw);
  if (!Array.isArray(data.balance_infos)) throw missing();
  const metrics = data.balance_infos.flatMap((item, index) => {
    const row = object(item); const remaining = numeric(row?.total_balance); const currency = string(row?.currency);
    return remaining === undefined || !currency ? [] : [{ id: `wallet-${index}`, label: '账户余额', scope: 'account' as const, unit: currency, remaining, sampledAt: now }];
  });
  if (!metrics.length) throw missing();
  return { sourceId: source.id, fetchedAt: now, metrics };
}

export function validateMapping(mapping: CustomMapping): void {
  if (!Number.isFinite(mapping.scale) || mapping.scale <= 0 || mapping.scale > 1e12) throw new QuotaError('CONFIG', '换算倍率必须是大于 0 的有效数字');
  if (!mapping.unit.trim() || mapping.unit.length > 16) throw new QuotaError('CONFIG', '请输入有效的额度单位');
  if (!mapping.remainingPath.trim()) throw new QuotaError('CONFIG', '请填写剩余额度的字段路径');
  for (const path of [mapping.remainingPath, mapping.usedPath, mapping.limitPath, mapping.resetPath, mapping.sampledPath]) if (path) atPath({}, path);
}

export function parseCustom(raw: unknown, mapping: CustomMapping, source: Source, now: string): QuotaSnapshot {
  validateMapping(mapping);
  const remaining = numeric(atPath(raw, mapping.remainingPath));
  if (remaining === undefined) throw new QuotaError('INVALID', '指定字段未返回有效的剩余额度');
  const used = nonnegative(atPath(raw, mapping.usedPath));
  const limit = nonnegative(atPath(raw, mapping.limitPath));
  return { sourceId: source.id, fetchedAt: now, metrics: [{ id: 'custom', label: '可用额度', scope: 'account', unit: mapping.unit,
    remaining: remaining * mapping.scale, used: used === undefined ? undefined : used * mapping.scale,
    limit: limit === undefined ? undefined : limit * mapping.scale, resetAt: date(atPath(raw, mapping.resetPath)),
    sampledAt: mapping.sampledPath ? date(atPath(raw, mapping.sampledPath)) : now }] };
}
