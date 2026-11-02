import type { SavedData } from '../domain/types';
import { widgetTimeline, type WidgetData } from './model';

type Timeline = ReturnType<typeof widgetTimeline>;
interface Target { updateTimeline: (timeline: Timeline) => void; getTimeline: () => Promise<Timeline> }
export interface WidgetSyncResult { supported: boolean; accountCount: number; syncedAt: number }

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
      if (!bridge.available()) throw new Error('小组件共享空间不可用。请在 LCSign 中同时签署主应用与小组件，并保留二者相同的 App Group 权限后覆盖安装。');
      const timeline = widgetTimeline(data);
      const signature = signatureOf(timeline.map(entry => entry.props));
      if (!force && signature === lastSignature && lastResult) return lastResult;
      bridge.configure(timeline[0].props);
      bridge.focus.updateTimeline(timeline);
      bridge.overview.updateTimeline(timeline);
      const results = await Promise.all([bridge.focus.getTimeline(), bridge.overview.getTimeline()]);
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
