import { describe, expect, it, vi } from 'vitest';
import type { Credential, Source, UsagePage } from '../src/domain/types';
import { duration, tokenCount, usageCost } from '../src/domain/usage-format';
import { fetchUsage, parseAdminUsage, parseNewApiUsage } from '../src/providers/usage';
import { createRequester, QuotaError } from '../src/providers/transport';
import { createUsageReader } from '../src/state/usage-reader';

const now = '2026-11-02T03:00:00.000Z';
const source: Source = { id: 'usage-test', connectionId: 'usage-connection', name: '测试', baseUrl: 'https://relay.example/proxy', kind: 'sub2-admin', accountId: 42, enabled: true, pinned: false };
const key: Credential = { mode: 'key', apiKey: 'test-only-admin' };
const row = { id: 7, account_id: 42, model: 'test-model', created_at: now, input_tokens: 1410, output_tokens: 2114, cache_read_tokens: 108500, cache_creation_tokens: 0, actual_cost: .034814, total_cost: .17407, first_token_ms: 2720, duration_ms: 66200, stream: true, reasoning_effort: 'high' };
const list = (items: unknown[] = [row], extra = {}) => ({ data: { items, page: 1, page_size: 20, pages: 1, ...extra } });
const status = { quota_per_unit: 250000, quota_display_type: 'USD' };
const newRow = { id: 1, type: 2, created_at: 1793588400, model_name: 'test-model', quota: 8703.5, prompt_tokens: 40, completion_tokens: 90, use_time: 12, is_stream: true, other: JSON.stringify({ frt: 2400, cache_tokens: 400, cache_write_tokens: 0, reasoning_effort: 'high' }) };

describe('account-scoped Sub2API usage', () => {
  it('retains useful fields and distinguishes actual charge from standard price', () => {
    expect(parseAdminUsage(list(), source, 1, now).records[0]).toEqual({ id: 'sub2:7', model: 'test-model', createdAt: now,
      cost: { value: .034814, unit: 'USD', kind: 'actual' }, inputTokens: 1410, outputTokens: 2114, cacheReadTokens: 108500, cacheWriteTokens: 0,
      firstTokenMs: 2720, durationMs: 66200, reasoningEffort: 'high', stream: true });
  });
  it('rejects a backend that ignores account scope or omits account IDs', () => {
    expect(() => parseAdminUsage(list([{ ...row, account_id: 43 }]), source, 1, now)).toThrow('所选上游账号不一致');
    expect(() => parseAdminUsage(list([{ ...row, account_id: undefined }]), source, 1, now)).toThrow('所选上游账号不一致');
    expect(() => parseAdminUsage(list([row, { ...row, account_id: 43 }]), source, 1, now)).toThrow(QuotaError);
  });
  it('preserves zero actual charge and marks a standard-price fallback', () => {
    expect(parseAdminUsage(list([{ ...row, actual_cost: 0 }]), source, 1, now).records[0].cost).toEqual({ value: 0, unit: 'USD', kind: 'actual' });
    expect(parseAdminUsage(list([{ ...row, actual_cost: undefined }]), source, 1, now).records[0].cost).toEqual({ value: .17407, unit: 'USD', kind: 'standard' });
    const record = parseAdminUsage(list([{ id: 1, account_id: 42, model: 'm' }]), source, 1, now).records[0];
    expect(record.cost).toBeUndefined(); expect(record.firstTokenMs).toBeUndefined(); expect(record.inputTokens).toBeUndefined();
  });
  it('uses real pagination without inventing a total or accepting the wrong page', () => {
    const full = Array.from({ length: 20 }, (_, index) => ({ ...row, id: index + 1 }));
    expect(parseAdminUsage(list(full, { pages: 4 }), source, 1, now).nextPage).toBe(2);
    expect(parseAdminUsage(list(full), source, 1, now).nextPage).toBeUndefined();
    expect(() => parseAdminUsage(list(), source, 2, now)).toThrow('页码不一致');
    expect(() => parseAdminUsage({ data: { balance: 0 } }, source, 1, now)).toThrow('有效的使用记录列表');
  });
  it('keeps request contents, credentials, IP and user information out of the projection', () => {
    const result = parseAdminUsage(list([{ ...row, ip_address: 'PRIVATE_IP', user: { email: 'PRIVATE_EMAIL' }, credentials: { token: 'PRIVATE_TOKEN' }, request_body: 'PRIVATE_PROMPT' }]), source, 1, now);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_/);
  });
});

