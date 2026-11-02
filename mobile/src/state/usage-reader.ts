import type { Credential, Source, UsagePage } from '../domain/types';
import { QuotaError } from '../providers/transport';

/** Reuses the same session renewal as quota queries and rejects late results after reconnect. */
export function createUsageReader(deps: {
  source: (id: string) => Source | undefined;
  generation: (id: string) => number;
  read: (id: string, source: Source) => Promise<Credential | undefined>;
  renew: (source: Source, credential: Credential) => Promise<Credential>;
  fetch: (source: Source, credential: Credential, page: number) => Promise<UsagePage>;
}) {
  return async (id: string, page = 1): Promise<UsagePage> => {
    const source = deps.source(id);
    if (!source) throw new QuotaError('CONFIG', '这个连接已移除');
    const generation = deps.generation(source.connectionId);
    const check = () => {
      const current = deps.source(id);
      if (deps.generation(source.connectionId) !== generation || current?.connectionId !== source.connectionId || current?.accountId !== source.accountId || current?.baseUrl !== source.baseUrl) {
        throw new QuotaError('AUTH', '连接已更换，请重新打开使用记录');
      }
    };
    let credential = await deps.read(source.connectionId, source);
    check();
    if (!credential) throw new QuotaError('AUTH', (source.resolvedKind ?? source.kind) === 'sub2api' ? '登录购买套餐的站点账号后，即可查看当前密钥的使用记录。' : '请重新连接这个站点');
    if (credential.mode === 'session' && (!credential.expiresAt || Date.parse(credential.expiresAt) <= Date.now() + 60_000)) credential = await deps.renew(source, credential);
    check();
    let result: UsagePage;
    try { result = await deps.fetch(source, credential, page); }
    catch (error) {
      check();
      if (error instanceof QuotaError && error.code === 'AUTH' && credential.mode === 'session') {
        const fresh = await deps.renew(source, credential);
        check();
        result = await deps.fetch(source, fresh, page);
      } else throw error;
    }
    check();
    return result;
  };
}
