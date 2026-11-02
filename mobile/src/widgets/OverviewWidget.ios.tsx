import { HStack, Link, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, frame, lineLimit, minimumScaleFactor, monospacedDigit, privacySensitive, progressViewStyle, tint, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { WidgetData } from './model';

const OverviewLayout = (props: WidgetData, environment: WidgetEnvironment) => {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const monochrome = environment.widgetRenderingMode !== 'fullColor';
  const ink = monochrome ? { type: 'hierarchical' as const, style: 'primary' as const } : dark ? '#F0F5F1' : '#18363C';
  const muted = monochrome ? { type: 'hierarchical' as const, style: 'secondary' as const } : dark ? '#C3D3CC' : '#405D62';
  const accounts = props.accounts.slice(0, 3);
  return <VStack alignment="leading" spacing={10} modifiers={[
    frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
    containerBackground({ type: 'linearGradient', colors: dark ? ['#34484D', '#293B29'] : ['#DAE9E4', '#C8D2B3'], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } }, 'widget'),
    widgetURL('quotadeck:///'), privacySensitive(),
  ]}>
    <HStack><Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(ink)]}>余量</Text><Spacer /><Text modifiers={[font({ size: 9 }), foregroundStyle(muted)]}>常用账号 · {props.accounts.length}</Text></HStack>
    <Spacer />
    {accounts.length ? <HStack alignment="top" spacing={18}>{accounts.map(account => {
      const metric = account.metrics[0];
      const color = metric?.stale ? muted : metric?.percent != null && metric.percent <= props.threshold ? dark ? '#F1CF94' : '#815618' : dark ? '#B8DAC1' : '#256D5E';
      return <Link key={account.id} destination={account.url} modifiers={[frame({ maxWidth: Infinity })]}>
        <VStack alignment="leading" spacing={7}>
          <Text modifiers={[font({ size: 10, weight: 'medium' }), foregroundStyle(ink), lineLimit(1)]}>{account.name}</Text>
          <Text modifiers={[font({ size: 8 }), foregroundStyle(muted), lineLimit(1)]}>{metric?.label ?? account.provider}</Text>
          <Text modifiers={[font({ size: accounts.length > 2 ? 22 : 27, weight: 'semibold' }), foregroundStyle(metric?.stale ? muted : ink), monospacedDigit(), lineLimit(1), minimumScaleFactor(.5)]}>{metric?.value ?? '—'}</Text>
          {metric?.percent != null ? <ProgressView value={metric.percent / 100} modifiers={[tint(color), progressViewStyle('linear')]} /> : null}
          <Text modifiers={[font({ size: 8 }), foregroundStyle(muted), lineLimit(1)]}>{account.status}</Text>
        </VStack>
      </Link>;
    })}</HStack> : <VStack alignment="leading" spacing={7}><Text modifiers={[font({ size: 22, weight: 'semibold' }), foregroundStyle(ink)]}>抬眼，心中有数。</Text><Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>打开余量，连接常用的 API 站点。</Text></VStack>}
    <Spacer />
    <Text modifiers={[font({ size: 8 }), foregroundStyle(muted), lineLimit(1)]}>{accounts.length ? '最近一次查询 · 打开应用同步最新额度' : 'Sub2API · 反代 · 更多接口'}</Text>
  </VStack>;
};

export default createWidget<WidgetData>('QuotaOverview', OverviewLayout, { accounts: [], focusId: '', threshold: 20 });