describe('New API recent token logs', () => {
  it('converts quota by site settings and converts seconds separately from first-token milliseconds', () => {
    const page = parseNewApiUsage({ success: true, data: [newRow] }, status, now);
    expect(page.records[0]).toMatchObject({ cost: { value: .034814, unit: 'USD', kind: 'actual' }, firstTokenMs: 2400, durationMs: 12000, cacheReadTokens: 400, cacheWriteTokens: 0 });
    expect(page.recentOnly).toBe(true); expect(page.nextPage).toBeUndefined();
  });
  it('excludes recharge and refund events, keeps failed requests, and sorts by time', () => {
    const page = parseNewApiUsage({ data: [newRow, { ...newRow, id: 2, type: 1 }, { ...newRow, id: 3, type: 6 }, { ...newRow, id: 4, type: 5, created_at: newRow.created_at + 10, quota: 0 }] }, status, now);
    expect(page.records.map(record => record.id)).toEqual(['new:4', 'new:1']);
    expect(page.records[0].failed).toBe(true); expect(page.records[0].cost?.value).toBe(0);
  });
  it('supports zero, missing metadata, malformed metadata and a real empty list', () => {
    const record = parseNewApiUsage({ data: [{ ...newRow, other: '{broken', prompt_tokens: 0, use_time: undefined, quota: undefined }] }, status, now).records[0];
    expect(record.inputTokens).toBe(0); expect(record.durationMs).toBeUndefined(); expect(record.cost).toBeUndefined(); expect(record.cacheReadTokens).toBeUndefined();
    expect(parseNewApiUsage({ data: [] }, status, now).records).toEqual([]);
    expect(() => parseNewApiUsage({ success: false, data: [] }, status, now)).toThrow(QuotaError);
    expect(() => parseNewApiUsage({ data: {} }, status, now)).toThrow('密钥使用记录接口');
  });
  it('does not guess currency rules or leak unrelated log metadata', () => {
    expect(() => parseNewApiUsage({ data: [newRow] }, {}, now)).toThrow('换算比例');
    expect(() => parseNewApiUsage({ data: [newRow] }, { ...status, quota_display_type: 'UNKNOWN' }, now)).toThrow('额度单位');
    const result = parseNewApiUsage({ data: [{ ...newRow, ip: 'PRIVATE_IP', content: 'PRIVATE_PROMPT', other: JSON.stringify({ api_key: 'PRIVATE_KEY', admin_info: { content: 'PRIVATE_INFO' } }) }] }, status, now);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_/);
  });
});

