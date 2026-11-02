import React, { useState } from 'react';
import { Linking, Pressable, Switch, Text, View } from 'react-native';
import { ExternalLink, KeyRound, RefreshCw, Trash2 } from 'lucide-react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { HistoryPoint, Source } from '../domain/types';
import { PROVIDER_LABELS } from '../domain/types';
import { amount, countdown, isSampleStale, percentRemaining } from '../domain/format';
import type { QuotaController } from '../state/useQuota';
import { Button, Chip, Field, Glass, Sheet, styles } from './primitives';
import { Meter } from './source-card';
import { useTheme } from './theme';

function timestamp(value?: string) { return value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '未提供'; }
function dayId(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }

export function HistoryChart({ points, metricId, unit }: { points: HistoryPoint[]; metricId: string; unit: string }) {
  const t = useTheme();
  const days = Array.from({ length: 7 }, (_, index) => { const day = new Date(); day.setDate(day.getDate() - 6 + index); return dayId(day); });
  const values = days.map(day => points.find(point => point.date === day)?.metrics.find(metric => metric.id === metricId && metric.unit === unit)?.remaining);
  const valid = values.filter((value): value is number => value !== undefined && Number.isFinite(value));
  if (!valid.length) return <Text style={{ color: t.secondary, fontSize: 12, lineHeight: 21 }}>开始查询后，这里会保留每天最后一次读取的余量。</Text>;
  const minimum = Math.min(...valid); const maximum = Math.max(...valid);
  const range = maximum - minimum || Math.max(Math.abs(maximum) * .1, 1);
  const y = (value: number) => 92 - (value - minimum) / range * 65;
  let path = '';
  let connected = false;
  values.forEach((value, index) => { if (value === undefined) { connected = false; return; } path += `${connected ? ' L' : ' M'}${12 + index * 46},${y(value)}`; connected = true; });
  return <View style={{ gap: 10 }}>
    <View style={styles.between}><Text style={{ color: t.muted, fontSize: 10 }}>高 {amount(maximum, unit)}</Text><Text style={{ color: t.muted, fontSize: 10 }}>低 {amount(minimum, unit)}</Text></View>
    <Svg width="100%" height={112} viewBox="0 0 300 112" accessibilityLabel="近七天每日余量折线图，缺失日期留空">
      {[25, 60, 95].map(row => <Line key={row} x1="8" x2="292" y1={row} y2={row} stroke={t.line} strokeDasharray="3 5" />)}
      <Path d={path} stroke={t.accent} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((value, index) => value === undefined ? null : <Circle key={index} cx={12 + index * 46} cy={y(value)} r={3.5} fill={t.accent} stroke={t.sheet} strokeWidth={2} />)}
    </Svg>
    <View style={styles.between}>{days.map((day, index) => <Text key={day} style={{ color: t.muted, fontSize: 9 }}>{index === 6 ? '今天' : day.slice(5).replace('-', '/')}</Text>)}</View>
    <Text style={{ color: t.muted, fontSize: 10, lineHeight: 17 }}>每日最后一次余量，缺失日期留空；额度重置时曲线会回升。</Text>
  </View>;
}

