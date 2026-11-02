import { describe, expect, it, vi } from 'vitest';
import type { Credential, Source } from '../src/domain/types';
import { fetchUsage, parseUserUsage } from '../src/providers/usage';
import { loginUsageUser, matchUserKey, refreshUsageUser, usageLoginNeedsVerification } from '../src/providers/user-session';
import { createRequester, QuotaError, type Requester } from '../src/providers/transport';
import { createUsageReader } from '../src/state/usage-reader';

const source: Source = { id: 'package', connectionId: 'site', name: '套餐', baseUrl: 'https://relay.example/prefix', kind: 'sub2api', enabled: true, pinned: false };
const secret = 'test-only-package-key';
const now = '2026-11-02T03:00:00.000Z';
const loginResponse = { data: { access_token: 'test-only-user-jwt', refresh_token: 'test-only-refresh', expires_in: 3600, user: { id: 10, role: 'user' } } };
const session: Credential = { mode: 'session', accessToken: 'test-only-user-jwt', refreshToken: 'test-only-refresh', userId: 10, apiKeyId: 23, expiresAt: '2099-01-01T00:00:00Z' };
const keyList = { data: { items: [{ id: 22, user_id: 10, key: 'other-test-key' }, { id: 23, user_id: 10, key: secret }], page: 1, pages: 1 } };
const row = { id: 9, user_id: 10, api_key_id: 23, model: 'm', actual_cost: 0, input_tokens: 0, output_tokens: 42, created_at: now, first_token_ms: 210, duration_ms: 500 };
const usageList = (items = [row]) => ({ data: { items, page: 1, page_size: 20, pages: 1 } });

describe('Sub2API package site login', () => {
  it('recognizes site verification requirements using a public request without credentials', async () => {
    const ask = vi.fn<Requester>(async () => ({ code: 0, data: { turnstile_enabled: true } }));
    expect(await usageLoginNeedsVerification(source, ask)).toBe(true);
    expect(ask.mock.calls[0].slice(1)).toEqual(['/api/v1/settings/public', undefined, { auth: 'none' }]);
    for (const flag of ['tencent_captcha_enabled', 'aliyun_captcha_enabled', 'login_agreement_enabled']) {
      expect(await usageLoginNeedsVerification(source, async () => ({ data: { [flag]: true } }))).toBe(true);
    }
    expect(await usageLoginNeedsVerification(source, async () => ({ data: { turnstile_enabled: false } }))).toBe(false);
  });
  it('validates a completed website session with the server before associating its exact API key', async () => {
    const ask = vi.fn<Requester>(async (_source, path) => path.endsWith('/auth/me') ? { data: { id: 10 } } : keyList);
    const result = await loginUsageUser(source, secret, { siteSession: { accessToken: session.accessToken!, refreshToken: session.refreshToken, expiresAt: Date.now() + 3600_000 } }, ask);
    expect(result).toMatchObject({ credential: { userId: 10, apiKeyId: 23, accessToken: session.accessToken } });
    expect(ask.mock.calls.map(call => call[1])).toEqual(['/api/v1/auth/me', '/api/v1/keys?page=1&page_size=100']);
    expect(ask.mock.calls.every(call => !call[1].includes(secret))).toBe(true);
    const rejected = vi.fn<Requester>(async () => { throw new QuotaError('AUTH', '登录失效', 401); });
    await expect(loginUsageUser(source, secret, { siteSession: { accessToken: 'expired-token' } }, rejected)).rejects.toMatchObject({ code: 'AUTH' });
    expect(rejected).toHaveBeenCalledTimes(1);
    await expect(loginUsageUser(source, secret, { siteSession: { accessToken: 'test-token' } }, async () => ({ data: { role: 'user' } }))).rejects.toThrow('用户信息');
  });
  it('distinguishes captcha rejection from wrong credentials without echoing server payloads', async () => {
    for (const [reason, expected] of [['TURNSTILE_TOKEN_REQUIRED', '人机验证'], ['INVALID_CREDENTIALS', '邮箱或密码'], ['', '站点未接受登录请求']]) {
      const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ reason, message: 'unsafe echo: test-password' }), { status: 403 }));
      const error = await loginUsageUser(source, secret, { email: 'e', password: 'p' }, createRequester(fetcher as typeof fetch)).catch(error => error as Error);
      expect(error).toBeInstanceOf(QuotaError);
      expect((error as Error).message).toContain(expected);
      expect((error as Error).message).not.toContain('unsafe echo');
      expect((error as Error).cause).toBeInstanceOf(QuotaError);
    }
  });
  it('accepts an ordinary user and associates only the exact full API key', async () => {
    const ask = vi.fn<Requester>(async (_source, path) => path.endsWith('/login') ? loginResponse : keyList);
    const result = await loginUsageUser(source, secret, { email: ' test@example.invalid ', password: 'test-password' }, ask);
    expect(result).toMatchObject({ credential: { mode: 'session', userId: 10, apiKeyId: 23, accessToken: 'test-only-user-jwt' } });
    expect(ask.mock.calls[0][3]).toEqual({ auth: 'none', method: 'POST', body: { email: 'test@example.invalid', password: 'test-password' } });
    expect(ask.mock.calls[1][2]?.mode).toBe('session');
    expect(ask.mock.calls.every(call => !call[1].includes(secret))).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/test-password|test@example|test-only-package-key|other-test-key/);
  });
  it('handles the real two-step login contract and does not read keys until authenticated', async () => {
    const challenge = vi.fn<Requester>(async () => ({ data: { requires_2fa: true, temp_token: 'test-challenge' } }));
    expect(await loginUsageUser(source, secret, { email: 'e', password: 'p' }, challenge)).toEqual({ requiresTwoFactor: true, tempToken: 'test-challenge' });
    expect(challenge).toHaveBeenCalledTimes(1);
    const complete = vi.fn<Requester>(async (_source, path) => path.endsWith('/2fa') ? loginResponse : keyList);
    expect(await loginUsageUser(source, secret, { tempToken: 'test-challenge', code: '123456' }, complete)).toHaveProperty('credential.apiKeyId', 23);
    expect(complete.mock.calls[0][3]?.body).toEqual({ temp_token: 'test-challenge', totp_code: '123456' });
    await expect(loginUsageUser(source, secret, { tempToken: 't', code: '12' }, complete)).rejects.toThrow('六位');
  });
  it('rejects masked, missing or foreign keys instead of widening to every user key', async () => {
    await expect(matchUserKey(source, secret, session, 10, async () => ({ data: { items: [{ id: 23, user_id: 10, key: 'test-***-key' }] } }))).rejects.toMatchObject({ code: 'CONFIG' });
    await expect(matchUserKey(source, secret, session, 10, async () => ({ data: { items: [{ id: 23, user_id: 11, key: secret }] } }))).rejects.toThrow('登录账号不一致');
    await expect(loginUsageUser(source, secret, { email: 'e', password: 'p' }, async () => ({ data: { access_token: 't' } }))).rejects.toThrow('用户信息');
  });
  it('follows pagination without searching by a secret in the URL', async () => {
    const ask = vi.fn<Requester>(async (_source, path) => path.includes('page=2&') ? { data: { items: [{ id: 23, user_id: 10, key: secret }], page: 2 } } : { data: { items: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, key: 'other' })), page: 1, pages: 2 } });
    expect(await matchUserKey(source, secret, session, 10, ask)).toBe(23);
    expect(ask.mock.calls.map(call => call[1])).toEqual(['/api/v1/keys?page=1&page_size=100', '/api/v1/keys?page=2&page_size=100']);
  });
  it('refreshes the JWT while preserving its user and key scope', async () => {
    const ask = vi.fn<Requester>(async () => ({ data: { access_token: 'fresh-jwt', refresh_token: 'fresh-refresh', expires_in: 3600 } }));
    expect(await refreshUsageUser(source, session, ask)).toMatchObject({ accessToken: 'fresh-jwt', refreshToken: 'fresh-refresh', userId: 10, apiKeyId: 23 });
    expect(ask.mock.calls[0][3]?.body).toEqual({ refresh_token: session.refreshToken });
  });
});

