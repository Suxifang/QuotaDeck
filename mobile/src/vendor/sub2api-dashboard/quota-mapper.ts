// Adapted from CrossStar/sub2api-dashboard (MIT). See licenses/sub2api-dashboard.txt.
import type { NormalizedAccountSnapshot } from './types';
export type PublicWindow = {
  kind: string;
  used: number;
  limit: number;
  utilization: number;
  resetsAt?: string;
};
export type PublicQuota = {
  state: 'fresh' | 'stale' | 'unknown';
  source: 'passive' | 'local' | 'none';
  windows: PublicWindow[];
};
function finite(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}
function window(
  kind: string,
  used: unknown,
  limit: unknown,
  reset?: unknown,
): PublicWindow | undefined {
  const u = finite(used),
    l = finite(limit);
  if (u === undefined || l === undefined || l <= 0) return;
  return {
    kind,
    used: u,
    limit: l,
    utilization: u / l,
    ...(typeof reset === 'string' ? { resetsAt: reset } : {}),
  };
}
function utilizationWindow(
  kind: string,
  value: Record<string, unknown>,
): PublicWindow | undefined {
  const utilization = finite(value.utilization);
  if (utilization === undefined) return;
  return {
    kind,
    used: utilization,
    limit: 100,
    utilization: utilization / 100,
    ...(typeof value.resets_at === 'string'
      ? { resetsAt: value.resets_at }
      : {}),
  };
}
function object(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
export function normalizeAvailability(
  account: NormalizedAccountSnapshot,
): 'available' | 'temporarily_limited' | 'unavailable' | 'unknown' {
  const status = String(
    account.status ?? account.availability ?? '',
  ).toLowerCase();
  if (
    account.available === true ||
    ['active', 'available', 'ready'].includes(status)
  )
    return 'available';
  if (
    ['limited', 'rate_limited', 'temporarily_limited', 'cooldown'].includes(
      status,
    )
  )
    return 'temporarily_limited';
  if (
    account.available === false ||
    ['disabled', 'unavailable', 'banned', 'error'].includes(status)
  )
    return 'unavailable';
  return 'unknown';
}
export function localQuota(a: NormalizedAccountSnapshot): PublicQuota {
  const windows: PublicWindow[] = [];
  for (const [kind, prefix] of [
    ['total', 'quota'],
    ['daily', 'quota_daily'],
    ['monthly', 'quota_monthly'],
  ] as const) {
    const w = window(
      kind,
      a[`${prefix}_used`],
      a[`${prefix}_limit`],
      a[`${prefix}_resets_at`],
    );
    if (w) windows.push(w);
  }
  return windows.length
    ? { state: 'fresh', source: 'local', windows }
    : { state: 'unknown', source: 'none', windows: [] };
}
function dateMs(value: unknown): number | undefined {
  if (typeof value !== 'string') return;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function codexWindow(
  a: NormalizedAccountSnapshot,
  name: '5h' | '7d',
  now: number,
): { window: PublicWindow; resetValid: boolean } | undefined {
  const percent = finite(a[`codex_${name}_used_percent`]);
  if (percent === undefined) return;

  const explicitReset = dateMs(a[`codex_${name}_reset_at`]);
  const updatedAt = dateMs(a.codex_usage_updated_at);
  const resetAfter = finite(a[`codex_${name}_reset_after_seconds`]);
  const derivedReset =
    updatedAt !== undefined && resetAfter !== undefined
      ? updatedAt + resetAfter * 1000
      : undefined;
  const reset = explicitReset ?? derivedReset;
  const resetValid = reset !== undefined && reset > now;

  return {
    window: {
      kind: name,
      used: percent,
      limit: 100,
      utilization: percent / 100,
      ...(resetValid ? { resetsAt: new Date(reset).toISOString() } : {}),
    },
    resetValid,
  };
}

export function codexQuota(
  a: NormalizedAccountSnapshot,
  now = Date.now(),
): PublicQuota {
  const entries = (['5h', '7d'] as const).flatMap((name) => {
    const entry = codexWindow(a, name, now);
    return entry ? [entry] : [];
  });
  if (!entries.length)
    return { state: 'unknown', source: 'local', windows: [] };

  const updatedAt = dateMs(a.codex_usage_updated_at);
  const updateFresh =
    updatedAt !== undefined &&
    updatedAt >= now - 24 * 60 * 60 * 1000 &&
    updatedAt <= now + 5 * 60 * 1000;
  const fresh = updateFresh && entries.every((entry) => entry.resetValid);
  return {
    state: fresh ? 'fresh' : 'stale',
    source: 'local',
    windows: entries.map((entry) => entry.window),
  };
}

export function passiveQuota(raw: unknown, stale = false): PublicQuota {
  const root = object(
    raw && typeof raw === 'object' && 'data' in raw
      ? (raw as { data: unknown }).data
      : raw,
  );
  const candidates: [string, Record<string, unknown>][] = [];
  for (const [name, value] of Object.entries(root)) {
    if (value && typeof value === 'object')
      candidates.push([name, object(value)]);
  }
  if ('used' in root || 'limit' in root) candidates.push(['total', root]);
  const windows = candidates.flatMap(([name, v]) => {
    const kind = name.replace(/_/g, '-');
    const w =
      window(
        kind,
        v.used ?? v.utilization_used,
        v.limit ?? v.utilization_limit,
        v.resets_at ?? v.reset_at,
      ) ?? utilizationWindow(kind, v);
    return w ? [w] : [];
  });
  return windows.length
    ? { state: stale ? 'stale' : 'fresh', source: 'passive', windows }
    : { state: 'unknown', source: 'passive', windows: [] };
}
export function isOpenAiOAuth(a: NormalizedAccountSnapshot): boolean {
  const p = String(a.platform ?? a.provider ?? '').toLowerCase();
  const t = String(
    a.type ?? a.auth_type ?? a.credential_type ?? '',
  ).toLowerCase();
  return p.includes('openai') && t.includes('oauth');
}

export function isPassiveAnthropic(a: NormalizedAccountSnapshot): boolean {
  const p = String(a.platform ?? a.provider ?? '').toLowerCase();
  const t = String(
    a.type ?? a.auth_type ?? a.credential_type ?? '',
  ).toLowerCase();
  return (
    p.includes('anthropic') && (t.includes('oauth') || t.includes('setup'))
  );
}