export function DetailSheet({ source, controller, onClose, onReconnect }: { source: Source; controller: QuotaController; onClose: () => void; onReconnect: (source: Source) => void }) {
  const t = useTheme();
  const [name, setName] = useState(source.name);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const [metricId, setMetricId] = useState<string>();
  const [section, setSection] = useState<'overview' | 'history' | 'manage'>('overview');
  const state = controller.data.states[source.id]; const snapshot = state?.snapshot;
  const primary = snapshot?.metrics.find(metric => metric.id === metricId) ?? snapshot?.metrics[0];
  const demo = controller.isDemo;
  return <Sheet visible title={source.name} subtitle={PROVIDER_LABELS[source.resolvedKind ?? source.kind]} onClose={onClose}>
    <View style={{ flexDirection: 'row', padding: 4, gap: 4, borderRadius: 14, borderCurve: 'continuous', backgroundColor: t.input }}>
      {([{ id: 'overview', label: '额度概览' }, { id: 'history', label: '余量记录' }, ...(!demo ? [{ id: 'manage' as const, label: '连接管理' }] : [])] as const).map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: section === item.id }} onPress={() => setSection(item.id)}
        style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderCurve: 'continuous', backgroundColor: section === item.id ? t.dark ? '#3A526F' : 'white' : 'transparent' }}>
        <Text style={{ color: section === item.id ? t.ink : t.secondary, fontSize: 12, fontWeight: section === item.id ? '600' : '400' }}>{item.label}</Text>
      </Pressable>)}
    </View>
    {demo ? <Chip label="演示 · 示例数据" color="amber" /> : null}
    {section === 'overview' ? <>
    {state?.error ? <Glass style={{ padding: 17, gap: 8, borderRadius: 20 }}><Text style={{ color: t.amber, fontSize: 13, lineHeight: 21 }}>{state.error}</Text><Text style={{ color: t.secondary, fontSize: 11 }}>下方保留最近成功读取的额度。</Text></Glass> : null}
    {snapshot?.notice ? <Text style={{ color: t.amber, fontSize: 12, lineHeight: 20 }}>{snapshot.notice}</Text> : null}
    {snapshot?.metrics.map(metric => {
      const stale = isSampleStale(metric); const percent = percentRemaining(metric);
      return <Glass key={metric.id} style={{ padding: 20, gap: 14 }}>
        <View style={styles.between}><Text style={{ color: t.ink, fontSize: 14, fontWeight: '600' }}>{metric.label}</Text>
          {stale ? <Chip label="采样待更新" color="amber" /> : percent !== undefined ? <Chip label={`${Math.round(percent)}% 可用`} color={percent <= controller.data.preferences.lowThreshold ? 'amber' : 'green'} /> : null}</View>
        <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: stale ? t.secondary : t.ink, fontSize: 38, letterSpacing: -1.3, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{metric.unlimited ? '不限额' : amount(metric.remaining, metric.unit)}</Text>
        <Meter metric={metric} threshold={controller.data.preferences.lowThreshold} />
        <View style={styles.between}><Text style={{ color: t.secondary, fontSize: 11 }}>已用 {amount(metric.used, metric.unit)}</Text><Text style={{ color: t.secondary, fontSize: 11 }}>总量 {metric.unlimited ? '不限额' : amount(metric.limit, metric.unit)}</Text></View>
        {metric.resetAt ? <Text style={{ color: stale ? t.amber : t.secondary, fontSize: 11 }}>{metric.resetEstimated ? '预计 ' : ''}{countdown(metric.resetAt)} · {timestamp(metric.resetAt)}</Text> : null}
        {metric.scope === 'upstream' ? <Text style={{ color: t.muted, fontSize: 10, lineHeight: 17 }}>后台采样：{timestamp(metric.sampledAt)}{stale ? '\n手机查询成功也不会把旧采样当作新额度。' : ''}</Text> : null}
      </Glass>;
    })}
    {!snapshot ? <Text style={{ color: t.secondary, fontSize: 13 }}>尚未读取到额度，请刷新或检查连接。</Text> : null}
    {snapshot?.today ? <View style={styles.between}><Text style={{ color: t.secondary, fontSize: 12 }}>今日实际消耗</Text><Text style={{ color: t.ink, fontSize: 18, fontWeight: '600' }}>{amount(snapshot.today.value, snapshot.today.unit)}</Text></View> : null}
    {snapshot?.expiresAt ? <Text style={{ color: t.secondary, fontSize: 12 }}>套餐到期：{timestamp(snapshot.expiresAt)}</Text> : null}
    <Text style={{ color: t.muted, fontSize: 10 }}>最近成功查询：{timestamp(snapshot?.fetchedAt)}</Text>
    <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Button title="刷新额度" icon={RefreshCw} loading={state?.refreshing} disabled={!source.enabled || demo} onPress={() => void controller.refreshOne(source.id)} /></View>
      <View style={{ flex: 1 }}><Button title="打开站点" secondary icon={ExternalLink} disabled={demo} onPress={() => void Linking.openURL(source.baseUrl).catch(() => {})} /></View></View>
    </> : null}
    {section === 'history' && primary ? <>
      <View style={{ gap: 7 }}><Text style={{ color: t.ink, fontSize: 21, fontWeight: '600', letterSpacing: -.5 }}>每天，留下一点记录。</Text><Text style={{ color: t.secondary, fontSize: 11, lineHeight: 20 }}>保存每天最后一次查询的额度，方便回看变化。</Text></View>
      <Glass subtle style={{ padding: 20, gap: 15 }}>
      <Text style={{ color: t.ink, fontSize: 14, fontWeight: '600' }}>近七天 · 余量记录</Text>
      {(snapshot?.metrics.length ?? 0) > 1 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{snapshot?.metrics.map(metric => <Pressable key={metric.id} onPress={() => setMetricId(metric.id)} accessibilityRole="button"
        style={{ paddingVertical: 7, paddingHorizontal: 10, borderRadius: 9, backgroundColor: primary.id === metric.id ? t.accentSoft : t.input }}><Text style={{ fontSize: 10, color: primary.id === metric.id ? t.accent : t.secondary }}>{metric.label}</Text></Pressable>)}</View> : null}
      <HistoryChart points={controller.data.history[source.id] ?? []} metricId={primary.id} unit={primary.unit} />
    </Glass>
      <Glass style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6 }}>
        <View style={{ flexDirection: 'row', paddingBottom: 12 }}><Text style={{ flex: 1, color: t.muted, fontSize: 10 }}>查询日期</Text><Text style={{ flex: 1, color: t.muted, fontSize: 10, textAlign: 'right' }}>剩余</Text><Text style={{ flex: 1, color: t.muted, fontSize: 10, textAlign: 'right' }}>周期已用</Text></View>
        {(controller.data.history[source.id] ?? []).slice(-7).reverse().map(point => {
          const record = point.metrics.find(metric => metric.id === primary.id && metric.unit === primary.unit);
          return <View key={point.date} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderTopWidth: 1, borderColor: t.line }}><Text style={{ flex: 1, color: t.secondary, fontSize: 11 }}>{point.date.slice(5).replace('-', '/')}</Text><Text style={{ flex: 1, color: t.ink, fontSize: 13, fontWeight: '600', textAlign: 'right', fontVariant: ['tabular-nums'] }}>{amount(record?.remaining, primary.unit)}</Text><Text style={{ flex: 1, color: t.secondary, fontSize: 11, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{amount(record?.used, primary.unit)}</Text></View>;
        })}
        {!(controller.data.history[source.id]?.length) ? <Text style={{ color: t.secondary, fontSize: 12, paddingVertical: 20 }}>开始查询后，这里会出现记录。</Text> : null}
      </Glass>
      <Text style={{ color: t.muted, fontSize: 10, lineHeight: 19 }}>展示最近七条每日快照。“周期已用”来自所选额度周期；重置时会变化。这里不是逐笔请求日志或实际扣费账单。</Text>
    </> : section === 'history' ? <Text style={{ color: t.secondary, fontSize: 13, lineHeight: 22 }}>还没有可记录的额度，先在“额度概览”中查询一次。</Text> : null}
    {!demo && section === 'manage' ? <>
      <Field label="显示名称" value={name} onChangeText={setName} onBlur={() => { if (name.trim() && name.trim() !== source.name) controller.changeSource(source.id, { name: name.trim() }); }} />
      <Glass subtle style={{ paddingHorizontal: 18, borderRadius: 22 }}>
        <View style={[styles.between, { paddingVertical: 14 }]}><Text style={{ color: t.ink, fontSize: 13 }}>置顶到总览</Text><Switch accessibilityLabel="置顶到总览" value={source.pinned} onValueChange={pinned => controller.changeSource(source.id, { pinned })} trackColor={{ true: t.accent }} /></View>
        <View style={[styles.between, { paddingVertical: 14, borderTopWidth: 1, borderColor: t.line }]}><View><Text style={{ color: t.ink, fontSize: 13 }}>自动查询</Text><Text style={{ color: t.muted, fontSize: 10, marginTop: 4 }}>应用在前台时刷新</Text></View><Switch accessibilityLabel="自动查询" value={source.enabled} onValueChange={enabled => controller.changeSource(source.id, { enabled })} trackColor={{ true: t.accent }} /></View>
      </Glass>
      <Button title="重新连接此站点" icon={KeyRound} secondary onPress={() => onReconnect(source)} />
      {confirmRemove ? <Glass style={{ padding: 18, gap: 14, borderRadius: 21 }}><Text style={{ color: t.ink, fontSize: 13, lineHeight: 21 }}>移除“{source.name}”及它在本机的记录？</Text><Text style={{ color: t.secondary, fontSize: 11 }}>不会删除后台账号。</Text>
        <Button title="确认移除" icon={Trash2} onPress={() => { void controller.removeSource(source.id).then(onClose).catch(() => setRemoveError('移除失败，请重试')); }} />
        <Pressable accessibilityRole="button" onPress={() => setConfirmRemove(false)}><Text style={{ color: t.secondary, textAlign: 'center', fontSize: 12 }}>取消</Text></Pressable>
        {removeError ? <Text style={{ color: t.red }}>{removeError}</Text> : null}
      </Glass> : <Pressable accessibilityRole="button" onPress={() => setConfirmRemove(true)} style={[styles.row, { justifyContent: 'center', gap: 7, padding: 15 }]}><Trash2 size={15} color={t.red} /><Text style={{ color: t.red, fontSize: 12 }}>移除连接</Text></Pressable>}
    </> : null}
  </Sheet>;
}