describe('package logs never leave the selected key scope', () => {
  it('reads the user route with JWT and key ID, without an admin route or API key', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(usageList())));
    const page = await fetchUsage(source, session, 1, createRequester(fetcher as typeof fetch), now);
    expect(fetcher.mock.calls[0][0]).toBe('https://relay.example/prefix/api/v1/usage?api_key_id=23&page=1&page_size=20&sort_by=created_at&sort_order=desc');
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer test-only-user-jwt' });
    expect(page.records[0]).toMatchObject({ cost: { value: 0, kind: 'actual' }, inputTokens: 0, outputTokens: 42 });
  });
  it('rejects ignored user/key filters, including mixed valid and invalid records', () => {
    expect(() => parseUserUsage(usageList([{ ...row, api_key_id: 24 }]), session, 1, now)).toThrow('当前密钥');
    expect(() => parseUserUsage(usageList([{ ...row, user_id: 11 }]), session, 1, now)).toThrow('登录账号');
    expect(() => parseUserUsage(usageList([row, { ...row, user_id: 0 }]), session, 1, now)).toThrow(QuotaError);
    expect(parseUserUsage(usageList([]), session, 1, now).records).toEqual([]);
    expect(() => parseUserUsage(usageList(), session, 2, now)).toThrow('页码不一致');
  });
  it('uses a separate login slot and rejects a late response after deletion', async () => {
    let current: Source | undefined = source;
    const begin = Promise.withResolvers<void>(); const done = Promise.withResolvers<ReturnType<typeof parseUserUsage>>();
    const read = vi.fn(async () => session);
    const reader = createUsageReader({ source: () => current, generation: () => 0, read, renew: async () => session,
      fetch: async () => { begin.resolve(); return done.promise; } });
    const work = reader(source.id); const rejected = expect(work).rejects.toThrow('连接已更换');
    await begin.promise; current = undefined; done.resolve(parseUserUsage(usageList(), session, 1, now)); await rejected;
    expect(read).toHaveBeenCalledWith(source.connectionId, source);
  });
});
