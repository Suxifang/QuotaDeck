import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, type SavedData } from '../src/domain/types';
import { widgetTimeline } from '../src/widgets/model';
import { createWidgetPublisher } from '../src/widgets/publisher';

const data = (): SavedData => ({ version: 1, sources: [{ id: 'real', name: '真实账号', baseUrl: 'https://private.example', connectionId: 'private-key', kind: 'newapi', pinned: false, enabled: true }], states: {}, history: {}, preferences: { ...DEFAULT_PREFERENCES } });
function bridge() {
  const makeTarget = () => {
    let entries: ReturnType<typeof widgetTimeline> = [];
    return { updateTimeline: vi.fn((next: typeof entries) => { entries = next; }), getTimeline: vi.fn(async () => entries) };
  };
  return { available: () => true, focus: makeTarget(), overview: makeTarget(), configure: vi.fn() };
}

describe('widget publication and readback', () => {
  it('reports a missing shared container without claiming that publication succeeded', async () => {
    const native = bridge(); native.available = () => false;
    await expect(createWidgetPublisher(native)(data())).rejects.toThrow('App Group');
    expect(native.focus.updateTimeline).not.toHaveBeenCalled();
  });
  it('requires both widget kinds to contain the newly written display data and permits a retry', async () => {
    const native = bridge();
    native.overview.getTimeline.mockResolvedValueOnce([]);
    const publish = createWidgetPublisher(native);
    await expect(publish(data())).rejects.toThrow('未能写入');
    await expect(publish(data())).resolves.toMatchObject({ supported: true, accountCount: 1 });
    expect(native.focus.updateTimeline).toHaveBeenCalledTimes(2);
  });
  it('can explicitly republish unchanged data and keeps credentials out of the shared props', async () => {
    const native = bridge(); const publish = createWidgetPublisher(native);
    await publish(data()); await publish(data());
    expect(native.focus.updateTimeline).toHaveBeenCalledTimes(1);
    await publish(data(), true);
    expect(native.focus.updateTimeline).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(native.focus.updateTimeline.mock.calls)).not.toMatch(/private\.example|private-key|connectionId/);
  });
  it('allows native dictionaries to return their fields in a different order', async () => {
    const native = bridge(); const original = native.overview.getTimeline;
    native.overview.getTimeline = vi.fn(async () => (await original()).map(entry => ({ ...entry, props: { threshold: entry.props.threshold, focusId: entry.props.focusId, accounts: entry.props.accounts } })));
    await expect(createWidgetPublisher(native)(data())).resolves.toMatchObject({ accountCount: 1 });
  });
  it('finishes an earlier publication before beginning a newer one', async () => {
    const native = bridge(); const original = native.focus.getTimeline;
    let unblock!: () => void;
    const gate = new Promise<void>(resolve => { unblock = resolve; });
    native.focus.getTimeline.mockImplementationOnce(async () => { await gate; return original(); });
    const publish = createWidgetPublisher(native);
    const first = publish(data());
    const next = data(); next.sources = [];
    const second = publish(next);
    await vi.waitFor(() => expect(native.focus.getTimeline).toHaveBeenCalledTimes(1));
    expect(native.focus.updateTimeline).toHaveBeenCalledTimes(1);
    unblock(); await first;
    await expect(second).resolves.toMatchObject({ accountCount: 0 });
  });
});
