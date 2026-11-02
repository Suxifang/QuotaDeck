import { useCallback, useEffect, useRef, useState } from 'react';
import type { ErrorCode, UsagePage } from '../domain/types';
import { QuotaError } from '../providers/transport';
import { USAGE_PAGE_SIZE } from '../providers/usage';
import { createDemoUsage } from './demo';

export function useUsageRecords(sourceId: string, active: boolean, demo: boolean, read: (id: string, page?: number) => Promise<UsagePage>) {
  const [result, setResult] = useState<UsagePage>();
  const [error, setError] = useState<{ message: string; code: ErrorCode }>();
  const [loading, setLoading] = useState(false);
  const [localPage, setLocalPage] = useState(1);
  const serial = useRef(0);
  const pending = useRef(false);
  useEffect(() => () => { serial.current++; }, []);

  const load = useCallback(async (page = 1) => {
    if (pending.current) return;
    pending.current = true;
    const request = ++serial.current;
    setLoading(true); setError(undefined);
    try {
      const next = demo ? createDemoUsage(sourceId, page) : await read(sourceId, page);
      if (serial.current !== request) return;
      setResult(next); setLocalPage(1);
    } catch (err) {
      if (serial.current === request) setError({ message: err instanceof QuotaError ? err.message : '暂时无法读取使用记录，请稍后重试', code: err instanceof QuotaError ? err.code : 'NETWORK' });
    } finally {
      if (serial.current === request) { pending.current = false; setLoading(false); }
    }
  }, [sourceId, demo, read]);

  useEffect(() => {
    if (!active || result || error || loading) return;
    // Let the sheet draw its first frame before beginning a log query.
    const frame = requestAnimationFrame(() => void load());
    return () => cancelAnimationFrame(frame);
  }, [active, result, error, loading, load]);

  const recent = result?.recentOnly;
  const page = recent ? localPage : result?.page ?? 1;
  const records = recent ? result.records.slice((page - 1) * USAGE_PAGE_SIZE, page * USAGE_PAGE_SIZE) : result?.records ?? [];
  const hasNext = recent ? localPage * USAGE_PAGE_SIZE < result.records.length : result?.nextPage !== undefined;
  return {
    result, records, page, hasNext, loading, error,
    refresh: () => void load(),
    previous: () => { if (loading || page <= 1) return; if (recent) setLocalPage(value => value - 1); else void load(page - 1); },
    next: () => { if (loading || !hasNext) return; if (recent) setLocalPage(value => value + 1); else void load(result!.nextPage!); },
  };
}

export type UsageRecordsState = ReturnType<typeof useUsageRecords>;
