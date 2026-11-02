import type { Credential, ProviderKind, QuotaSnapshot, Source } from '../domain/types';
import { score } from '../vendor/dsh-gateway-wallet/fingerprint';
import { parseAdmin, parseCustom, parseDeepSeek, parseNewApi, parseOneApi, parseOpenRouter, parseSub2 } from './parsers';
import { createRequester, nonnegative, object, QuotaError, type Requester, string, unwrap } from './transport';

export const request = createRequester();
const adminAuth = (credential: Credential) => credential.mode === 'session' ? 'bearer' as const : 'x-api-key' as const;

/** Only public, read-only requests are made while identifying a relay. */
export async function detectProvider(source: Source, ask: Requester = request): Promise<Exclude<ProviderKind, 'auto'>> {
  const host = new URL(source.baseUrl).hostname.toLowerCase();
  if (host === 'api.deepseek.com') return 'deepseek';
  if (host === 'openrouter.ai') return 'openrouter';
  const paths = ['/api/v1/settings/public', '/api/status', '/v1/usage', '/api/usage/token/'];
  const results = await Promise.allSettled(paths.map(path => ask(source, path, undefined, { auth: 'none', timeoutMs: 4500 })));
  const publicData = (index: number) => { const r = results[index]; if (r.status !== 'fulfilled') return undefined; try { return unwrap(r.value); } catch { return undefined; } };
  const sub2 = publicData(0);
  const newapi = publicData(1);
  if (newapi && nonnegative(newapi.quota_per_unit)) return 'newapi';
  if (sub2 && (string(sub2.site_name) || typeof sub2.registration_enabled === 'boolean')) return 'sub2api';
  const statuses: Record<string, number> = {};
  results.forEach((result, index) => {
    const path = paths[index].replace(/\/$/, '');
    statuses[path] = result.status === 'fulfilled' ? 200 : result.reason instanceof QuotaError ? result.reason.status ?? 0 : 0;
  });
  const fingerprint = score(statuses);
  if (fingerprint.software !== 'unknown') return fingerprint.software;
  throw new QuotaError('UNSUPPORTED', '未能识别站点类型，请手动选择接入方式');
}

export async function fetchSnapshot(source: Source, credential: Credential, ask: Requester = request, now = new Date().toISOString()): Promise<{ snapshot: QuotaSnapshot; kind: Exclude<ProviderKind, 'auto'> }> {
  const kind = source.resolvedKind ?? (source.kind === 'auto' ? await detectProvider(source, ask) : source.kind);
  let snapshot: QuotaSnapshot;
  switch (kind) {
    case 'sub2api': snapshot = parseSub2(await ask(source, '/v1/usage', credential), source, now); break;
    case 'sub2-admin': {
      if (!source.accountId || !Number.isSafeInteger(source.accountId)) throw new QuotaError('CONFIG', '请先选择上游账号');
      snapshot = parseAdmin(await ask(source, `/api/v1/admin/accounts/${source.accountId}`, credential, { auth: adminAuth(credential) }), source, now);
      break;
    }
    case 'newapi': {
      const [status, usage] = await Promise.all([
        ask(source, '/api/status', undefined, { auth: 'none' }), ask(source, '/api/usage/token/', credential),
      ]);
      snapshot = parseNewApi(usage, status, source, now); break;
    }
    case 'oneapi': {
      let result: QuotaSnapshot | undefined;
      for (const prefix of ['/v1', '']) {
        try {
          const subscription = await ask(source, `${prefix}/dashboard/billing/subscription`, credential);
          const usage = await ask(source, `${prefix}/dashboard/billing/usage`, credential);
          result = parseOneApi(subscription, usage, source, now); break;
        } catch (error) {
          if (!(error instanceof QuotaError) || !['UNSUPPORTED'].includes(error.code)) throw error;
        }
      }
      if (!result) throw new QuotaError('UNSUPPORTED', '站点没有开放账单额度接口');
      snapshot = result; break;
    }
    case 'openrouter': snapshot = parseOpenRouter(await ask(source, '/api/v1/credits', credential), source, now); break;
    case 'deepseek': snapshot = parseDeepSeek(await ask(source, '/user/balance', credential), source, now); break;
    case 'custom': {
      if (!source.custom) throw new QuotaError('CONFIG', '请先配置自定义接口');
      snapshot = parseCustom(await ask(source, source.custom.path, credential, { auth: source.custom.auth }), source.custom, source, now); break;
    }
    default: throw new QuotaError('UNSUPPORTED', '暂不支持这种接入方式');
  }
  return { snapshot, kind };
}

export interface AdminAccount { id: number; name: string; platform: string; type: string; hasQuota: boolean }

export async function listAdminAccounts(source: Source, credential: Credential, ask: Requester = request): Promise<AdminAccount[]> {
  const accounts: AdminAccount[] = [];
  for (let page = 1; page <= 10; page++) {
    const data = unwrap(await ask(source, `/api/v1/admin/accounts?page=${page}&page_size=100`, credential, { auth: adminAuth(credential) }));
    const rows = Array.isArray(data.items) ? data.items : Array.isArray(data.accounts) ? data.accounts : [];
    for (const row of rows) {
      const item = object(row); const id = nonnegative(item?.id); const extra = object(item?.extra);
      if (!id || !Number.isSafeInteger(id)) continue;
      accounts.push({ id, name: string(item?.name) ?? `账号 ${id}`, platform: string(item?.platform) ?? 'unknown', type: string(item?.type) ?? '',
        hasQuota: nonnegative(extra?.codex_5h_used_percent) !== undefined || nonnegative(item?.quota_limit) !== undefined });
    }
    const total = nonnegative(data.total);
    if (rows.length < 100 || (total !== undefined && accounts.length >= total)) break;
    if (page === 10) throw new QuotaError('UNSUPPORTED', '账号超过 1000 个，请通过账号 ID 添加需要监控的账号');
  }
  return accounts;
}

export async function loginAdmin(source: Source, email: string, password: string, ask: Requester = request): Promise<Credential> {
  const data = unwrap(await ask(source, '/api/v1/auth/login', undefined, { auth: 'none', method: 'POST', body: { email: email.trim(), password } }));
  if (data.requires_2fa === true) throw new QuotaError('AUTH', '后台启用了二次验证，请使用管理密钥连接');
  if (object(data.user)?.role !== 'admin') throw new QuotaError('FORBIDDEN', '查看反代账号需要后台管理权限');
  return sessionFromResponse(data);
}

function sessionFromResponse(data: Record<string, unknown>): Credential {
  const accessToken = string(data.access_token);
  if (!accessToken) throw new QuotaError('AUTH', '后台未返回有效登录状态');
  const seconds = Math.min(nonnegative(data.expires_in) ?? 300, 86400);
  return { mode: 'session', accessToken, refreshToken: string(data.refresh_token), expiresAt: new Date(Date.now() + seconds * 1000).toISOString() };
}

export async function refreshSession(source: Source, credential: Credential, ask: Requester = request): Promise<Credential> {
  if (!credential.refreshToken) throw new QuotaError('AUTH', '后台登录已失效，请重新连接');
  return sessionFromResponse(unwrap(await ask(source, '/api/v1/auth/refresh', undefined, { auth: 'none', method: 'POST', body: { refresh_token: credential.refreshToken } })));
}
