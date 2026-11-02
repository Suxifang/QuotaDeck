import { describe, expect, it, vi } from 'vitest';
import type { Credential, Source } from '../src/domain/types';
import { amount, countdown, isSampleStale, percentRemaining } from '../src/domain/format';
import { parseAdmin, parseCustom, parseDeepSeek, parseNewApi, parseOneApi, parseOpenRouter, parseSub2 } from '../src/providers/parsers';
import { atPath, createRequester, normalizeBaseUrl, QuotaError, requestUrl, unwrap } from '../src/providers/transport';
import { detectProvider, fetchSnapshot, listAdminAccounts, loginAdmin } from '../src/providers/registry';
import { createSessionRenewal } from '../src/state/session';
import { normalizeAccount } from '../src/vendor/sub2api-dashboard/account-normalizer';

const now = '2026-11-02T03:00:00.000Z';
const source: Source = { id: 's1', connectionId: 'c1', name: 'Test', baseUrl: 'https://relay.example', kind: 'sub2api', pinned: false, enabled: true };
const key: Credential = { mode: 'key', apiKey: 'test-only-key' };
const admin: Source = { ...source, kind: 'sub2-admin', accountId: 42 };
const oauth = (extra: Record<string, unknown>) => ({ data: { id: 42, name: 'Account', platform: 'openai', type: 'oauth', extra } });

describe('Sub2API subscription and reverse-proxy quotas', () => {
  it('reads actual cost separately and prefers the weekly window', () => {
    const snapshot = parseSub2({ data: { subscription: { daily_limit_usd: 100, daily_usage_usd: 3, weekly_limit_usd: 600, weekly_usage_usd: 5.43 }, usage: { today: { actual_cost: 1.23, total_cost: 9.87 } } } }, source, now);
    expect(snapshot.metrics[0]).toMatchObject({ id: 'weekly', remaining: 594.57, scope: 'subscription' });
    expect(snapshot.today).toEqual({ value: 1.23, unit: 'USD' });
  });
  it('preserves a real zero and does not invent missing usage', () => {
    expect(parseSub2({ balance: 0 }, source, now).metrics[0].remaining).toBe(0);
    expect(() => parseSub2({ subscription: { weekly_limit_usd: 600 } }, source, now)).toThrow(QuotaError);
    expect(amount(undefined, 'USD')).toBe('—');
  });
  it('marks zero subscription limits as unlimited', () => {
    const metric = parseSub2({ subscription: { weekly_limit_usd: 0, weekly_usage_usd: 12 } }, source, now).metrics[0];
    expect(metric.unlimited).toBe(true); expect(metric.remaining).toBeUndefined();
  });
  it('anchors day/week resets to the backend window, not query time', () => {
    const metrics = parseSub2({ subscription: { weekly_limit_usd: 100, weekly_usage_usd: 1, weekly_window_start: '2026-11-01T00:00:00Z', monthly_limit_usd: 500, monthly_usage_usd: 1, monthly_window_start: '2026-11-01T00:00:00Z' } }, source, now).metrics;
    expect(metrics[0].resetAt).toBe('2026-11-08T00:00:00.000Z'); expect(metrics[0].resetEstimated).toBe(true);
    expect(metrics[1].resetAt).toBeUndefined();
  });
  it('maps numeric-string Codex quota fields and relative reset anchors', () => {
    const snapshot = parseAdmin(oauth({ codex_5h_used_percent: '18', codex_7d_used_percent: 84, codex_usage_updated_at: '2026-11-02T02:58:00Z', codex_5h_reset_after_seconds: '7200' }), admin, now);
    expect(snapshot.metrics[0]).toMatchObject({ remaining: 82, unit: '%', resetAt: '2026-11-02T04:58:00.000Z', sampledAt: '2026-11-02T02:58:00.000Z' });
    expect(snapshot.metrics[1].remaining).toBe(16);
  });
  it('keeps an elapsed reset visible instead of showing a fresh allowance', () => {
    const metric = parseAdmin(oauth({ codex_5h_used_percent: 100, codex_usage_updated_at: '2026-11-01T00:00:00Z', codex_5h_reset_after_seconds: 100 }), admin, now).metrics[0];
    expect(metric.remaining).toBe(0); expect(countdown(metric.resetAt, Date.parse(now))).toBe('等待重置确认');
    expect(isSampleStale(metric, Date.parse(now))).toBe(true);
  });
  it('does not fabricate an upstream quota or sampling timestamp', () => {
    expect(() => parseAdmin(oauth({}), admin, now)).toThrow(QuotaError);
    const metric = parseAdmin(oauth({ codex_5h_used_percent: 20 }), admin, now).metrics[0];
    expect(metric.sampledAt).toBeUndefined(); expect(isSampleStale(metric, Date.parse(now))).toBe(true);
  });
  it('rejects an account response for a different ID', () => {
    expect(() => parseAdmin({ id: 41 }, admin, now)).toThrow('账号不一致');
  });
  it('does not retain account credentials or arbitrary extra fields', () => {
    const normalized = normalizeAccount({ id: 42, credentials: { access_token: 'DO_NOT_CACHE' }, extra: { email: 'private', codex_5h_used_percent: 18, access_token: 'DO_NOT_CACHE' } });
    expect(JSON.stringify(normalized)).not.toContain('DO_NOT_CACHE');
    expect(normalized).not.toHaveProperty('extra'); expect(normalized).not.toHaveProperty('email');
    const snapshot = parseAdmin(oauth({ codex_5h_used_percent: 18, access_token: 'DO_NOT_CACHE' }), admin, now);
    expect(JSON.stringify(snapshot)).not.toContain('DO_NOT_CACHE');
  });
});

