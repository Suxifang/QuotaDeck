import type { Credential, Source } from '../domain/types';
import { QuotaError } from '../providers/transport';

/** One refresh per connection, including late 401s that arrive after token rotation. */
export function createSessionRenewal(deps: {
  read: (id: string) => Promise<Credential | undefined>;
  write: (id: string, credential: Credential) => Promise<void>;
  refresh: (source: Source, credential: Credential) => Promise<Credential>;
}) {
  const pending = new Map<string, Promise<Credential>>();
  const versions = new Map<string, number>();
  return {
    invalidate(id: string) { versions.set(id, (versions.get(id) ?? 0) + 1); pending.delete(id); },
    renew(source: Source, rejected: Credential): Promise<Credential> {
      const id = source.connectionId;
      const existing = pending.get(id);
      if (existing) return existing;
      const version = versions.get(id) ?? 0;
      const check = () => { if ((versions.get(id) ?? 0) !== version) throw new QuotaError('AUTH', '连接已更换，请重新刷新'); };
      const work = (async () => {
        const latest = await deps.read(id);
        check();
        if (!latest) throw new QuotaError('AUTH', '请重新连接这个站点');
        if (latest.mode !== rejected.mode || latest.accessToken !== rejected.accessToken) return latest;
        const fresh = await deps.refresh(source, latest);
        check();
        await deps.write(id, fresh);
        return fresh;
      })();
      pending.set(id, work);
      void work.finally(() => { if (pending.get(id) === work) pending.delete(id); }).catch(() => {});
      return work;
    },
  };
}
