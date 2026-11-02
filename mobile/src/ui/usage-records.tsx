import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Clock3, ListFilter, RefreshCw } from 'lucide-react-native';
import type { Source, UsageRecord } from '../domain/types';
import { duration, tokenCount, usageCost, usageDay, usageTime } from '../domain/usage-format';
import type { UsageRecordsState } from '../state/useUsageRecords';
import { Button, Glass, IconButton, styles } from './primitives';
import { useTheme } from './theme';

export function UsageRecords({ source, state, onReconnect }: { source: Source; state: UsageRecordsState; onReconnect: () => void }) {
  const t = useTheme();
  const [expanded, setExpanded] = useState<{ id: string; revision: string }>();
  const revision = `${state.page}:${state.result?.fetchedAt}`;
  const reconnect = state.error?.code === 'AUTH' || state.error?.code === 'FORBIDDEN';
  const unsupported = state.error?.code === 'UNSUPPORTED';
  return <>
    <View style={[styles.between, { gap: 12 }]}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={{ color: t.ink, fontSize: 23, fontWeight: '600', letterSpacing: -.6 }}>最近使用</Text>
        <Text style={{ color: t.secondary, fontSize: 11, lineHeight: 18 }}>{source.accountId ? `仅上游账号 #${source.accountId} · 最新在前` : '仅当前密钥 · 最新在前'}</Text>
      </View>
      {state.loading ? <ActivityIndicator color={t.accent} style={{ width: 38, height: 38 }} /> : <IconButton icon={RefreshCw} label="刷新使用记录" size={38} onPress={state.refresh} />}
    </View>
    {state.error ? <Glass subtle style={{ padding: 18, gap: 12, borderRadius: 20 }}>
      <View style={[styles.row, { gap: 8 }]}><ListFilter size={17} color={t.amber} /><Text style={{ color: t.ink, fontSize: 14, fontWeight: '600' }}>{unsupported ? '此连接暂不支持记录' : '使用记录暂未更新'}</Text></View>
      <Text accessibilityRole="alert" style={{ color: t.secondary, fontSize: 12, lineHeight: 21 }}>{state.error.message}</Text>
      {state.result ? <Text style={{ color: t.muted, fontSize: 10 }}>下方仍是上次成功读取的记录。</Text> : null}
      {!unsupported ? <Button title={reconnect ? '重新连接' : '重新加载记录'} secondary loading={state.loading} onPress={reconnect ? onReconnect : state.refresh} /> : null}
    </Glass> : null}
    {state.result ? <>
      <View style={styles.between}>
        <Text style={{ color: t.muted, fontSize: 10 }}>{state.result.recentOnly ? '近期记录' : '调用记录'} · 第 {state.page} 页</Text>
        <Text style={{ color: t.muted, fontSize: 10 }}>点开一条，查看详情</Text>
      </View>
      {state.records.length ? <Glass style={{ paddingHorizontal: 16, borderRadius: 22 }}>
        {state.records.map((record, index) => {
          const day = usageDay(record.createdAt);
          const showDay = index === 0 || day !== usageDay(state.records[index - 1].createdAt);
          return <React.Fragment key={record.id}>
            {showDay ? <View style={[styles.row, { gap: 6, paddingTop: 17, paddingBottom: 4 }]}><Clock3 size={11} color={t.muted} /><Text style={{ color: t.muted, fontSize: 10, fontWeight: '600' }}>{day}</Text></View> : null}
            <UsageRow record={record} expanded={expanded?.revision === revision && expanded.id === record.id} divider={!showDay} onPress={() => setExpanded(value => value?.id === record.id && value.revision === revision ? undefined : { id: record.id, revision })} />
          </React.Fragment>;
        })}
      </Glass> : <Glass subtle style={{ padding: 26, alignItems: 'center', gap: 11 }}>
        <Clock3 size={25} color={t.muted} strokeWidth={1.5} />
        <Text style={{ color: t.ink, fontSize: 14, fontWeight: '600' }}>还没有使用记录</Text>
        <Text style={{ color: t.secondary, fontSize: 11, textAlign: 'center', lineHeight: 19 }}>站点本次返回了空列表，产生调用后可刷新查看。</Text>
      </Glass>}
      {state.page > 1 || state.hasNext ? <View style={[styles.between, { gap: 12 }]}>
        <PageButton label="上一页" direction="previous" disabled={state.loading || state.page <= 1} onPress={state.previous} />
        <Text style={{ color: t.muted, fontSize: 11 }}>{state.page}</Text>
        <PageButton label="下一页" direction="next" disabled={state.loading || !state.hasNext} onPress={state.next} />
      </View> : null}
      {state.result.notice ? <Text style={{ color: t.muted, fontSize: 10, lineHeight: 18 }}>{state.result.notice}</Text> : null}
      <Text style={{ color: t.muted, fontSize: 10, lineHeight: 18 }}>记录来自站点后台；费用按返回的扣费显示，缺少扣费字段时标记为标准价。时间按手机时区显示。</Text>
    </> : state.loading ? <Text style={{ color: t.secondary, fontSize: 12, textAlign: 'center', paddingVertical: 30 }}>正在读取站点使用记录…</Text> : null}
  </>;
}