describe('other relay and provider balances', () => {
  const usage = { object: 'token_usage', total_available: 500000, total_used: 250000, total_granted: 750000 };
  it('uses the site conversion rate for New API USD', () => {
    expect(parseNewApi(usage, { quota_per_unit: 250000, quota_display_type: 'USD' }, source, now).metrics[0]).toMatchObject({ remaining: 2, used: 1, limit: 3, unit: 'USD' });
  });
  it('supports New API CNY, custom currency, tokens and unlimited', () => {
    expect(parseNewApi(usage, { quota_per_unit: 500000, quota_display_type: 'CNY', usd_exchange_rate: 7.2 }, source, now).metrics[0].remaining).toBe(7.2);
    expect(parseNewApi(usage, { quota_per_unit: 500000, quota_display_type: 'CUSTOM', custom_currency_exchange_rate: 2, custom_currency_symbol: '积分' }, source, now).metrics[0]).toMatchObject({ remaining: 2, unit: '积分' });
    expect(parseNewApi(usage, { quota_per_unit: 500000, quota_display_type: 'TOKENS' }, source, now).metrics[0].remaining).toBe(500000);
    expect(parseNewApi({ ...usage, unlimited_quota: true }, { quota_per_unit: 500000 }, source, now).metrics[0].remaining).toBeUndefined();
  });
  it('refuses to guess a missing conversion rate or accept a status page as usage', () => {
    expect(() => parseNewApi(usage, {}, source, now)).toThrow('换算比例');
    expect(() => parseNewApi({}, { quota_per_unit: 500000 }, source, now)).toThrow(QuotaError);
  });
  it('converts One API usage cents to dollars', () => {
    expect(parseOneApi({ hard_limit_usd: 50 }, { total_usage: 2136 }, source, now).metrics[0].remaining).toBe(28.64);
  });
  it('reads OpenRouter account credits independently of key spending limits', () => {
    expect(parseOpenRouter({ data: { total_credits: 50, total_usage: 21.36 } }, source, now).metrics[0]).toMatchObject({ scope: 'account', remaining: 28.64 });
  });
  it('preserves separate DeepSeek currencies and a negative balance', () => {
    const metrics = parseDeepSeek({ balance_infos: [{ currency: 'USD', total_balance: '3.20' }, { currency: 'CNY', total_balance: '-1.00' }] }, source, now).metrics;
    expect(metrics.map(metric => [metric.unit, metric.remaining])).toEqual([['USD', 3.2], ['CNY', -1]]);
  });
  it('custom mapping reads explicit paths and scales once', () => {
    const snapshot = parseCustom({ data: { credit: '1230', used: 20 } }, { path: '/api/balance', auth: 'bearer', remainingPath: 'data.credit', usedPath: 'data.used', scale: .01, unit: 'USD' }, source, now);
    expect(snapshot.metrics[0]).toMatchObject({ remaining: 12.3, used: .2 }); expect(snapshot.metrics[0].limit).toBeUndefined();
    expect(() => atPath({}, '__proto__.token')).toThrow(QuotaError);
  });
  it('does not interpret a failure envelope as a zero balance', () => {
    expect(() => unwrap({ success: false, data: { balance: 0 } })).toThrow(QuotaError);
    expect(() => unwrap({ code: 403, data: { balance: 0 } })).toThrow(QuotaError);
  });
});

