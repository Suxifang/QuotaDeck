// Adapted from CrossStar/sub2api-dashboard (MIT). See licenses/sub2api-dashboard.txt.
import { AppError } from './errors';
import type {
  NormalizedAccountSnapshot,
  RawUpstreamAccount,
} from './types';

const topLevelFields = [
  'quota_used',
  'quota_limit',
  'quota_resets_at',
  'quota_daily_used',
  'quota_daily_limit',
  'quota_daily_resets_at',
  'quota_monthly_used',
  'quota_monthly_limit',
  'quota_monthly_resets_at',
] as const;

const codexFields = [
  'codex_5h_used_percent',
  'codex_5h_reset_after_seconds',
  'codex_5h_window_minutes',
  'codex_5h_reset_at',
  'codex_7d_used_percent',
  'codex_7d_reset_after_seconds',
  'codex_7d_window_minutes',
  'codex_7d_reset_at',
  'codex_usage_updated_at',
] as const;

function safeScalar(value: unknown): string | number | boolean | undefined {
  return typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
    ? value
    : undefined;
}

/**
 * Security boundary: convert an upstream account into the only account shape
 * that account caches and snapshot mapping are allowed to retain.
 */
export function normalizeAccount(
  raw: RawUpstreamAccount,
): NormalizedAccountSnapshot {
  const id = raw.id;
  if (typeof id !== 'string' && typeof id !== 'number') {
    throw new AppError(502, 'UPSTREAM_INVALID_ACCOUNT', 'Invalid account');
  }

  const normalized: NormalizedAccountSnapshot = { id };
  for (const field of [
    'platform',
    'provider',
    'type',
    'auth_type',
    'credential_type',
    'status',
    'availability',
    'available',
  ] as const) {
    const value = safeScalar(raw[field]);
    if (value !== undefined) normalized[field] = value;
  }
  for (const field of topLevelFields) {
    const value = safeScalar(raw[field]);
    if (value !== undefined) normalized[field] = value;
  }

  const extra =
    raw.extra && typeof raw.extra === 'object'
      ? (raw.extra as Record<string, unknown>)
      : undefined;
  if (extra) {
    for (const field of codexFields) {
      const value = safeScalar(extra[field]);
      if (value !== undefined) normalized[field] = value;
    }
  }

  return normalized;
}
