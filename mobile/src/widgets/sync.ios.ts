import { widgetsDirectory } from 'expo-widgets';
import FocusWidget from './FocusWidget.ios';
import OverviewWidget from './OverviewWidget.ios';
import { createWidgetPublisher } from './publisher';

export const syncWidgets = createWidgetPublisher({
  available: () => !!widgetsDirectory,
  focus: FocusWidget,
  overview: OverviewWidget,
  configure: data => FocusWidget.setConfigurationParameterEnum('account', [
    { name: '跟随应用选择', value: 'automatic' },
    ...data.accounts.map(account => ({ name: account.name, value: account.id, subtitle: account.provider })),
  ]),
});
