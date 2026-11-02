import type { Credential, Source } from '../domain/types';
import { refreshSession, request, sessionFromResponse } from './registry';
import { nonnegative, object, QuotaError, type Requester, string, unwrap } from './transport';

export type UsageLoginInput = { email?: string; password?: string; tempToken?: string; code?: string };
export type UsageLoginResult = { requiresTwoFactor: true; tempToken: string } | { credential: Credential };
const positiveId = (value: unknown) => { const id = nonnegative(value); return id && Number.isSafeInteger(id) ? id : undefined; };

export async function refreshUsageUser(source: Source, credential: Credential, ask: Requester = request): Promise<Credential> {
  if (!credential.userId || !credential.apiKeyId) throw new QuotaError('AUTH', '请重新登录站点并关联当前密钥');
  return { ...await refreshSession(source, credential, ask), userId: credential.userId, apiKeyId: credential.apiKeyId };
}

/** Match the full key locally. Never put any part of a secret into a query string. */
export async function matchUserKey(source: Source, apiKey: string, session: Credential, userId: number, ask: Requester = request): Promise<number> {
  for (let page = 1; page <= 10; page++) {
    const data = unwrap(await ask(source, `/api/v1/keys?page=${page}&page_size=100`, session));
    if (!Array.isArray(data.items) || data.items.length > 100 || (data.page !== undefined && nonnegative(data.page) !== page)) throw new QuotaError('INVALID', '站点的密钥列表格式不兼容');
    for (const row of data.items) {
      const item = object(row);
      if (string(item?.key) !== apiKey.trim()) continue;
      const id = positiveId(item?.id);
      if (!id || positiveId(item?.user_id) !== userId) throw new QuotaError('INVALID', '密钥与登录账号不一致，已停止连接');
      return id;
    }
    if (data.items.length < 100 || (nonnegative(data.pages) ?? Infinity) <= page) break;
  }
  throw new QuotaError('CONFIG', '没有在此账号中找到当前 API Key。请使用购买套餐的站点账号登录；本站若隐藏完整密钥，暂时无法准确关联记录。');
}

export async function loginUsageUser(source: Source, apiKey: string, input: UsageLoginInput, ask: Requester = request): Promise<UsageLoginResult> {
  const secondFactor = !!input.tempToken;
  if (secondFactor ? !/^\d{6}$/.test(input.code ?? '') : !input.email?.trim() || !input.password) throw new QuotaError('CONFIG', secondFactor ? '请输入六位验证码' : '请输入站点邮箱和密码');
  let data: Record<string, unknown>;
  try {
    data = unwrap(await ask(source, secondFactor ? '/api/v1/auth/login/2fa' : '/api/v1/auth/login', undefined, {
      auth: 'none', method: 'POST', body: secondFactor ? { temp_token: input.tempToken, totp_code: input.code } : { email: input.email!.trim(), password: input.password },
    }));
  } catch (error) {
    if (error instanceof QuotaError && [400, 401, 403].includes(error.status ?? 0)) throw new QuotaError('AUTH', secondFactor ? '验证码未通过，或本次登录已过期，请重试' : '登录未通过，请检查邮箱和密码。若站点要求网页人机验证或第三方登录，暂时无法直接登录。', error.status);
    throw error;
  }
  if (data.requires_2fa === true) {
    const tempToken = string(data.temp_token);
    if (!tempToken) throw new QuotaError('INVALID', '站点未返回有效的两步验证信息');
    return { requiresTwoFactor: true, tempToken };
  }
  const userId = positiveId(object(data.user)?.id);
  if (!userId) throw new QuotaError('INVALID', '站点未返回有效的用户信息');
  const session = sessionFromResponse(data);
  const apiKeyId = await matchUserKey(source, apiKey, session, userId, ask);
  return { credential: { ...session, userId, apiKeyId } };
}
