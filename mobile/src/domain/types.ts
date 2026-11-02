export type ProviderKind = 'auto' | 'sub2api' | 'sub2-admin' | 'newapi' | 'oneapi' | 'openrouter' | 'deepseek' | 'custom';
export type Unit = string;
export type MetricScope = 'account' | 'key' | 'subscription' | 'upstream';

export interface QuotaMetric {
  id: string;
  label: string;
  scope: MetricScope;
  unit: Unit;
  remaining?: number;
  used?: number;
  limit?: number;
  unlimited?: boolean;
  resetAt?: string;
  resetEstimated?: boolean;
  sampledAt?: string;
}

export interface QuotaSnapshot {
  sourceId: string;
  fetchedAt: string;
  metrics: QuotaMetric[];
  today?: { value: number; unit: Unit };
  expiresAt?: string;
  accountName?: string;
  notice?: string;
}

export interface CustomMapping {
  path: string;
  auth: 'bearer' | 'x-api-key';
  remainingPath: string;
  usedPath?: string;
  limitPath?: string;
  resetPath?: string;
  sampledPath?: string;
  unit: string;
  scale: number;
}

export interface Source {
  id: string;
  connectionId: string;
  name: string;
  baseUrl: string;
  kind: ProviderKind;
  resolvedKind?: Exclude<ProviderKind, 'auto'>;
  accountId?: number;
  pinned: boolean;
  enabled: boolean;
  custom?: CustomMapping;
}

/** Stored in Keychain on native platforms, never in the ordinary config or export. */
export interface Credential {
  mode: 'key' | 'session';
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  /** Only used by a separately stored site-user login for usage records. */
  userId?: number;
  apiKeyId?: number;
}

export interface SourceState {
  snapshot?: QuotaSnapshot;
  refreshing?: boolean;
  error?: string;
  errorCode?: ErrorCode;
  checkedAt?: string;
}

export type ErrorCode = 'NETWORK' | 'AUTH' | 'FORBIDDEN' | 'RATE_LIMIT' | 'UNSUPPORTED' | 'INVALID' | 'CONFIG';

export interface HistoryPoint {
  date: string;
  metrics: { id: string; remaining?: number; used?: number; unit: Unit }[];
}

/** A display-only projection. Request bodies, IPs and credentials are never retained. */
export interface UsageRecord {
  id: string;
  model: string;
  createdAt?: string;
  cost?: { value: number; unit: Unit; kind: 'actual' | 'standard' };
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  firstTokenMs?: number;
  durationMs?: number;
  reasoningEffort?: string;
  stream?: boolean;
  failed?: boolean;
}

export interface UsagePage {
  records: UsageRecord[];
  page: number;
  nextPage?: number;
  recentOnly: boolean;
  notice?: string;
  fetchedAt: string;
}

export interface Preferences {
  theme: 'light' | 'dark' | 'system';
  refreshSeconds: 30 | 60 | 120 | 300;
  lowThreshold: number;
  haptics: boolean;
  widgetSourceId?: string;
}

export interface SavedData {
  version: 1;
  sources: Source[];
  states: Record<string, SourceState>;
  history: Record<string, HistoryPoint[]>;
  preferences: Preferences;
}

export const DEFAULT_PREFERENCES: Preferences = { theme: 'light', refreshSeconds: 60, lowThreshold: 20, haptics: true };
export const PROVIDER_LABELS: Record<ProviderKind, string> = {
  auto: '自动识别', sub2api: 'Sub2API 套餐', 'sub2-admin': 'Sub2API 反代',
  newapi: 'New API', oneapi: 'One API', openrouter: 'OpenRouter', deepseek: 'DeepSeek', custom: '自定义接口',
};
