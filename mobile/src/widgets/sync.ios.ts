import type { SavedData } from '../domain/types';
import FocusWidget from './FocusWidget.ios';
import OverviewWidget from './OverviewWidget.ios';
import { widgetTimeline } from './model';

let lastSignature = '';

export function syncWidgets(data: SavedData): void {
  const timeline = widgetTimeline(data);
  const signature = JSON.stringify(timeline.map(entry => entry.props));
  if (signature === lastSignature) return;
  FocusWidget.setConfigurationParameterEnum('account', [
    { name: '跟随应用选择', value: 'automatic' },
    ...timeline[0].props.accounts.map(account => ({ name: account.name, value: account.id, subtitle: account.provider })),
  ]);
  FocusWidget.updateTimeline(timeline);
  OverviewWidget.updateTimeline(timeline);
  lastSignature = signature;
}
