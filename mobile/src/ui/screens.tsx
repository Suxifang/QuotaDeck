import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowDownToLine, ArrowRight, ChevronRight, FlaskConical, Link2, Plus, RefreshCw, ShieldCheck } from 'lucide-react-native';
import { PROVIDER_LABELS, type Source } from '../domain/types';
import { attention, hostLabel, isSampleStale } from '../domain/format';
import type { QuotaController } from '../state/useQuota';
import { Button, Glass, IconButton, Logo, Sheet, styles, tap } from './primitives';
import { SourceCard, ProviderMark } from './source-card';
import { ConnectionSheet } from './connection-sheet';
import { DetailSheet } from './detail-sheet';
import { Settings } from './settings';
import { useTheme } from './theme';
import { useUpdates } from '../updates/context';
import { UpdateSettings } from './update-settings';

type Tab = 'overview' | 'connections' | 'settings';

export function Deck({ controller, tab }: { controller: QuotaController; tab: Tab }) {
  const t = useTheme(); const insets = useSafeAreaInsets();
  const updates = useUpdates();
  const router = useRouter();
  const { sourceId } = useLocalSearchParams<{ sourceId?: string }>();
  const [connection, setConnection] = useState<{ existing?: Source }>();
  const [detailId, setDetailId] = useState<string>();
  const [filter, setFilter] = useState<'all' | 'pinned'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [showUpdates, setShowUpdates] = useState(false);
  const data = controller.data;
  const closeDetail = () => { setDetailId(undefined); if (sourceId) router.setParams({ sourceId: undefined }); };
  const sources = [...data.sources].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const detail = sources.find(source => source.id === (detailId ?? (controller.isDemo ? undefined : sourceId)));
  const healthy = sources.filter(source => source.enabled && data.states[source.id]?.snapshot && !data.states[source.id]?.error && !attention(data.states[source.id]?.snapshot, data.preferences.lowThreshold) && !data.states[source.id]?.snapshot?.metrics.some(metric => isSampleStale(metric))).length;
  const needsAttention = sources.filter(source => source.enabled && (data.states[source.id]?.error || data.states[source.id]?.snapshot?.metrics.some(metric => isSampleStale(metric)) || attention(data.states[source.id]?.snapshot, data.preferences.lowThreshold))).length;
  const add = () => { tap(data.preferences.haptics); setConnection({}); };
  const refresh = async () => { setRefreshing(true); try { await controller.refreshAll(); } finally { setRefreshing(false); } };
  const bottom = Math.max(insets.bottom, Platform.OS === 'web' ? 20 : 10);

  return <View style={{ flex: 1 }}>
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      refreshControl={tab !== 'settings' ? <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={t.accent} colors={[t.accent]} /> : undefined}
      contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 112 + bottom, paddingHorizontal: 22, width: '100%', maxWidth: 560, alignSelf: 'center', gap: 20 }}>
      <View style={styles.between}>
        <View style={[styles.row, { gap: 10 }]}><Logo size={33} /><Text style={{ fontSize: 19, fontWeight: '700', color: t.ink, letterSpacing: .5 }}>余度</Text><Text style={{ fontSize: 10, color: t.secondary, letterSpacing: 1.6, marginTop: 4 }}>YUDU</Text></View>
        <View style={[styles.row, { gap: 8 }]}>
          <IconButton icon={ArrowDownToLine} label="软件更新" onPress={() => setShowUpdates(true)} active={!!updates.release} size={37} />
          <IconButton icon={RefreshCw} label="刷新全部额度" onPress={() => void refresh()} disabled={refreshing || !sources.length} size={37} />
          <IconButton icon={Plus} label="添加连接" onPress={add} active size={37} />
        </View>
      </View>
      {controller.isDemo ? <Glass subtle style={{ paddingHorizontal: 14, paddingVertical: 11, borderRadius: 16 }}><View style={[styles.between, { gap: 8 }]}>
        <View style={[styles.row, { gap: 7 }]}><FlaskConical size={14} color={t.amber} /><Text style={{ color: t.secondary, fontSize: 11 }}>演示模式 · 以下均为示例数据</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="退出演示" onPress={() => { controller.exitDemo(); setDetailId(undefined); }}><Text style={{ color: t.accent, fontSize: 11, fontWeight: '600' }}>退出</Text></Pressable>
      </View></Glass> : null}
      {tab !== 'settings' && updates.release ? <Glass subtle style={{ paddingHorizontal: 15, borderRadius: 17 }}><Pressable accessibilityRole="button" accessibilityLabel="查看新版本" onPress={() => setShowUpdates(true)} style={[styles.between, { minHeight: 48, gap: 10 }]}><Text style={{ color: t.accent, fontSize: 12 }}>余度 {updates.release.version} 已发布</Text><View style={[styles.row, { gap: 5 }]}><Text style={{ color: t.secondary, fontSize: 11 }}>查看更新</Text><ChevronRight size={14} color={t.secondary} /></View></Pressable></Glass> : null}
      {controller.storageError ? <Text accessibilityRole="alert" style={{ color: t.red, fontSize: 12, lineHeight: 20 }}>{controller.storageError}</Text> : null}
      {!controller.ready ? <ActivityIndicator color={t.accent} style={{ marginTop: 100 }} /> : tab === 'overview' ? <>
        <View style={{ gap: 8 }}>
          <Text style={{ color: t.secondary, fontSize: 10, letterSpacing: 1.5 }}>{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}  /  OVERVIEW</Text>
          <Text style={{ color: t.ink, fontSize: 30, fontWeight: '700', letterSpacing: -1.2, marginTop: 3 }}>用量，一目了然。</Text>
          <Text style={{ color: t.secondary, fontSize: 12, lineHeight: 20 }}>分散的 API 额度，此刻尽在掌握。</Text>
        </View>
        {sources.length ? <>
          <View style={{ paddingVertical: 18, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.line, flexDirection: 'row' }}>
            <Stat value={sources.length} title="监控账号" color={t.ink} /><Stat value={healthy} title="状态正常" color={t.mint} divider /><Stat value={needsAttention} title="需要留意" color={needsAttention ? t.amber : t.ink} divider />
          </View>
          <View style={[styles.between, { marginTop: 1 }]}>
            <View style={{ flexDirection: 'row', gap: 18 }}>{(['all', 'pinned'] as const).map(value => <Pressable key={value} onPress={() => setFilter(value)} accessibilityRole="button" accessibilityState={{ selected: filter === value }} style={{ paddingVertical: 5 }}>
              <Text style={{ fontSize: 13, fontWeight: filter === value ? '700' : '400', color: filter === value ? t.ink : t.muted }}>{value === 'all' ? '全部额度' : '已置顶'}{value === 'all' ? `  ${sources.length}` : ''}</Text>
            </Pressable>)}</View>
            <View style={[styles.row, { gap: 5 }]}><View style={{ width: 4, height: 4, borderRadius: 3, backgroundColor: t.mint }} /><Text style={{ fontSize: 9, color: t.muted }}>前台自动更新</Text></View>
          </View>
          <View style={{ gap: 15, marginTop: -7 }}>{sources.filter(source => filter === 'all' || source.pinned).map(source => <SourceCard key={source.id} source={source} state={data.states[source.id]} threshold={data.preferences.lowThreshold} onTogglePin={controller.isDemo ? undefined : () => { tap(data.preferences.haptics); controller.changeSource(source.id, { pinned: !source.pinned }); }} onPress={() => { tap(data.preferences.haptics); setDetailId(source.id); }} />)}
            {filter === 'pinned' && !sources.some(source => source.pinned) ? <Text style={{ color: t.secondary, textAlign: 'center', padding: 35, fontSize: 12 }}>点卡片右上角的图钉，置顶常用账号</Text> : null}
          </View>
          <Pressable accessibilityRole="button" onPress={add} style={[styles.row, { justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: t.line, borderRadius: 21, paddingVertical: 19 }]}>
            <Plus size={16} color={t.secondary} /><Text style={{ color: t.secondary, fontSize: 12 }}>再连接一个站点</Text>
          </Pressable>
          <Text style={{ color: t.muted, fontSize: 9, textAlign: 'center', letterSpacing: .3 }}>你的连接，只在你的设备上。</Text>
        </> : <EmptyState onAdd={add} onDemo={controller.enterDemo} />}
      </> : tab === 'connections' ? <>
        <PageTitle title="连接你的世界。" subtitle="一个站点，多个账号，都在这里。" eyebrow="CONNECTIONS" />
        {Platform.OS === 'web' ? <Text style={{ color: t.secondary, fontSize: 11, lineHeight: 19 }}>网页用于预览，密钥只在本次页面中保留。安装 iOS 版本后，凭据会存入系统钥匙串。</Text> : null}
        {sources.length ? <View style={{ gap: 12 }}>{sources.map(source => <Pressable key={source.id} accessibilityRole="button" accessibilityLabel={`管理${source.name}`} onPress={() => setDetailId(source.id)}>
          <Glass style={{ padding: 18, borderRadius: 23 }}><View style={[styles.row, { gap: 12 }]}><ProviderMark source={source} size={43} />
            <View style={{ flex: 1, gap: 5 }}><Text numberOfLines={1} style={{ color: t.ink, fontSize: 14, fontWeight: '600' }}>{source.name}</Text><Text numberOfLines={1} style={{ color: t.secondary, fontSize: 10 }}>{hostLabel(source.baseUrl)}{source.accountId ? ` · #${source.accountId}` : ''}</Text>
              <Text style={{ color: data.states[source.id]?.error ? t.amber : t.muted, fontSize: 10 }}>{!source.enabled ? '已暂停' : data.states[source.id]?.error ? '连接需要检查' : PROVIDER_LABELS[source.resolvedKind ?? source.kind]}</Text></View><ChevronRight size={17} color={t.muted} />
          </View></Glass>
        </Pressable>)}</View> : <EmptyState onAdd={add} onDemo={controller.enterDemo} />}
        {sources.length ? <Button title="添加连接" icon={Plus} onPress={add} /> : null}
        <Glass subtle style={{ padding: 20, gap: 10 }}><View style={[styles.row, { gap: 8 }]}><Link2 size={17} color={t.accent} /><Text style={{ color: t.ink, fontSize: 13, fontWeight: '600' }}>为不同接口，留好位置</Text></View><Text style={{ color: t.secondary, fontSize: 11, lineHeight: 21 }}>Sub2API 套餐与反代、New API、One API、OpenRouter、DeepSeek，以及自定义余额接口。</Text></Glass>
      </> : <Settings controller={controller} />}
    </ScrollView>
    {showUpdates ? <Sheet visible title="软件更新" onClose={() => setShowUpdates(false)}><UpdateSettings /></Sheet> : null}
    {connection ? <ConnectionSheet controller={controller} existing={connection.existing} onClose={() => setConnection(undefined)} /> : null}
    {detail && !connection ? <DetailSheet key={detail.id} source={detail} controller={controller} onClose={closeDetail} onReconnect={source => { closeDetail(); setConnection({ existing: source }); }} /> : null}
  </View>;
}

