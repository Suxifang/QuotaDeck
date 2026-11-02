import { HStack, Link, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, frame, lineLimit, minimumScaleFactor, monospacedDigit, privacySensitive, progressViewStyle, tint, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { WidgetData } from './model';

const OverviewLayout = (props: WidgetData, environment: WidgetEnvironment) => {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const monochrome = environment.widgetRenderingMode === 'accented' || environment.widgetRenderingMode === 'vibrant';
  const ink = monochrome ? { type: 'hierarchical' as const, style: 'primary' as const } : dark ? '#F0F5F1' : '#18363C';
  const muted = monochrome ? { type: 'hierarchical' as const, style: 'secondary' as const } : dark ? '#C3D3CC' : '#405D62';
  const accounts = props.accounts.slice(0, 3);
  const numberSize = accounts.length > 2 ? 21 : 27;
  return <VStack alignment="leading" spacing={0} modifiers={[
    frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
    containerBackground({ type: 'linearGradient', colors: dark ? ['#34484D', '#293B29'] : ['#DAE9E4', '#C8D2B3'], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } }, 'widget'),
    widgetURL('quotadeck:///'), privacySensitive(),
  ]}>
    <HStack modifiers={[frame({ height: 14 })]}>
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(ink)]}>余度</Text>
      <Spacer />
      <Text modifiers={[font({ size: 9 }), foregroundStyle(muted), lineLimit(1)]}>{props.accounts.length > 3 ? `常用账号 · 3 / ${props.accounts.length}` : `常用账号 · ${props.accounts.length}`}</Text>
    </HStack>
    <Spacer minLength={8} />
    {accounts.length ? <HStack alignment="top" spacing={14}>{accounts.map(account => {
      const metric = account.metrics[0];
      const secondary = account.metrics[1];
      const color = metric?.stale ? muted : metric?.percent != null && metric.percent <= props.threshold ? dark ? '#F1CF94' : '#815618' : dark ? '#B8DAC1' : '#256D5E';
      const detail = secondary ? `${secondary.label} ${secondary.value}` : metric?.resetText || (metric ? account.provider : '等待首次查询');
      return <Link key={account.id} destination={account.url} modifiers={[frame({ minWidth: 0, maxWidth: Infinity, alignment: 'leading' })]}>
        <VStack alignment="leading" spacing={4} modifiers={[frame({ minWidth: 0, maxWidth: Infinity, alignment: 'leading' })]}>
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(ink), lineLimit(1), frame({ height: 14, alignment: 'leading' })]}>{account.name}</Text>
          <Text modifiers={[font({ size: 9 }), foregroundStyle(muted), lineLimit(1), frame({ height: 11, alignment: 'leading' })]}>{metric?.label ?? account.provider}</Text>
          <Text modifiers={[font({ size: numberSize, weight: 'semibold' }), foregroundStyle(metric?.stale ? muted : ink), monospacedDigit(), lineLimit(1), minimumScaleFactor(.65), frame({ height: 33, alignment: 'leading' }), frame({ minWidth: 0, maxWidth: Infinity, alignment: 'leading' })]}>{metric?.value ?? '—'}</Text>
          <HStack spacing={5} modifiers={[frame({ height: 10, alignment: 'leading' }), frame({ minWidth: 0, maxWidth: Infinity, alignment: 'leading' })]}>
            {metric?.percent != null ? <>
              <ProgressView value={metric.percent / 100} modifiers={[tint(color), progressViewStyle('linear'), frame({ minWidth: 0, maxWidth: Infinity })]} />
              <Text modifiers={[font({ size: 8 }), foregroundStyle(color), monospacedDigit(), lineLimit(1)]}>{Math.round(metric.percent)}%</Text>
            </> : <Text modifiers={[font({ size: 8 }), foregroundStyle(muted), lineLimit(1)]}>{detail}</Text>}
          </HStack>
          <Text modifiers={[font({ size: 8 }), foregroundStyle(muted), monospacedDigit(), lineLimit(1), minimumScaleFactor(.8), frame({ height: 11, alignment: 'leading' })]}>{account.queryLabel ?? `${account.status} · ${account.updatedLabel}`}</Text>
        </VStack>
      </Link>;
    })}</HStack> : <VStack alignment="leading" spacing={7}><Text modifiers={[font({ size: 22, weight: 'semibold' }), foregroundStyle(ink), lineLimit(1), minimumScaleFactor(.8)]}>抬眼，心中有数。</Text><Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>打开余度，连接常用的 API 站点。</Text></VStack>}
    <Spacer minLength={0} />
  </VStack>;
};

export default createWidget<WidgetData>('QuotaOverview', OverviewLayout, { accounts: [], focusId: '', threshold: 20 });