describe('usage requests and credentials', () => {
  it('always sends account_id and uses the configured admin auth on the same host', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(list())));
    await fetchUsage(source, key, 1, createRequester(fetcher as typeof fetch), now);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://relay.example/proxy/api/v1/admin/usage?account_id=42&page=1&page_size=20&sort_by=created_at&sort_order=desc');
    expect(options?.headers).toMatchObject({ 'x-api-key': key.apiKey }); expect(options?.headers).not.toHaveProperty('Authorization');
  });
  it('uses Bearer for sessions and never sends the token in a URL', async () => {
    const credential: Credential = { mode: 'session', accessToken: 'test-only-session' };
    const ask = vi.fn(async () => list());
    await fetchUsage(source, credential, 1, ask, now);
    expect(ask.mock.calls[0]).toEqual([source, expect.not.stringContaining(credential.accessToken!), credential, { auth: 'bearer' }]);
    const fetcher = vi.fn<typeof fetch>(async url => new Response(JSON.stringify(String(url).endsWith('/api/status') ? status : { data: [newRow] })));
    await fetchUsage({ ...source, kind: 'newapi' }, key, 1, createRequester(fetcher as typeof fetch), now);
    const logCall = fetcher.mock.calls.find(([url]) => String(url).endsWith('/api/log/token'))!;
    expect(logCall[1]?.headers).toMatchObject({ Authorization: 'Bearer test-only-admin' });
    expect(fetcher.mock.calls.find(([url]) => String(url).endsWith('/api/status'))![1]?.headers).not.toHaveProperty('Authorization');
  });
  it('does not send a normal Sub2API key to a JWT-only log endpoint', async () => {
    const ask = vi.fn(async () => list());
    await expect(fetchUsage({ ...source, kind: 'sub2api' }, key, 1, ask)).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    expect(ask).not.toHaveBeenCalled();
    await expect(fetchUsage({ ...source, accountId: undefined }, key, 1, ask)).rejects.toMatchObject({ code: 'CONFIG' });
    expect(ask).not.toHaveBeenCalled();
  });
  it('reports log permissions without falling back to site-wide or other routes', async () => {
    const ask = vi.fn(async () => { throw new QuotaError('FORBIDDEN', 'generic', 403); });
    await expect(fetchUsage(source, key, 1, ask)).rejects.toMatchObject({ code: 'FORBIDDEN', message: expect.stringContaining('使用记录的权限') });
    expect(ask).toHaveBeenCalledTimes(1);
  });
});

describe('usage sessions and late results', () => {
  const page: UsagePage = { records: [], page: 1, recentOnly: false, fetchedAt: now };
  const old: Credential = { mode: 'session', accessToken: 'old', expiresAt: '2099-01-01T00:00:00Z' };
  const fresh: Credential = { ...old, accessToken: 'fresh' };
  it('renews once after a rejected session and retries the same scoped page', async () => {
    const fetch = vi.fn(async (_s, credential, _p) => { if (credential.accessToken === 'old') throw new QuotaError('AUTH', 'expired'); return page; });
    const renew = vi.fn(async () => fresh);
    const read = createUsageReader({ source: () => source, generation: () => 0, read: async () => old, renew, fetch });
    expect(await read(source.id, 3)).toBe(page); expect(renew).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls.map(call => call[2])).toEqual([3, 3]);
  });
  it('discards records if a connection changes while the request is in flight', async () => {
    let generation = 0;
    const started = Promise.withResolvers<void>(); const done = Promise.withResolvers<UsagePage>();
    const read = createUsageReader({ source: () => source, generation: () => generation, read: async () => key, renew: async () => key, fetch: async () => { started.resolve(); return done.promise; } });
    const result = read(source.id); const assertion = expect(result).rejects.toThrow('连接已更换');
    await started.promise; generation++; done.resolve(page); await assertion;
  });
});

describe('phone log formatting', () => {
  it('keeps small charges readable, preserves zero and distinguishes missing values', () => {
    expect(usageCost({ value: .034814, unit: 'USD', kind: 'actual' })).toBe('$0.034814');
    expect(usageCost({ value: .0000001, unit: 'USD', kind: 'actual' })).toBe('<$0.000001');
    expect(usageCost({ value: 0, unit: 'USD', kind: 'actual' })).toBe('$0.00');
    expect(usageCost(undefined)).toBe('—'); expect(tokenCount(0)).toBe('0'); expect(tokenCount(undefined)).toBe('—');
    expect(duration(0)).toBe('0 ms'); expect(duration(2720)).toBe('2.72 s'); expect(duration(66200)).toBe('1 分 6 秒'); expect(duration(undefined)).toBe('—');
  });
});
