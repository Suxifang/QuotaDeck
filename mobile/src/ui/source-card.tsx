import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ArrowUpRight, Clock3, CloudOff, Layers3, Network, Sparkles, Wallet } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { QuotaMetric, Source, SourceState } from '../domain/types';
import { PROVIDER_LABELS } from '../domain/types';
import { amount, countdown, isSampleStale, percentRemaining, relativeTime } from '../domain/format';
import { Chip, Glass, styles } from './primitives';
import { useTheme } from './theme';

export function Meter({ metric, threshold = 20 }: { metric: QuotaMetric; threshold?: number }) {
  const t = useTheme(); const percent = percentRemaining(metric);
  if (percent === undefined) return null;
  const low = percent <= threshold;
  return <View accessibilityLabel={`${metric.label}剩余 ${Math.round(percent)}%`} style={{ height: 6, borderRadius: 4, overflow: 'hidden', backgroundColor: t.dark ? '#33485D' : '#E8EEF5' }}>
    <LinearGradient colors={low ? ['#E2A158', '#EDC28C'] : ['#467FE8', '#85B7F4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      style={{ height: '100%', width: `${percent}%`, borderRadius: 4 }} />
  </View>;
}

export function ProviderMark({ source, size = 40 }: { source: Source; size?: number }) {
  const t = useTheme();
  const kind = source.resolvedKind ?? source.kind;
  const admin = kind === 'sub2-admin';
  const Icon = admin ? Network : kind === 'sub2api' ? Layers3 : kind === 'newapi' || kind === 'oneapi' ? Wallet : Sparkles;
  return <View style={{ width: size, height: size, borderRadius: size * .28, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center',
    backgroundColor: admin ? t.mintSoft : t.accentSoft, borderWidth: 1, borderColor: admin ? (t.dark ? '#345952' : '#D4ECE5') : (t.dark ? '#314969' : '#DBE8FD') }}>
    <Icon color={admin ? t.mint : t.accent} size={size * .48} strokeWidth={1.75} />
  </View>;
}

export function SourceCard({ source, state, threshold, onPress }: { source: Source; state?: SourceState; threshold: number; onPress: () => void }) {
  const t = useTheme(); const snapshot = state?.snapshot; const primary = snapshot?.metrics[0];
  const secondary = snapshot?.metrics[1]; const stale = !!primary && isSampleStale(primary);
  const remaining = primary ? percentRemaining(primary) : undefined;
  return <Pressable accessibilityRole="button" accessibilityLabel={`查看${source.name}额度详情`} onPress={onPress}
    style={({ pressed }) => ({ opacity: source.enabled ? pressed ? .84 : 1 : .55, transform: [{ scale: pressed ? .992 : 1 }] })}>
    <Glass style={{ padding: 22, gap: 18 }}>
      {source.pinned && !t.dark ? <LinearGradient pointerEvents="none" colors={['rgba(225,238,255,0.32)', 'rgba(255,255,255,0)']} style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 150 }} /> : null}
      <View style={[styles.between, { gap: 10 }]}>
        <View style={[styles.row, { gap: 11, flex: 1 }]}><ProviderMark source={source} />
          <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: t.ink, fontSize: 15, fontWeight: '700', letterSpacing: -.25 }}>{source.name}</Text>
            <Text style={{ color: t.secondary, fontSize: 10, marginTop: 5, letterSpacing: .1 }}>{PROVIDER_LABELS[source.resolvedKind ?? source.kind]}</Text></View></View>
        {state?.refreshing ? <ActivityIndicator size="small" color={t.accent} /> : <ArrowUpRight size={17} color={t.muted} strokeWidth={1.5} />}
      </View>
      <View style={{ gap: 10 }}>
        <View style={[styles.between, { alignItems: 'flex-end', gap: 10 }]}>
          <View style={{ flex: 1 }}><Text style={{ color: t.secondary, fontSize: 11, marginBottom: 6 }}>{primary?.label ?? '可用额度'} · 剩余</Text>
            <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: stale || state?.error ? t.secondary : t.ink, fontSize: 41, fontWeight: '600', letterSpacing: -1.9, fontVariant: ['tabular-nums'] }}>
              {primary?.unlimited ? '不限额' : amount(primary?.remaining, primary?.unit ?? 'USD')}
            </Text></View>
          {snapshot?.today ? <View style={{ alignItems: 'flex-end', paddingBottom: 5 }}><Text style={{ fontSize: 10, color: t.secondary, marginBottom: 6 }}>今日消耗</Text><Text style={{ color: t.ink, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{amount(snapshot.today.value, snapshot.today.unit)}</Text></View>
            : remaining !== undefined ? <Chip label={stale ? '采样待更新' : `${Math.round(remaining)}% 可用`} color={stale || remaining <= threshold ? 'amber' : 'green'} /> : null}
        </View>
        {primary ? <Meter metric={primary} threshold={threshold} /> : null}
        {primary?.limit !== undefined && primary.unit !== '%' && !primary.unlimited ? <Text style={{ color: t.muted, fontSize: 10 }}>总额度 {amount(primary.limit, primary.unit)}</Text> : null}
      </View>
      {secondary ? <View style={{ gap: 9, borderTopWidth: 1, borderColor: t.line, paddingTop: 15 }}>
        <View style={styles.between}><Text style={{ color: t.secondary, fontSize: 11 }}>{secondary.label} · 剩余</Text>
          <Text style={{ color: (percentRemaining(secondary) ?? 101) <= threshold ? t.amber : t.ink, fontWeight: '600', fontSize: 19, fontVariant: ['tabular-nums'], letterSpacing: -.5 }}>{secondary.unlimited ? '不限额' : amount(secondary.remaining, secondary.unit)}</Text></View>
        <Meter metric={secondary} threshold={threshold} />
      </View> : null}
      <View style={[styles.between, { gap: 7, borderTopWidth: 1, borderColor: t.line, paddingTop: 13 }]}>
        <View style={[styles.row, { flex: 1, gap: 6 }]}>
          {state?.error ? <CloudOff size={12} color={t.amber} /> : <Clock3 size={12} color={stale ? t.amber : t.muted} />}
          <Text numberOfLines={1} style={{ color: state?.error || stale ? t.amber : t.secondary, fontSize: 10, flexShrink: 1 }}>
            {!source.enabled ? '已暂停刷新' : state?.error ?? (stale ? '后台采样待更新' : primary?.resetAt ? `${primary.resetEstimated ? '预计 ' : ''}${countdown(primary.resetAt)}` : '按实际账本查询')}
          </Text>
        </View>
        <Text style={{ color: t.muted, fontSize: 9 }}>{relativeTime(snapshot?.fetchedAt)}</Text>
      </View>
    </Glass>
  </Pressable>;
}