describe('request destinations and authentication', () => {
  it('normalizes pasted API suffixes and preserves a reverse-proxy prefix', () => {
    expect(normalizeBaseUrl(' https://relay.example/proxy/api/v1/ ')).toBe('https://relay.example/proxy');
    expect(requestUrl('https://relay.example/proxy', '/api/v1/admin/accounts/42')).toBe('https://relay.example/proxy/api/v1/admin/accounts/42');
  });
  it.each(['//evil.example/api', 'https://evil.example/api', '/api/../other', '/\\evil.example', '/api\nHeader: value'])('rejects an unsafe endpoint %s', path => {
    expect(() => requestUrl(source.baseUrl, path)).toThrow(QuotaError);
  });
  it('allows HTTP on a private network and requires HTTPS on the public internet', () => {
    expect(normalizeBaseUrl('http://192.168.1.8:3000')).toBe('http://192.168.1.8:3000');
    expect(() => normalizeBaseUrl('http://public.example')).toThrow('HTTPS');
    expect(() => normalizeBaseUrl('https://user:secret@public.example')).toThrow(QuotaError);
  });
  it('blocks redirects and sends admin keys only as x-api-key', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(oauth({ codex_5h_used_percent: 18 }))));
    await fetchSnapshot(admin, key, createRequester(fetcher as typeof fetch), now);
    expect(fetcher.mock.calls[0][0]).toBe('https://relay.example/api/v1/admin/accounts/42');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error', headers: { 'x-api-key': 'test-only-key' } });
    expect(fetcher.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization');
  });
  it('classifies auth errors without leaking response content', async () => {
    const ask = createRequester(vi.fn(async () => new Response('test-only-key private backend error', { status: 401 })) as typeof fetch);
    await expect(ask(source, '/v1/usage', key)).rejects.toMatchObject({ code: 'AUTH', status: 401 });
    try { await ask(source, '/v1/usage', key); } catch (err) { expect(String(err)).not.toContain('test-only-key'); }
  });
  it('rejects a frontend HTML response', async () => {
    const ask = createRequester(vi.fn(async () => new Response('<html>Frontend</html>')) as typeof fetch);
    await expect(ask(source, '/v1/usage', key)).rejects.toMatchObject({ code: 'INVALID' });
  });
  it('identifies the site only through public unauthenticated probes', async () => {
    const ask = vi.fn(async (_s, path) => { if (path === '/api/status') return { data: { quota_per_unit: 500000 } }; throw new QuotaError('UNSUPPORTED', 'No endpoint', 404); });
    expect(await detectProvider({ ...source, kind: 'auto' }, ask)).toBe('newapi');
    for (const call of ask.mock.calls as unknown as unknown[][]) { expect(call[2]).toBeUndefined(); expect(call[3]).toMatchObject({ auth: 'none' }); }
  });
  it('does not guess when a frontend answers every route', async () => {
    await expect(detectProvider(source, async () => ({ html: 'fallback' }))).rejects.toMatchObject({ code: 'UNSUPPORTED' });
  });
  it('reads and reduces the account list without retaining upstream credentials', async () => {
    const list = await listAdminAccounts(admin, key, async () => ({ data: { items: [{ id: 42, name: 'Account', platform: 'openai', credentials: { token: 'DO_NOT_CACHE' }, extra: { codex_5h_used_percent: 0 } }], total: 1 } }));
    expect(list).toEqual([{ id: 42, name: 'Account', platform: 'openai', type: '', hasQuota: true }]);
  });
  it('rejects a regular user login for admin monitoring', async () => {
    await expect(loginAdmin(admin, 'test@example.invalid', 'test-only-password', async () => ({ data: { access_token: 'test', user: { role: 'user' } } }))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('session renewal concurrency', () => {
  const old: Credential = { mode: 'session', accessToken: 'old-test', refreshToken: 'old-refresh' };
  const fresh: Credential = { mode: 'session', accessToken: 'new-test', refreshToken: 'new-refresh' };
  it('shares a single refresh among accounts on the same connection', async () => {
    let current = old;
    const refresh = vi.fn(async () => fresh);
    const renewal = createSessionRenewal({ read: async () => current, write: async (_id, value) => { current = value; }, refresh });
    const result = await Promise.all([renewal.renew(admin, old), renewal.renew(admin, old), renewal.renew(admin, old)]);
    expect(refresh).toHaveBeenCalledTimes(1); expect(result).toEqual([fresh, fresh, fresh]);
    expect(await renewal.renew(admin, old)).toEqual(fresh); expect(refresh).toHaveBeenCalledTimes(1);
  });
  it('does not restore a revoked connection after an in-flight refresh', async () => {
    let resolve!: (value: Credential) => void;
    const write = vi.fn(async () => {});
    const started = Promise.withResolvers<void>();
    const renewal = createSessionRenewal({ read: async () => old, write, refresh: async () => { started.resolve(); return new Promise(r => { resolve = r; }); } });
    const work = renewal.renew(admin, old); await started.promise;
    renewal.invalidate(admin.connectionId); resolve(fresh);
    await expect(work).rejects.toMatchObject({ code: 'AUTH' }); expect(write).not.toHaveBeenCalled();
  });
});

describe('format and freshness', () => {
  it('does not sum percentages with money and clamps overage only in progress', () => {
    expect(percentRemaining({ id: 'key', label: 'Key', scope: 'key', unit: 'USD', remaining: -2, limit: 20 })).toBe(0);
    expect(amount(-2, 'USD')).toBe('$-2.00');
  });
  it('marks old upstream samples stale even when fetched now', () => {
    expect(isSampleStale({ id: '5h', label: '5h', scope: 'upstream', unit: '%', remaining: 80, sampledAt: '2026-11-02T02:00:00Z' }, Date.parse(now))).toBe(true);
  });
});
