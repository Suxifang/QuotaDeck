import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { ArrowUpRight, Check, ChevronDown, LayoutGrid, RefreshCw, Smartphone } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { QuotaController } from '../state/useQuota';
import { focusAccount, widgetData } from '../widgets/model';
import { Button, Glass, styles } from './primitives';
import { radius, useTheme } from './theme';

export function WidgetSettings({ controller }: { controller: QuotaController }) {
  const t = useTheme();
  const [choosing, setChoosing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const preview = widgetData(controller.data);
  const focus = focusAccount(preview);
  const metric = focus?.metrics[0];
  const tint = metric?.percent != null && metric.percent <= preview.threshold ? t.amber : t.accent;
  const backgrounds = t.dark ? ['#34484D', '#293B29'] as const : ['#DAE9E4', '#C8D2B3'] as const;
  const realAccounts = controller.saved.sources.filter(source => source.enabled).length;
  const sync = controller.widgetSyncResult;
  return <>
    <View style={{ gap: 9 }}><Text style={{ fontSize: 24, fontWeight: '600', letterSpacing: -.8, color: t.ink }}>桌面上，也能看额度。</Text>
      <Text style={{ color: t.secondary, fontSize: 12, lineHeight: 21 }}>无需置顶，选择账号后同步即可。{controller.isDemo ? '演示账号仅用于应用内预览。' : ''}</Text></View>
    <Glass subtle style={{ padding: 18, gap: 13 }}>
      <View style={styles.between}><Text style={{ color: t.ink, fontSize: 14, fontWeight: '600' }}>让桌面显示额度</Text><Text style={{ color: t.secondary, fontSize: 11 }}>可同步账号 · {realAccounts}</Text></View>
      <Text style={{ color: t.secondary, fontSize: 12, lineHeight: 21 }}>{!realAccounts ? '先添加并启用真实连接，再同步到桌面。' : '显示最近一次查询的余量，应用查询后会自动同步。'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="选择小组件账号" accessibilityState={{ expanded: choosing }} disabled={controller.isDemo || !realAccounts} onPress={() => setChoosing(value => !value)} style={[styles.between, { gap: 8, paddingVertical: 8 }]}>
        <View style={{ flex: 1, gap: 5 }}><Text style={{ color: t.ink, fontSize: 13, fontWeight: '600' }}>关注账号</Text><Text numberOfLines={1} style={{ color: t.secondary, fontSize: 11 }}>{preview.accounts.find(account => account.id === preview.focusId)?.name ?? '自动选择 · 优先置顶账号'}</Text></View><ChevronDown size={16} color={t.secondary} />
      </Pressable>
      {choosing ? [{ id: '', name: '自动选择 · 优先置顶' }, ...preview.accounts].map(account => <Pressable key={account.id} accessibilityRole="radio" accessibilityLabel={account.name} accessibilityState={{ selected: (preview.focusId ?? '') === account.id }}
        onPress={() => { controller.changePreferences({ widgetSourceId: account.id }); setChoosing(false); }} style={[styles.between, { minHeight: 44, borderTopWidth: 1, borderColor: t.line }]}>
        <Text style={{ color: t.ink, fontSize: 12, flex: 1 }}>{account.name}</Text>{(preview.focusId ?? '') === account.id ? <Check size={16} color={t.accent} /> : null}
      </Pressable>) : null}
      {Platform.OS === 'ios' ? <>
        <Button title={controller.widgetSyncing ? '正在同步…' : '立即同步到小组件'} icon={RefreshCw} loading={controller.widgetSyncing} disabled={!controller.ready} onPress={() => void controller.publishWidgets(true)} />
        {controller.widgetError ? <Text accessibilityRole="alert" style={{ color: t.amber, fontSize: 12, lineHeight: 21 }}>{controller.widgetError}</Text> : sync?.supported ? <Text accessibilityLiveRegion="polite" style={{ color: t.secondary, fontSize: 11, lineHeight: 20 }}>已写入 {sync.accountCount} 个账号 · {new Date(sync.syncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}。桌面显示由系统刷新，可能稍有延迟。</Text> : null}
        {controller.widgetError ? <Text style={{ color: t.muted, fontSize: 11, lineHeight: 20 }}>签名时保留小组件扩展和相同的 App Group，证书也须允许该共享组。仅在应用里置顶或反复同步，无法补上签名权限。</Text> : null}
      </> : <Text style={{ color: t.muted, fontSize: 11 }}>桌面同步需要在已安装的 iPhone 应用内操作。</Text>}
    </Glass>
    <Pressable accessibilityRole="button" accessibilityLabel="预览小组件外观" accessibilityState={{ expanded: showPreview }} onPress={() => setShowPreview(value => !value)} style={[styles.between, { paddingVertical: 8 }]}>
      <Text style={{ color: t.ink, fontSize: 13, fontWeight: '600' }}>预览小组件外观</Text><ChevronDown size={16} color={t.secondary} style={{ transform: [{ rotate: showPreview ? '180deg' : '0deg' }] }} />
    </Pressable>
    {showPreview ? <>
    <Text style={{ color: t.muted, fontSize: 10 }}>下方仅为应用内预览，不代表桌面已经同步。</Text>
    <View style={{ alignItems: 'center', paddingVertical: 8, gap: 12 }}>
      <LinearGradient colors={backgrounds} style={{ width: 164, height: 164, padding: 17, borderRadius: 24, borderCurve: 'continuous', borderWidth: 1, borderColor: t.border, boxShadow: '0px 12px 30px rgba(23,60,100,.10)' }}>
        <View style={styles.between}><Text numberOfLines={1} style={{ color: t.ink, fontSize: 11, fontWeight: '600', flex: 1 }}>{focus?.name ?? '余度'}</Text><ArrowUpRight size={12} color={t.muted} /></View>
        <View style={{ flex: 1, justifyContent: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={{ color: t.secondary, fontSize: 9 }}>{metric ? `${metric.label} · 剩余` : '额度，抬眼就看见。'}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: t.ink, fontSize: 31, letterSpacing: -1.2, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{metric?.value ?? '—'}</Text>
          {metric?.percent != null ? <View style={{ height: 4, borderRadius: 2, backgroundColor: t.line }}><View style={{ height: 4, width: `${metric.percent}%`, backgroundColor: tint, borderRadius: 2 }} /></View> : null}
          {focus?.metrics[1] ? <View style={styles.between}><Text style={{ color: t.secondary, fontSize: 9 }}>{focus.metrics[1].label}</Text><Text style={{ color: t.ink, fontSize: 10, fontWeight: '500' }}>{focus.metrics[1].value}</Text></View> : null}
        </View>
        <Text numberOfLines={1} style={{ color: t.muted, fontSize: 8 }}>{focus ? `${focus.status} · ${focus.updatedLabel}` : '打开余度，连接第一个站点'}</Text>
      </LinearGradient>
      <Text style={{ color: t.muted, fontSize: 10 }}>关注账号 · 小号</Text>
    </View>
    <LinearGradient colors={backgrounds} style={{ padding: 18, gap: 20, borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: t.border }}>
      <View style={styles.between}><Text style={{ color: t.ink, fontSize: 12, fontWeight: '600' }}>余度</Text><Text style={{ color: t.secondary, fontSize: 9 }}>常用账号 · {preview.accounts.length}</Text></View>
      <View style={{ flexDirection: 'row', gap: 16 }}>{preview.accounts.length ? preview.accounts.slice(0, 3).map(account => <View key={account.id} style={{ flex: 1, gap: 7 }}>
        <Text numberOfLines={1} style={{ color: t.ink, fontWeight: '500', fontSize: 10 }}>{account.name}</Text><Text numberOfLines={1} style={{ color: t.secondary, fontSize: 8 }}>{account.metrics[0]?.label ?? account.provider}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: t.ink, fontSize: 22, fontWeight: '600', letterSpacing: -.8 }}>{account.metrics[0]?.value ?? '—'}</Text>
        {account.metrics[0]?.percent != null ? <View style={{ height: 4, backgroundColor: t.line, borderRadius: 2 }}><View style={{ height: 4, borderRadius: 2, width: `${account.metrics[0].percent}%`, backgroundColor: account.metrics[0].percent <= preview.threshold ? t.amber : t.accent }} /></View> : null}
      </View>) : <Text style={{ color: t.secondary, fontSize: 12 }}>连接站点后，这里会显示常用账号。</Text>}</View>
      <Text style={{ color: t.muted, fontSize: 8 }}>最近一次查询 · 打开应用同步最新额度</Text>
    </LinearGradient>
    <Text style={{ color: t.muted, fontSize: 10, textAlign: 'center', marginTop: -9 }}>常用账号 · 中号 · 置顶优先</Text>
    </> : null}
    <View style={{ gap: 13 }}>
      <View style={[styles.row, { gap: 8 }]}><LayoutGrid size={16} color={t.accent} /><Text style={{ color: t.ink, fontSize: 13, fontWeight: '600' }}>添加到主屏幕</Text></View>
      <Text style={{ color: t.secondary, fontSize: 12, lineHeight: 22 }}>长按 iPhone 主屏幕空白处，选择“添加小组件”，搜索“余度”，选择小号或中号。</Text>
      <View style={[styles.row, { gap: 8 }]}><Smartphone size={16} color={t.accent} /><Text style={{ color: t.ink, fontSize: 13, fontWeight: '600' }}>添加到锁屏</Text></View>
      <Text style={{ color: t.secondary, fontSize: 12, lineHeight: 22 }}>长按锁屏，进入“自定”，在小组件区域添加“余度 · 关注账号”。</Text>
    </View>
    <Text style={{ color: t.muted, fontSize: 11, lineHeight: 20 }}>应用每次查询后会同步最新结果。小组件保留最近一次额度，超过 15 分钟或已过重置时间会标记待更新；点击可回到对应账号详情。当前版本不会在应用关闭后主动向站点查询。</Text>
    {Platform.OS === 'web' ? <Text style={{ color: t.secondary, fontSize: 11, lineHeight: 19 }}>这里是外观预览，小组件需安装 iOS 版本后使用。</Text> : null}
  </>;
}
