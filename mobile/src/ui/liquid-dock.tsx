import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Platform, Pressable, Text, View, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { LayoutGrid, Link2, Settings2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuotaController } from '../state/context';
import { tap, useGlassPreferences, useReduceMotion } from './primitives';
import { useTheme } from './theme';

const tabs = [
  { path: '/', label: '总览', icon: LayoutGrid },
  { path: '/connections', label: '连接', icon: Link2 },
  { path: '/settings', label: '设置', icon: Settings2 },
] as const;

// The dock lives above the route outlet so one lens survives every tab change.
export function LiquidDock({ index, progress, onSelect }: { index: number; progress: Animated.AnimatedInterpolation<number>; onSelect: (index: number) => void }) {
  const t = useTheme(); const insets = useSafeAreaInsets();
  const controller = useQuotaController();
  const { reduce, liquid } = useGlassPreferences();
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const [stretch] = useState(() => new Animated.Value(1));
  const [press] = useState(() => new Animated.Value(1));
  const cell = Math.max(0, (width - 14) / tabs.length);
  const translation = useMemo(() => Animated.multiply(progress, cell), [progress, cell]);
  const scale = useMemo(() => Animated.multiply(stretch, press), [stretch, press]);

  useEffect(() => {
    stretch.stopAnimation();
    if (reduceMotion) stretch.setValue(1);
    else Animated.sequence([
          Animated.timing(stretch, { toValue: 1.065, duration: 90, useNativeDriver: Platform.OS !== 'web' }),
          Animated.spring(stretch, { toValue: 1, stiffness: 280, damping: 18, mass: .65, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
    return () => stretch.stopAnimation();
  }, [index, stretch, reduceMotion]);

  function compress(value: number) {
    press.stopAnimation();
    if (reduceMotion) press.setValue(1);
    else Animated.spring(press, { toValue: value, stiffness: 350, damping: 24, mass: .5, useNativeDriver: Platform.OS !== 'web' }).start();
  }

  const web = Platform.OS === 'web' && !reduce ? { backdropFilter: 'blur(30px) saturate(145%)', WebkitBackdropFilter: 'blur(30px) saturate(145%)' } as ViewStyle : {};
  const surface: ViewStyle = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 35 };
  const lensSurface: ViewStyle = { ...surface, borderRadius: 29 };
  return <View pointerEvents="box-none" style={{ position: 'absolute', bottom: Math.max(insets.bottom, Platform.OS === 'web' ? 20 : 10), left: 22, right: 22, alignItems: 'center' }}>
    <View testID="liquid-dock" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={[{
      flexDirection: 'row', width: '100%', maxWidth: 400, padding: 6, minHeight: 70, borderRadius: 35, borderCurve: 'continuous',
      backgroundColor: reduce ? t.sheet : liquid ? 'transparent' : t.dock,
      borderWidth: 1, borderColor: t.border, overflow: 'hidden',
      boxShadow: t.dark ? '0px 10px 30px rgba(0,0,0,0.24)' : '0px 10px 30px rgba(28,55,37,0.13)',
    }, web]}>
      {liquid ? <GlassView isInteractive glassEffectStyle="clear" tintColor={t.glassTint} colorScheme={t.dark ? 'dark' : 'light'} style={surface} />
        : Platform.OS === 'ios' && !reduce ? <BlurView pointerEvents="none" tint={t.dark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'} intensity={65} style={surface} /> : null}
      {cell > 0 ? <Animated.View pointerEvents="none" testID="liquid-dock-lens" style={{
        position: 'absolute', left: 7, top: 6, bottom: 6, width: cell, borderRadius: 29, borderCurve: 'continuous',
        backgroundColor: reduce ? t.selected : t.lens, borderWidth: 1, borderColor: t.lensRim,
        boxShadow: t.dark ? '0px 3px 12px rgba(0,0,0,0.15)' : '0px 3px 12px rgba(42,77,52,0.09)',
        transform: [{ translateX: translation }, { scaleX: scale }, { scaleY: press }],
      }}>
        {liquid ? <GlassView glassEffectStyle="clear" tintColor={t.glassTint} colorScheme={t.dark ? 'dark' : 'light'} style={lensSurface} /> : null}
        {!reduce ? <LinearGradient pointerEvents="none" colors={t.dark ? ['rgba(240,255,235,0.16)', 'rgba(240,255,235,0.015)', 'rgba(240,255,235,0.08)'] : ['rgba(255,255,255,0.58)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0.22)']} locations={[0, .52, 1]} style={[lensSurface, { overflow: 'hidden' }]} /> : null}
      </Animated.View> : null}
      {tabs.map((tab, tabIndex) => <Pressable key={tab.path} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: index === tabIndex }} aria-selected={index === tabIndex}
        onPressIn={() => compress(.955)} onPressOut={() => compress(1)}
        onPress={() => { tap(controller.data.preferences.haptics); onSelect(tabIndex); }}
        style={{ flex: 1, minHeight: 56, gap: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 29 }}>
        <tab.icon size={20} strokeWidth={index === tabIndex ? 1.9 : 1.65} color={index === tabIndex ? t.ink : t.secondary} />
        <Text style={{ fontSize: 10, fontWeight: index === tabIndex ? '600' : '400', color: index === tabIndex ? t.ink : t.secondary }}>{tab.label}</Text>
      </Pressable>)}
    </View>
  </View>;
}
