import { HStack, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, frame, lineLimit, minimumScaleFactor, monospacedDigit, privacySensitive, progressViewStyle, tint, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { WidgetData } from './model';

type Configuration = { account: string };

const FocusLayout = (props: WidgetData, environment: WidgetEnvironment<Configuration>) => {
  'widget';
  const selected = environment.configuration?.account;
  const account = props.accounts.find(item => item.id === (selected && selected !== 'automatic' ? selected : props.focusId)) ?? props.accounts[0];
  const metric = account?.metrics[0];
  const secondaryMetric = account?.metrics[1];
  const accessory = environment.widgetFamily === 'accessoryRectangular';
  const dark = environment.colorScheme === 'dark';
  const monochrome = environment.widgetRenderingMode !== 'fullColor';
  const ink = monochrome ? { type: 'hierarchical' as const, style: 'primary' as const } : dark ? '#F0F5F1' : '#18363C';
  const muted = monochrome ? { type: 'hierarchical' as const, style: 'secondary' as const } : dark ? '#C3D3CC' : '#405D62';
  const color = metric?.stale ? muted : metric?.percent != null && metric.percent <= props.threshold ? dark ? '#F1CF94' : '#815618' : dark ? '#B8DAC1' : '#256D5E';
  if (accessory) {
    return <VStack alignment="leading" spacing={3} modifiers={[widgetURL(account?.url ?? 'quotadeck:///'), privacySensitive()]}>
      <Text modifiers={[font({ size: 11, weight: 'medium' }), lineLimit(1)]}>{account?.name ?? '余量'}</Text>
      <Text modifiers={[font({ size: 22, weight: 'semibold' }), monospacedDigit(), lineLimit(1), minimumScaleFactor(.6)]}>{metric?.value ?? '打开应用连接'}</Text>
      <Text modifiers={[font({ size: 9 }), lineLimit(1)]}>{account ? `${account.status} · ${account.updatedLabel}` : '添加你的额度账号'}</Text>
    </VStack>;
  }
  return <VStack alignment="leading" spacing={4} modifiers={[
    frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
    containerBackground({ type: 'linearGradient', colors: dark ? ['#34484D', '#293B29'] : ['#DAE9E4', '#C8D2B3'], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } }, 'widget'),
    widgetURL(account?.url ?? 'quotadeck:///'), privacySensitive(),
  ]}>
    <HStack spacing={5}>
      <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle(ink), lineLimit(1)]}>{account?.name ?? '余量'}</Text>
      <Spacer />
      <Text modifiers={[font({ size: 10 }), foregroundStyle(muted)]}>↗</Text>
    </HStack>
    <Spacer />
    <Text modifiers={[font({ size: 9 }), foregroundStyle(muted), lineLimit(1)]}>{metric ? `${metric.label} · ${metric.stale ? '上次余量' : '剩余'}` : '额度，抬眼就看见。'}</Text>
    <Text modifiers={[font({ size: 31, weight: 'semibold' }), foregroundStyle(metric?.stale ? muted : ink), monospacedDigit(), lineLimit(1), minimumScaleFactor(.5)]}>{metric?.value ?? '—'}</Text>
    {metric?.percent != null ? <ProgressView value={metric.percent / 100} modifiers={[tint(color), progressViewStyle('linear')]} /> : null}
    {secondaryMetric ? <HStack spacing={3}><Text modifiers={[font({ size: 9 }), foregroundStyle(muted), lineLimit(1)]}>{secondaryMetric.label}</Text><Spacer /><Text modifiers={[font({ size: 10, weight: 'medium' }), foregroundStyle(ink), monospacedDigit(), lineLimit(1)]}>{secondaryMetric.value}</Text></HStack> : null}
    {!secondaryMetric && metric?.resetText ? <Text modifiers={[font({ size: 8 }), foregroundStyle(muted), lineLimit(1)]}>{metric.resetText}</Text> : null}
    <Spacer />
    <Text modifiers={[font({ size: 8 }), foregroundStyle(muted), lineLimit(1)]}>{account ? `${account.status} · ${account.updatedLabel}` : '打开余量，连接第一个站点'}</Text>
  </VStack>;
};

export default createWidget<WidgetData, Configuration>('QuotaFocus', FocusLayout, { accounts: [], focusId: '', threshold: 20 });