export function PageTitle({ title, subtitle, eyebrow }: { title: string; subtitle: string; eyebrow: string }) {
  const t = useTheme(); return <View style={{ gap: 9 }}><Text style={{ color: t.muted, fontSize: 10, letterSpacing: 2 }}>{eyebrow}</Text><Text style={{ fontSize: 29, color: t.ink, fontWeight: '700', letterSpacing: -1 }}>{title}</Text><Text style={{ color: t.secondary, fontSize: 12, lineHeight: 20 }}>{subtitle}</Text></View>;
}

function Stat({ value, title, color, divider }: { value: number; title: string; color: string; divider?: boolean }) {
  const t = useTheme(); return <View style={{ flex: 1, alignItems: 'center', gap: 6, borderLeftWidth: divider ? 1 : 0, borderColor: t.line }}><Text style={{ fontSize: 24, fontWeight: '600', color, fontVariant: ['tabular-nums'], letterSpacing: -.5 }}>{value.toString().padStart(2, '0')}</Text><Text style={{ color: t.secondary, fontSize: 10 }}>{title}</Text></View>;
}

function EmptyState({ onAdd, onDemo }: { onAdd: () => void; onDemo: () => void }) {
  const t = useTheme(); return <Glass style={{ padding: 27, paddingTop: 38, paddingBottom: 30, gap: 23, alignItems: 'center', marginTop: 2 }}>
    <View style={{ width: 112, height: 112, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: 110, height: 110, borderWidth: 1, borderColor: t.line, borderRadius: 55 }} />
      <View style={{ position: 'absolute', width: 80, height: 80, borderWidth: 1, borderColor: t.line, borderRadius: 40 }} />
      <Logo size={54} /><View style={{ position: 'absolute', right: 0, top: 9, width: 24, height: 24, borderRadius: 9, backgroundColor: t.mintSoft, alignItems: 'center', justifyContent: 'center' }}><Plus size={13} color={t.mint} /></View>
    </View>
    <View style={{ gap: 10, alignItems: 'center' }}><Text style={{ color: t.ink, fontSize: 20, fontWeight: '600', letterSpacing: -.5 }}>给你的额度，一个家。</Text><Text style={{ color: t.secondary, fontSize: 12, lineHeight: 22, textAlign: 'center' }}>连接常用的反代或 API 站点，{'\n'}余量、用量和重置时间，打开就能看见。</Text></View>
    <View style={{ width: '100%', gap: 14 }}><Button title="连接第一个站点" icon={Plus} onPress={onAdd} /><Pressable accessibilityRole="button" onPress={onDemo} style={[styles.row, { gap: 6, justifyContent: 'center', padding: 10 }]}><Text style={{ fontSize: 12, color: t.secondary }}>先看演示</Text><ArrowRight size={14} color={t.secondary} /></Pressable></View>
    <View style={[styles.row, { gap: 6 }]}><ShieldCheck size={12} color={t.muted} /><Text style={{ color: t.muted, fontSize: 10 }}>无需注册 · 凭据保存在你的设备</Text></View>
  </Glass>;
}
