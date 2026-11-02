import type { Source } from '../domain/types';
import { normalizeBaseUrl, object } from './transport';

export interface SiteSession { accessToken: string; refreshToken?: string; expiresAt?: number }

/** Only the configured site's own pages may supply a login session. */
export function isSitePage(url: string, baseUrl: string): boolean {
  try {
    const base = new URL(normalizeBaseUrl(baseUrl));
    const page = new URL(url);
    const prefix = base.pathname.replace(/\/$/, '');
    return page.origin === base.origin && !page.username && !page.password &&
      (!prefix || page.pathname === prefix || page.pathname.startsWith(prefix + '/'));
  } catch { return false; }
}

export function siteLoginUrl(source: Pick<Source, 'baseUrl'>): string {
  return normalizeBaseUrl(source.baseUrl) + '/login';
}

const token = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 16_384 && !/[\s\u0000-\u001f\u007f]/.test(value);

export function readSiteSession(message: string, pageUrl: string, baseUrl: string): SiteSession | undefined {
  if (!isSitePage(pageUrl, baseUrl) || message.length > 40_000) return undefined;
  try {
    const data = object(JSON.parse(message));
    if (data?.type !== 'yudu-site-session' || !token(data.accessToken) ||
        (data.refreshToken !== undefined && !token(data.refreshToken))) return undefined;
    return { accessToken: data.accessToken,
      ...(data.refreshToken ? { refreshToken: data.refreshToken } : {}),
      ...(typeof data.expiresAt === 'number' && Number.isFinite(data.expiresAt) ? { expiresAt: data.expiresAt } : {}),
    };
  } catch { return undefined; }
}

/** Read only the upstream's documented session keys after a user completes its login page. */
export function siteLoginScript(baseUrl: string): string {
  const base = new URL(normalizeBaseUrl(baseUrl));
  return `(function () {
    if (window.top !== window.self || location.origin !== ${JSON.stringify(base.origin)}) return;
    var prefix = ${JSON.stringify(base.pathname.replace(/\/$/, ''))};
    if (prefix && location.pathname !== prefix && location.pathname.indexOf(prefix + '/') !== 0) return;
    if (window.__yuduLoginWatch) clearInterval(window.__yuduLoginWatch);
    function capture() {
      try {
        var access = localStorage.getItem('auth_token');
        if (!access || !window.ReactNativeWebView) return;
        var refresh = localStorage.getItem('refresh_token');
        var expires = Number(localStorage.getItem('token_expires_at'));
        var data = { type: 'yudu-site-session', accessToken: access };
        if (refresh) data.refreshToken = refresh;
        if (isFinite(expires) && expires > 0) data.expiresAt = expires;
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
        clearInterval(window.__yuduLoginWatch);
      } catch (_) {}
    }
    window.__yuduLoginWatch = setInterval(capture, 900);
    capture();
  })(); true;`;
}
