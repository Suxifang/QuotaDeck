import { nonnegative, QuotaError, string, unwrap } from './transport';

/** Shared by balances and logs; site settings are the only conversion authority. */
export function newApiCurrency(raw: unknown): { factor: number; unit: string } {
  const status = unwrap(raw);
  const perUnit = nonnegative(status.quota_per_unit);
  if (!perUnit) throw new QuotaError('INVALID', '站点未提供额度换算比例，无法准确显示金额');
  const mode = string(status.quota_display_type)?.toUpperCase() ?? (status.display_in_currency === false ? 'TOKENS' : 'USD');
  if (mode === 'TOKENS') return { factor: 1, unit: 'tokens' };
  if (mode === 'USD') return { factor: 1 / perUnit, unit: 'USD' };
  if (mode === 'CNY') {
    const rate = nonnegative(status.usd_exchange_rate);
    if (!rate) throw new QuotaError('INVALID', '站点未提供人民币换算比例');
    return { factor: rate / perUnit, unit: 'CNY' };
  }
  if (mode === 'CUSTOM') {
    const rate = nonnegative(status.custom_currency_exchange_rate);
    const unit = string(status.custom_currency_symbol);
    if (!rate || !unit) throw new QuotaError('INVALID', '站点未提供自定义单位的换算规则');
    return { factor: rate / perUnit, unit };
  }
  throw new QuotaError('UNSUPPORTED', '站点使用了尚未支持的额度单位');
}