function UsageRow({ record, expanded, divider, onPress }: { record: UsageRecord; expanded: boolean; divider: boolean; onPress: () => void }) {
  const t = useTheme();
  return <View style={{ borderTopWidth: divider ? 1 : 0, borderColor: t.line }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${record.model}，${usageTime(record.createdAt)}，${usageCost(record.cost)}，${expanded ? '收起' : '展开'}调用详情`} accessibilityState={{ expanded }} onPress={onPress}
      style={({ pressed }) => ({ gap: 9, paddingVertical: 17, opacity: pressed ? .65 : 1 })}>
      <View style={[styles.between, { gap: 10 }]}>
        <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontSize: 14, fontWeight: '600' }}>{record.model}</Text>
        <View style={{ alignItems: 'flex-end', gap: 2, maxWidth: '48%' }}><Text numberOfLines={1} adjustsFontSizeToFit style={{ color: record.failed ? t.amber : t.accent, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: -.3 }}>{usageCost(record.cost)}</Text>
          {record.cost?.kind === 'standard' ? <Text style={{ color: t.muted, fontSize: 9 }}>标准价</Text> : null}</View>
      </View>
      <View style={[styles.between, { gap: 7 }]}>
        <Text style={{ color: t.muted, fontSize: 10, fontVariant: ['tabular-nums'] }}>{usageTime(record.createdAt)}{record.failed ? ' · 失败' : ''}</Text>
        <View style={[styles.row, { gap: 5, flexShrink: 1 }]}>
          <ArrowDown size={10} color={t.mint} /><Text numberOfLines={1} style={{ color: t.secondary, fontSize: 10, fontVariant: ['tabular-nums'] }}>{tokenCount(record.inputTokens)}</Text>
          <ArrowUp size={10} color={t.accent} style={{ marginLeft: 3 }} /><Text numberOfLines={1} style={{ color: t.secondary, fontSize: 10, fontVariant: ['tabular-nums'] }}>{tokenCount(record.outputTokens)}</Text>
          <ChevronDown size={13} color={t.muted} style={{ marginLeft: 3, transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
        </View>
      </View>
    </Pressable>
    {expanded ? <View style={{ borderRadius: 14, borderCurve: 'continuous', backgroundColor: t.input, padding: 14, marginBottom: 16, gap: 14 }}>
      <MetricPair left={['输入 Token', tokenCount(record.inputTokens)]} right={['输出 Token', tokenCount(record.outputTokens)]} />
      <MetricPair left={['缓存读取', tokenCount(record.cacheReadTokens)]} right={['缓存写入', tokenCount(record.cacheWriteTokens)]} />
      <MetricPair left={['首字延迟', duration(record.firstTokenMs)]} right={['总耗时', duration(record.durationMs)]} />
      {record.reasoningEffort || record.stream !== undefined ? <MetricPair left={['推理强度', record.reasoningEffort ?? '—']} right={['请求方式', record.stream === true ? '流式' : record.stream === false ? '非流式' : '—']} /> : null}
      <Text style={{ color: t.muted, fontSize: 9, lineHeight: 16 }}>{record.cost?.kind === 'standard' ? '本站未返回实际扣费，此处为倍率调整前的标准费用。' : '— 表示站点没有提供该字段；0 为真实返回值。'}</Text>
    </View> : null}
  </View>;
}

function MetricPair({ left, right }: { left: [string, string]; right: [string, string] }) {
  const t = useTheme();
  return <View style={{ flexDirection: 'row', gap: 16 }}>{[left, right].map(([label, value]) => <View key={label} style={{ flex: 1, gap: 5 }}><Text style={{ color: t.muted, fontSize: 10 }}>{label}</Text><Text selectable numberOfLines={2} style={{ color: t.ink, fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] }}>{value}</Text></View>)}</View>;
}

function PageButton({ label, direction, disabled, onPress }: { label: string; direction: 'previous' | 'next'; disabled: boolean; onPress: () => void }) {
  const t = useTheme(); const Icon = direction === 'previous' ? ChevronLeft : ChevronRight;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}使用记录`} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: t.accentSoft, opacity: disabled ? .35 : pressed ? .65 : 1 })}>
    {direction === 'previous' ? <Icon size={14} color={t.accent} /> : null}<Text style={{ color: t.accent, fontSize: 12, fontWeight: '600' }}>{label}</Text>{direction === 'next' ? <Icon size={14} color={t.accent} /> : null}
  </Pressable>;
}
