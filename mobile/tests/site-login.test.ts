import { describe, expect, it } from 'vitest';
import { isSitePage, readSiteSession, siteLoginScript, siteLoginUrl } from '../src/providers/site-login';

const base = 'https://relay.example/prefix';
const message = JSON.stringify({ type: 'yudu-site-session', accessToken: 'test-access-token', refreshToken: 'test-refresh', expiresAt: 1793620000000, userId: 999, password: 'must-not-be-imported' });

describe('verified site login handoff', () => {
  it('allows only the exact configured origin and path prefix', () => {
    expect(siteLoginUrl({ baseUrl: base + '/v1' })).toBe(base + '/login');
    expect(isSitePage(base + '/dashboard', base)).toBe(true);
    for (const page of ['https://relay.example.evil/prefix', 'http://relay.example/prefix', 'https://other.example/prefix', 'https://relay.example/prefix-other', 'https://relay.example/login', 'https://user@relay.example/prefix', 'about:blank']) {
      expect(isSitePage(page, base)).toBe(false);
      expect(readSiteSession(message, page, base)).toBeUndefined();
    }
  });
  it('imports only bounded session fields, never browser-supplied identities or passwords', () => {
    expect(readSiteSession(message, base + '/dashboard', base)).toEqual({ accessToken: 'test-access-token', refreshToken: 'test-refresh', expiresAt: 1793620000000 });
    for (const payload of ['invalid', '{}', JSON.stringify({ type: 'yudu-site-session', accessToken: 'x'.repeat(16385) }), JSON.stringify({ type: 'yudu-site-session', accessToken: 'token\r\nheader' }), message.repeat(500)]) {
      expect(readSiteSession(payload, base + '/login', base)).toBeUndefined();
    }
  });
  it('waits for the official login to create a session, posts once, and ignores subframes and other sites', () => {
    const posted: string[] = [];
    const storage = new Map<string, string>();
    let watch: (() => void) | undefined;
    let stopped = false;
    const browser = { ReactNativeWebView: { postMessage: (data: string) => posted.push(data) }, top: {}, self: {} };
    browser.top = browser.self;
    const context = { window: browser, location: { origin: 'https://relay.example', pathname: '/prefix/login' }, localStorage: { getItem: (key: string) => storage.get(key) ?? null },
      setInterval: (callback: () => void) => { watch = callback; return 1; }, clearInterval: () => { stopped = true; } };
    const script = siteLoginScript(base);
    const execute = (values: typeof context) => Function(...Object.keys(values), script)(...Object.values(values));
    execute(context);
    expect(posted).toHaveLength(0);
    storage.set('auth_token', 'test-access-token'); storage.set('refresh_token', 'test-refresh'); storage.set('token_expires_at', '1793620000000'); storage.set('password', 'must-not-be-read');
    watch!();
    expect(stopped).toBe(true);
    expect(readSiteSession(posted[0], base + '/dashboard', base)?.accessToken).toBe('test-access-token');
    expect(posted[0]).not.toMatch(/must-not-be-read|userId|password/);
    posted.length = 0;
    execute({ ...context, location: { origin: 'https://other.example', pathname: '/prefix/login' } });
    execute({ ...context, window: { ...browser, top: {} } });
    expect(posted).toHaveLength(0);
  });
});
