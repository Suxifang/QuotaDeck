import type { Credential, Source, UsagePage, UsageRecord } from '../domain/types';
import { newApiCurrency } from './currency';
import { detectProvider, request } from './registry';
import { date, nonnegative, object, QuotaError, type Requester, string, unwrap } from './transport';

export const USAGE_PAGE_SIZE = 20;
const integer = (value: unknown) => { const n = nonnegative(value); return n !== undefined && Number.isSafeInteger(n) ? n : undefined; };
const label = (value: unknown) => string(value)?.slice(0, 160);

export function parseAdminUsage(raw: unknown, source: Source, page: number, now: string): UsagePage {
  if (!source.accountId) throw new QuotaError('CONFIG', '请先选择要查看记录的上游账号');
  return parseSub2Usage(raw, { field: 'account_id', id: source.accountId }, page, now);
}

export function parseUserUsage(raw: unknown, credential: Credential, page: number, now: string): UsagePage {
  if (!credential.apiKeyId || !credential.userId) throw new QuotaError('AUTH', '请登录站点并关联当前密钥');
  return parseSub2Usage(raw, { field: 'api_key_id', id: credential.apiKeyId, userId: credential.userId }, page, now);
}

function parseSub2Usage(raw: unknown, scope: { field: 'account_id' | 'api_key_id'; id: number; userId?: number }, page: number, now: string): UsagePage {
  const data = unwrap(raw);
  if (!Array.isArray(data.items) || data.items.length > 200) throw new QuotaError('INVALID', '站点没有返回有效的使用记录列表');
  if (data.page !== undefined && integer(data.page) !== page) throw new QuotaError('INVALID', '站点返回的记录页码不一致，请刷新重试');
  const size = integer(data.page_size) ?? USAGE_PAGE_SIZE;
  if (!size || size > 200 || data.items.length > size) throw new QuotaError('INVALID', '站点返回的记录分页格式不兼容');
  const records: UsageRecord[] = data.items.map(row => {
    const item = object(row);
    const id = integer(item?.id);
    // Reject forks that ignore the filter; never silently show wider-scope records.
    if (!item || !id || integer(item[scope.field]) !== scope.id || (scope.userId !== undefined && integer(item.user_id) !== scope.userId)) {
      throw new QuotaError('INVALID', scope.field === 'account_id' ? '记录与所选上游账号不一致，已停止显示' : '记录与当前密钥或登录账号不一致，已停止显示');
    }
    const actual = nonnegative(item.actual_cost);
    const standard = nonnegative(item.total_cost);
    return {
      id: `sub2:${id}`, model: label(item.model) ?? '未提供模型', createdAt: date(item.created_at),
      ...(actual !== undefined ? { cost: { value: actual, unit: 'USD', kind: 'actual' as const } }
        : standard !== undefined ? { cost: { value: standard, unit: 'USD', kind: 'standard' as const } } : {}),
      inputTokens: integer(item.input_tokens), outputTokens: integer(item.output_tokens),
      cacheReadTokens: integer(item.cache_read_tokens), cacheWriteTokens: integer(item.cache_creation_tokens),
      firstTokenMs: nonnegative(item.first_token_ms), durationMs: nonnegative(item.duration_ms),
      reasoningEffort: label(item.reasoning_effort), stream: typeof item.stream === 'boolean' ? item.stream : undefined,
    };
  });
  const pages = integer(data.pages);
  const more = records.length === size && (pages === undefined || page < pages);
  return { records, page, ...(more ? { nextPage: page + 1 } : {}), recentOnly: false, fetchedAt: now };
}

function logOther(value: unknown) {
  if (object(value)) return object(value)!;
  if (typeof value !== 'string' || value.length > 64_000) return {};
  try { return object(JSON.parse(value)) ?? {}; } catch { return {}; }
}

