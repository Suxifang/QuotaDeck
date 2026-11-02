import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { ArrowUpRight, X, type LucideIcon } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, useTheme } from './theme';

export const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' }, between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 }, caption: { fontSize: 12, lineHeight: 18 },
});

export function Logo({ size = 40 }: { size?: number }) {
  return <LinearGradient colors={['#5598FF', '#2C6BDA']} style={{ width: size, height: size, borderRadius: size * 0.25, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 5px 14px rgba(48,120,234,0.20)' }}>
    <Svg width={size * .65} height={size * .65} viewBox="0 0 32 32"><Path d="M8 8.5h7a8 8 0 0 1 0 16H8V8.5Z" fill="none" stroke="white" strokeWidth="3.1" strokeLinejoin="round"/><Path d="m16 18 9 9M8 14h6M8 19h4" stroke="white" strokeWidth="3.1" strokeLinecap="round"/></Svg>
  </LinearGradient>;
}

export function useGlassPreferences() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AccessibilityInfo.isReduceTransparencyEnabled().then(setReduce).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduce);
    return () => listener.remove();
  }, []);
  let liquid = false;
  try { liquid = Platform.OS === 'ios' && !reduce && isGlassEffectAPIAvailable() && isLiquidGlassAvailable(); } catch { /* unsupported OS */ }
  return { reduce, liquid };
}

export function Glass({ children, style, subtle = false }: React.PropsWithChildren<{ style?: StyleProp<ViewStyle>; subtle?: boolean }>) {
  const t = useTheme();
  const { reduce, liquid } = useGlassPreferences();
  const shell: ViewStyle = { borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: t.border,
    backgroundColor: reduce ? t.sheet : subtle || liquid ? t.panelSubtle : t.panel,
    overflow: 'hidden', boxShadow: t.dark ? '0px 12px 35px rgba(0,0,0,0.10)' : '0px 10px 32px rgba(36,62,46,0.035)' };
  const web = Platform.OS === 'web' && !reduce ? { backdropFilter: 'blur(28px) saturate(120%)', WebkitBackdropFilter: 'blur(28px) saturate(120%)' } as ViewStyle : {};
  return <View style={[shell, web, style]}>
    {liquid ? <GlassView pointerEvents="none" glassEffectStyle="regular" tintColor={t.glassTint} colorScheme={t.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      : Platform.OS === 'ios' && !reduce ? <BlurView pointerEvents="none" tint={t.dark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'} intensity={30} style={StyleSheet.absoluteFill} /> : null}
    {children}
  </View>;
}

export function IconButton({ icon: Icon, label, onPress, color, active, disabled, size = 44 }: { icon: LucideIcon; label: string; onPress: () => void; color?: string; active?: boolean; disabled?: boolean; size?: number }) {
  const t = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} hitSlop={5} onPress={onPress}
    style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
      backgroundColor: active ? t.accentSoft : t.control, opacity: disabled ? .4 : pressed ? .65 : 1,
      borderWidth: 1, borderColor: t.border })}><Icon size={20} strokeWidth={1.8} color={color ?? t.ink} /></Pressable>;
}

export function Button({ title, onPress, secondary, loading, disabled, icon: Icon }: { title: string; onPress: () => void; secondary?: boolean; loading?: boolean; disabled?: boolean; icon?: LucideIcon }) {
  const t = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled || loading} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 52, borderRadius: radius.button, borderCurve: 'continuous', paddingVertical: 13, paddingHorizontal: 19,
      backgroundColor: secondary ? t.accentSoft : t.accent, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center',
      opacity: disabled ? .4 : pressed ? .78 : 1, transform: [{ scale: pressed ? .985 : 1 }] })}>
    {loading ? <ActivityIndicator size="small" color={secondary ? t.accent : t.accentForeground} /> : Icon ? <Icon size={18} color={secondary ? t.accent : t.accentForeground} /> : null}
    <Text style={{ color: secondary ? t.accent : t.accentForeground, fontSize: 15, fontWeight: '600' }}>{title}</Text>
  </Pressable>;
}

