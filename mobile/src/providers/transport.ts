import type { Credential, ErrorCode, Source } from '../domain/types';
import { buildRequestUrl } from '../vendor/sub2api-mobile/request-url';

export class QuotaError extends Error {
  constructor(public code: ErrorCode, message: string, public status?: number) { super(message); this.name = 'QuotaError'; }
}

export type Json = Record<string, unknown>;
export const object = (value: unknown): Json | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : undefined;
export const numeric = (value: unknown): number | undefined => {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};
export const nonnegative = (value: unknown) => { const n = numeric(value); return n !== undefined && n >= 0 ? n : undefined; };
export const string = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;

export function date(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = numeric(value);
  const time = n !== undefined ? (n < 10_000_000_000 ? n * 1000 : n) : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) && time > 0 ? new Date(time).toISOString() : undefined;
}

export function unwrap(value: unknown): Json {
  const root = object(value);
  if (!root || root.success === false || root.is_active === false || root.isValid === false ||
      (typeof root.code === 'number' && root.code !== 0 && root.code !== 200)) {
    throw new QuotaError('INVALID', '接口未返回有效数据');
  }
  return object(root.data) ?? root;
}

export function isPrivateHost(input: string): boolean {
  const host = input.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1') return true;
  if (/^f[cd][\da-f]{2}:/.test(host) || /^fe[89ab][\da-f]:/.test(host)) return true;
  const parts = host.split('.').map(Number);
  return parts.length === 4 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (parts[0] === 127 || parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31));
}

export function normalizeBaseUrl(input: string): string {
  try {
    const url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
    if (!url.hostname || url.username || url.password || url.search || url.hash || !['http:', 'https:'].includes(url.protocol)) throw new Error();
    if (url.protocol === 'http:' && !isPrivateHost(url.hostname)) throw new QuotaError('CONFIG', '公网地址请使用 HTTPS');
    const path = url.pathname.replace(/\/+$/, '').replace(/\/(?:api\/v1|v1|api)$/i, '');
    return `${url.origin}${path}`;
  } catch (error) {
    if (error instanceof QuotaError) throw error;
    throw new QuotaError('CONFIG', '请输入有效的站点地址，不要包含密钥或查询参数');
  }
}

export function requestUrl(baseUrl: string, path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://') || /(?:^|\/)\.\.(?:\/|$)/.test(path) || /[\r\n\\]/.test(path)) {
    throw new QuotaError('CONFIG', '接口路径必须是当前站点内的路径');
  }
  const base = new URL(normalizeBaseUrl(baseUrl));
  const result = new URL(buildRequestUrl(`${base.origin}${base.pathname.replace(/\/$/, '')}`, path));
  if (result.origin !== base.origin) throw new QuotaError('CONFIG', '接口地址与站点不一致');
  return result.toString();
}

export interface RequestOptions {
  auth?: 'bearer' | 'x-api-key' | 'none';
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
}

export type Requester = (source: Pick<Source, 'baseUrl'>, path: string, credential: Credential | undefined, options?: RequestOptions) => Promise<unknown>;

export function createRequester(fetcher: typeof fetch = fetch): Requester {
  return async (source, path, credential, options = {}) => {
    const token = credential?.mode === 'session' ? credential.accessToken : credential?.apiKey;
    const auth = options.auth ?? 'bearer';
    if (auth !== 'none' && !token) throw new QuotaError('AUTH', '请重新连接这个站点');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (auth === 'bearer' && token) headers.Authorization = `Bearer ${token}`;
    if (auth === 'x-api-key' && token) headers['x-api-key'] = token;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
    try {
      const response = await fetcher(requestUrl(source.baseUrl, path), {
        method: options.method ?? 'GET', headers, redirect: 'error', signal: controller.signal,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
      if (response.status === 401) throw new QuotaError('AUTH', '登录已失效或密钥无效，请重新连接', 401);
      if (response.status === 403) throw new QuotaError('FORBIDDEN', '当前凭据没有查看这项额度的权限', 403);
      if (response.status === 429) throw new QuotaError('RATE_LIMIT', '查询较频繁，稍后会自动重试', 429);
      if (response.status === 404 || response.status === 405) throw new QuotaError('UNSUPPORTED', '站点未提供这个查询接口', response.status);
      if (!response.ok) throw new QuotaError('NETWORK', `站点暂时不可用（${response.status}）`, response.status);
      const text = await response.text();
      if (text.length > 4 * 1024 * 1024) throw new QuotaError('INVALID', '接口数据过大');
      try { return JSON.parse(text); } catch { throw new QuotaError('INVALID', '接口返回了网页或无法识别的数据'); }
    } catch (error) {
      if (error instanceof QuotaError) throw error;
      throw new QuotaError('NETWORK', '连接超时或网络不可用，请检查手机能否访问这个地址');
    } finally { clearTimeout(timeout); }
  };
}

export function atPath(root: unknown, path: string | undefined): unknown {
  if (!path) return undefined;
  const parts = path.split('.');
  if (parts.length > 12 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p) || ['__proto__', 'prototype', 'constructor'].includes(p))) {
    throw new QuotaError('CONFIG', '字段路径格式无效');
  }
  return parts.reduce<unknown>((value, part) => object(value)?.[part], root);
}
