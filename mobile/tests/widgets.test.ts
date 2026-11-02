import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, type SavedData, type Source } from '../src/domain/types';
import { focusAccount, widgetData, widgetTimeline } from '../src/widgets/model';

const now = Date.parse('2026-11-02T03:00:00Z');
const source: Source = { id: 'source-1', name: 'Test', baseUrl: 'https://private.example', connectionId: 'secret-session', kind: 'sub2-admin', pinned: false, enabled: true };
function data(): SavedData {
  return { version: 1, preferences: { ...DEFAULT_PREFERENCES }, history: {}, sources: [source], states: {
    [source.id]: { snapshot: { sourceId: source.id, fetchedAt: new Date(now).toISOString(), metrics: [
      { id: '5h', label: '五小时', scope: 'upstream', unit: '%', remaining: 0, sampledAt: new Date(now - 60_000).toISOString(), resetAt: new Date(now + 5 * 60_000).toISOString() },
    ] } },
  } };
}

describe('widget snapshots and future timelines', () => {
  it('shares display data only, preserving real zero without exposing backend metadata', () => {
    const saved = data();
    saved.states[source.id].error = 'https://private.example?token=secret-token';
    const props = widgetData(saved, now);
    expect(props.accounts[0].metrics[0].value).toBe('0%');
    expect(props.accounts[0].status).toBe('连接待检查');
    expect(JSON.stringify(props)).not.toMatch(/private\.example|secret-session|secret-token|baseUrl|connectionId/);
  });
  it('prioritizes pinned accounts, omits paused accounts, and honors the focus choice', () => {
    const saved = data();
    saved.sources.push({ ...source, id: 'paused', enabled: false, pinned: true }, { ...source, id: 'pinned', pinned: true });
    const props = widgetData(saved, now);
    expect(props.accounts.map(item => item.id)).toEqual(['pinned', source.id]);
    expect(focusAccount(props)?.id).toBe('pinned');
    expect(focusAccount({ ...props, focusId: source.id })?.id).toBe(source.id);
    expect(focusAccount({ ...props, focusId: 'deleted' })?.id).toBe('pinned');
  });
  it('marks elapsed resets as pending without inventing renewed quota', () => {
    const timeline = widgetTimeline(data(), now);
    const reset = timeline.find(entry => entry.date.getTime() === now + 5 * 60_000)!;
    expect(reset.props.accounts[0].metrics[0]).toMatchObject({ value: '0%', percent: 0, stale: true, resetText: '等待重置确认' });
    expect(reset.props.accounts[0].status).toBe('待更新');
  });
  it('ages all widgets after fifteen minutes even when a backend returns no sample date', () => {
    const saved = data();
    saved.states[source.id].snapshot!.metrics = [{ id: 'balance', label: '余额', remaining: 12, unit: 'USD', scope: 'account' }];
    const timeline = widgetTimeline(saved, now);
    expect(timeline[0].props.accounts[0].metrics[0].stale).toBe(false);
    expect(timeline.at(-1)!.props.accounts[0].metrics[0]).toMatchObject({ value: '$12.00', stale: true });
    expect(timeline.at(-1)!.date.getTime()).toBe(now + 15 * 60_000);
  });
  it('omits unknown percentages so native property-list storage can accept balance and unlimited accounts', () => {
    const saved = data();
    saved.states[source.id].snapshot!.metrics = [
      { id: 'balance', label: '余额', remaining: 12, unit: 'USD', scope: 'account' },
      { id: 'unlimited', label: '不限额', unlimited: true, unit: 'requests', scope: 'account' },
      { id: 'invalid', label: '无效采样', remaining: NaN, unit: '%', scope: 'account' },
      { id: 'zero', label: '已用尽', remaining: 0, unit: '%', scope: 'account' },
    ];
    for (const entry of widgetTimeline(saved, now)) {
      const metrics = entry.props.accounts[0].metrics;
      for (const metric of metrics.slice(0, 3)) expect(metric).not.toHaveProperty('percent');
      expect(metrics[3].percent).toBe(0);
      expect(metrics[0].value).toBe('$12.00');
      expect(metrics[1].value).toBe('不限额');
      const assertPropertyList = (value: unknown): void => {
        if (typeof value === 'number') { expect(Number.isFinite(value)).toBe(true); return; }
        if (typeof value === 'string' || typeof value === 'boolean') return;
        expect(value).not.toBeNull();
        expect(typeof value).toBe('object');
        for (const item of Object.values(value as object)) assertPropertyList(item);
      };
      assertPropertyList(entry.props);
    }
  });
  it('handles an empty setup and invalid or excessive timestamps without an invalid timeline', () => {
    const saved = data();
    saved.states[source.id].snapshot!.fetchedAt = 'invalid';
    saved.states[source.id].snapshot!.metrics[0].resetAt = '9999-12-31T00:00:00Z';
    expect(widgetTimeline(saved, now).every(entry => Number.isFinite(entry.date.getTime()))).toBe(true);
    expect(widgetTimeline(saved, now).at(-1)!.date.getTime()).toBeLessThanOrEqual(now + 8 * 86400_000);
    saved.sources = [];
    expect(widgetTimeline(saved, now)).toHaveLength(1);
    expect(focusAccount(widgetData(saved, now))).toBeUndefined();
  });
});