export function Chip({ label, color, icon: Icon }: { label: string; color?: 'blue' | 'green' | 'amber'; icon?: LucideIcon }) {
  const t = useTheme();
  const ink = color === 'green' ? t.mint : color === 'amber' ? t.amber : t.accent;
  const bg = color === 'green' ? t.mintSoft : color === 'amber' ? t.amberSoft : t.accentSoft;
  return <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', alignSelf: 'flex-start', backgroundColor: bg, borderRadius: radius.badge, borderCurve: 'continuous', paddingHorizontal: 9, paddingVertical: 5 }}>
    {Icon ? <Icon size={12} color={ink} strokeWidth={2} /> : <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: ink }} />}
    <Text style={{ color: ink, fontSize: 10, fontWeight: '600' }}>{label}</Text>
  </View>;
}

export function Field({ label, hint, hideLabel = false, ...input }: TextInputProps & { label: string; hint?: string; hideLabel?: boolean }) {
  const t = useTheme();
  return <View style={{ gap: 8 }}>
    {!hideLabel ? <Text style={[styles.label, { color: t.ink }]}>{label}</Text> : null}
    <TextInput placeholderTextColor={t.muted} autoCapitalize="none" autoCorrect={false} {...input}
      accessibilityLabel={label} style={[{ minHeight: 51, borderRadius: radius.control, borderCurve: 'continuous', paddingHorizontal: 15, paddingVertical: 12, backgroundColor: t.input,
        borderWidth: 1, borderColor: t.line, color: t.ink, fontSize: 14 }, input.style]} />
    {hint ? <Text style={{ color: t.secondary, fontSize: 11, lineHeight: 17 }}>{hint}</Text> : null}
  </View>;
}

export function Sheet({ visible, title, subtitle, onClose, children }: React.PropsWithChildren<{ visible: boolean; title: string; subtitle?: string; onClose: () => void }>) {
  const t = useTheme(); const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <View style={{ flex: 1, backgroundColor: t.dark ? 'rgba(3,15,9,0.65)' : 'rgba(39,65,56,0.22)', justifyContent: 'flex-end' }}>
      <Pressable accessibilityLabel="关闭面板" onPress={onClose} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxWidth: 580, maxHeight: '94%', alignSelf: 'center' }}>
        <View style={{ flexShrink: 1, backgroundColor: t.sheet, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderCurve: 'continuous', borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
          <View style={{ alignSelf: 'center', width: 34, height: 4, borderRadius: 2, backgroundColor: t.muted, opacity: .3, marginTop: 10 }} />
          <View style={[styles.between, { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 18, gap: 12 }]}>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 25, fontWeight: '700', letterSpacing: -.8, color: t.ink }}>{title}</Text>
              {subtitle ? <Text numberOfLines={2} style={{ fontSize: 12, color: t.secondary, marginTop: 5 }}>{subtitle}</Text> : null}</View>
            <IconButton icon={X} label="关闭" onPress={onClose} size={36} />
          </View>
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 24) + 12, gap: 20 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  </Modal>;
}

export function SectionLink({ title, subtitle, onPress, icon: Icon }: { title: string; subtitle?: string; onPress: () => void; icon: LucideIcon }) {
  const t = useTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.row, { gap: 13, paddingVertical: 16 }]}>
    <View style={{ height: 38, width: 38, borderRadius: 13, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon size={18} color={t.accent} /></View>
    <View style={{ flex: 1 }}><Text style={{ color: t.ink, fontWeight: '600', fontSize: 14 }}>{title}</Text>{subtitle ? <Text style={{ fontSize: 11, color: t.secondary, marginTop: 4 }}>{subtitle}</Text> : null}</View>
    <ArrowUpRight color={t.muted} size={16} />
  </Pressable>;
}

export function tap(enabled: boolean) { if (enabled && Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {}); }