export function parseNewApiUsage(raw: unknown, status: unknown, now: string): UsagePage {
  unwrap(raw); // Check failure envelopes before inspecting array-valued data.
  const rows = object(raw)?.data;
  if (!Array.isArray(rows) || rows.length > 1000) throw new QuotaError('UNSUPPORTED', '这个站点没有开放兼容的密钥使用记录接口');
  const { factor, unit } = newApiCurrency(status);
  const records: UsageRecord[] = [];
  for (const row of rows) {
    const item = object(row);
    if (!item) throw new QuotaError('INVALID', '站点返回了无法识别的使用记录');
    // 2 = consumption, 5 = error. Top-ups, refunds and management events are not requests.
    if (integer(item.type) !== 2 && integer(item.type) !== 5) continue;
    const id = integer(item.id);
    if (id === undefined) throw new QuotaError('INVALID', '使用记录缺少标识，暂时无法显示');
    const other = logOther(item.other);
    const quota = nonnegative(item.quota);
    const seconds = nonnegative(item.use_time);
    const cost = quota === undefined ? undefined : quota * factor;
    records.push({
      id: `new:${id}`, model: label(item.model_name) ?? '未提供模型', createdAt: date(item.created_at),
      ...(cost !== undefined && Number.isFinite(cost) ? { cost: { value: cost, unit, kind: 'actual' as const } } : {}),
      inputTokens: integer(item.prompt_tokens), outputTokens: integer(item.completion_tokens),
      cacheReadTokens: integer(other.cache_tokens), cacheWriteTokens: integer(other.cache_write_tokens) ?? integer(other.cache_creation_tokens),
      firstTokenMs: nonnegative(other.frt), durationMs: seconds === undefined ? undefined : seconds * 1000,
      reasoningEffort: label(other.reasoning_effort), stream: typeof item.is_stream === 'boolean' ? item.is_stream : undefined,
      failed: integer(item.type) === 5,
    });
  }
  records.sort((a, b) => (Date.parse(b.createdAt ?? '') || 0) - (Date.parse(a.createdAt ?? '') || 0));
  return { records, page: 1, recentOnly: true, fetchedAt: now,
    notice: '仅当前密钥的近期记录；条数由站点限制，不代表完整账单。' };
}

export async function fetchUsage(source: Source, credential: Credential, page = 1, ask: Requester = request, now = new Date().toISOString()): Promise<UsagePage> {
  if (!Number.isSafeInteger(page) || page < 1) throw new QuotaError('CONFIG', '使用记录页码无效');
  const kind = source.resolvedKind ?? (source.kind === 'auto' ? await detectProvider(source, ask) : source.kind);
  try {
    if (kind === 'sub2-admin') {
      if (!source.accountId || !Number.isSafeInteger(source.accountId) || source.accountId < 1) throw new QuotaError('CONFIG', '请先选择要查看记录的上游账号');
      const query = `account_id=${source.accountId}&page=${page}&page_size=${USAGE_PAGE_SIZE}&sort_by=created_at&sort_order=desc`;
      const data = await ask(source, `/api/v1/admin/usage?${query}`, credential, { auth: credential.mode === 'session' ? 'bearer' : 'x-api-key' });
      return parseAdminUsage(data, source, page, now);
    }
    if (kind === 'newapi') {
      if (page !== 1) throw new QuotaError('UNSUPPORTED', '此接口只提供近期记录，暂不支持向前翻页');
      const [status, rows] = await Promise.all([
        ask(source, '/api/status', undefined, { auth: 'none' }),
        ask(source, '/api/log/token', credential),
      ]);
      return parseNewApiUsage(rows, status, now);
    }
    if (kind === 'sub2api') {
      if (credential.mode !== 'session' || !credential.apiKeyId || !credential.userId) throw new QuotaError('AUTH', '登录购买套餐的站点账号后，即可查看当前密钥的使用记录。');
      const query = `api_key_id=${credential.apiKeyId}&page=${page}&page_size=${USAGE_PAGE_SIZE}&sort_by=created_at&sort_order=desc`;
      return parseUserUsage(await ask(source, `/api/v1/usage?${query}`, credential), credential, page, now);
    }
    throw new QuotaError('UNSUPPORTED', '此接入方式暂未提供兼容的逐次使用记录接口。额度仍可在「额度」中查看。');
  } catch (error) {
    if (error instanceof QuotaError && error.code === 'FORBIDDEN') throw new QuotaError('FORBIDDEN', '当前凭据没有查看使用记录的权限，请检查站点权限或重新连接', error.status);
    throw error;
  }
}
