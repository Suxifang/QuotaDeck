import type { SavedData } from '../domain/types';
import { widgetTimeline, type WidgetData } from './model';

type Timeline = ReturnType<typeof widgetTimeline>;
interface Target { updateTimeline: (timeline: Timeline) => void; getTimeline: () => Promise<Timeline> }
export interface WidgetSyncResult { supported: boolean; accountCount: number; syncedAt: number }

const stageLabels = {
  configuration: '小组件账号选项更新',
  'focus-write': '关注账号小组件写入',
  'overview-write': '常用账号小组件写入',
  'focus-read': '关注账号小组件回读',
  'overview-read': '常用账号小组件回读',
};
export type WidgetSyncStage = keyof typeof stageLabels;

export class WidgetSyncError extends Error {
  constructor(readonly stage: WidgetSyncStage, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '原生接口未返回错误详情';
    super(`${stageLabels[stage]}失败：${detail}`, { cause });
    this.name = 'WidgetSyncError';
  }
}

async function nativeStep<T>(stage: WidgetSyncStage, operation: () => T | Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) { throw new WidgetSyncError(stage, error); }
}

const signatureOf = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(signatureOf).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${signatureOf(item)}`).join(',')}}`;
  return JSON.stringify(value);
};

/** Serialize native writes and verify their display data before reporting success. */
export function createWidgetPublisher(bridge: {
  available: () => boolean; focus: Target; overview: Target; configure: (data: WidgetData) => void;
}) {
  let lastSignature = '';
  let lastResult: WidgetSyncResult | undefined;
  let pending = Promise.resolve();
  return (data: SavedData, force = false): Promise<WidgetSyncResult> => {
    const publish = async () => {
      if (!bridge.available()) throw new Error('当前安装无法访问小组件共享空间（App Group）。这与置顶无关，需要检查主应用与小组件的签名共享权限。');
      const timeline = widgetTimeline(data);
      const signature = signatureOf(timeline.map(entry => entry.props));
      if (!force && signature === lastSignature && lastResult) return lastResult;
      await nativeStep('configuration', () => bridge.configure(timeline[0].props));
      await nativeStep('focus-write', () => bridge.focus.updateTimeline(timeline));
      await nativeStep('overview-write', () => bridge.overview.updateTimeline(timeline));
      const results = await Promise.all([
        nativeStep('focus-read', () => bridge.focus.getTimeline()),
        nativeStep('overview-read', () => bridge.overview.getTimeline()),
      ]);
      if (results.some(entries => signatureOf(entries.map(entry => entry.props)) !== signature)) {
        throw new Error('小组件数据未能写入共享空间，请重新打开应用后再试。');
      }
      lastSignature = signature;
      lastResult = { supported: true, accountCount: timeline[0].props.accounts.length, syncedAt: Date.now() };
      return lastResult;
    };
    const result = pending.then(publish);
    pending = result.then(() => {}, () => {});
    return result;
  };
}
