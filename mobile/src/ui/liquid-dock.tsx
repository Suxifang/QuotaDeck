import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, Text, View, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { LayoutGrid, Link2, Settings2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuotaController } from '../state/context';
import { dockCandidate, dockCellWidth, dockDragPosition, dockTabAt } from './dock-gesture';
import { tap, useGlassPreferences, useReduceMotion } from './primitives';
import { useTheme } from './theme';

const tabs = [
  { path: '/', label: '总览', icon: LayoutGrid },
  { path: '/connections', label: '连接', icon: Link2 },
  { path: '/settings', label: '设置', icon: Settings2 },
] as const;

/** One continuous lens: page swipes are native-driven; dock drags commit on release. */
export function LiquidDock({ index, progress, onSelect }: { index: number; progress: Animated.AnimatedInterpolation<number>; onSelect: (index: number) => void }) {
  const t = useTheme(); const insets = useSafeAreaInsets();
  const controller = useQuotaController();
  const { reduce, liquid } = useGlassPreferences();
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const [manual, setManual] = useState(false);
  const [candidate, setCandidate] = useState(index);
  const [pan, setPan] = useState<ReturnType<typeof PanResponder.create>>();
  const [finger] = useState(() => new Animated.Value(index));
  const [lift] = useState(() => new Animated.Value(0));
  const dock = useRef<React.ComponentRef<typeof View>>(null);
  const originX = useRef(0);
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const motion = useRef(0);
  const ignoreClickUntil = useRef(0);
  const gesture = useRef({ active: false, dragging: false, cancelled: false, start: index, original: index, position: index, candidate: index });
  const live = useRef({ index, width, reduceMotion, onSelect, haptics: controller.data.preferences.haptics });
  const haptics = controller.data.preferences.haptics;
  useLayoutEffect(() => { live.current = { index, width, reduceMotion, onSelect, haptics }; }, [index, width, reduceMotion, onSelect, haptics]);
  const cell = dockCellWidth(width);
  const translation = useMemo(() => Animated.multiply(manual ? finger : progress, cell), [manual, finger, progress, cell]);

  const actions = useMemo(() => {
    const clearHold = () => { clearTimeout(hold.current); hold.current = undefined; };
    function liftTo(value: number) {
      lift.stopAnimation();
      if (live.current.reduceMotion) { lift.setValue(0); return; }
      Animated.spring(lift, { toValue: value, stiffness: 420, damping: 28, mass: .55, useNativeDriver: Platform.OS !== 'web' }).start();
    }
    function activate() {
      const g = gesture.current;
      if (!g.active || g.dragging || g.cancelled) return;
      g.dragging = true; g.position = g.start; g.candidate = g.start;
      motion.current++; finger.stopAnimation(); finger.setValue(g.start);
      setCandidate(g.start); setManual(true); liftTo(1);
      tap(live.current.haptics);
    }
    function settle(target: number, commit: boolean) {
      clearHold();
      const token = ++motion.current;
      const g = gesture.current;
      g.active = false;
      if (!g.dragging) { finger.stopAnimation(); finger.setValue(live.current.index); }
      setManual(true); setCandidate(target); liftTo(0);
      if (commit && target !== live.current.index) {
        if (!g.dragging || target !== g.candidate) tap(live.current.haptics);
        live.current.onSelect(target);
      }
      const finish = () => { if (motion.current === token) setManual(false); };
      if (live.current.reduceMotion) { finger.setValue(target); requestAnimationFrame(finish); }
      else Animated.spring(finger, { toValue: target, stiffness: 410, damping: 30, mass: .65, useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => { if (finished) finish(); });
    }
    return { clearHold, activate, settle };
  }, [finger, lift]);

  useEffect(() => { setPan(PanResponder.create({
    onStartShouldSetPanResponderCapture: () => live.current.width > 14,
    onPanResponderGrant: (_event, state) => {
      actions.clearHold();
      const original = live.current.index;
      const start = dockTabAt(state.x0 - originX.current, live.current.width);
      gesture.current = { active: true, dragging: false, cancelled: false, start, original, position: original, candidate: original };
      hold.current = setTimeout(actions.activate, 160);
    },
    onPanResponderMove: (_event, state) => {
      const g = gesture.current;
      if (!g.active || g.cancelled) return;
      if (state.numberActiveTouches > 1 || Math.abs(state.dy) > 64) {
        g.cancelled = true; actions.settle(g.original, false); return;
      }
      if (!g.dragging && Math.abs(state.dx) > 4) actions.activate();
      if (!g.dragging) return;
      // Values update without rerendering pages. Only crossing a tab changes labels.
      g.position = dockDragPosition(g.start, state.dx, live.current.width);
      finger.setValue(g.position);
      const next = dockCandidate(g.position, g.candidate);
      if (next !== g.candidate) { g.candidate = next; setCandidate(next); tap(live.current.haptics); }
    },
    onPanResponderStart: (_event, state) => {
      if (state.numberActiveTouches > 1) { gesture.current.cancelled = true; actions.settle(gesture.current.original, false); }
    },
    onPanResponderRelease: (_event, state) => {
      const g = gesture.current;
      ignoreClickUntil.current = Date.now() + 350;
      if (!g.active || g.cancelled) return;
      const cancelled = Math.abs(state.dy) > 64;
      actions.settle(cancelled ? g.original : g.dragging ? g.candidate : g.start, !cancelled);
    },
    onPanResponderTerminationRequest: () => true,
    onPanResponderTerminate: () => {
      ignoreClickUntil.current = Date.now() + 350;
      actions.settle(gesture.current.original, false);
    },
  })); }, [actions, finger]);

  useEffect(() => () => { actions.clearHold(); motion.current++; finger.stopAnimation(); lift.stopAnimation(); }, [actions, finger, lift]);
  const selected = manual ? candidate : index;
  const web = Platform.OS === 'web' && !reduce ? { backdropFilter: 'blur(30px) saturate(145%)', WebkitBackdropFilter: 'blur(30px) saturate(145%)', touchAction: 'none', userSelect: 'none' } as ViewStyle : {};
  const surface: ViewStyle = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 35 };
  const lensSurface: ViewStyle = { ...surface, borderRadius: 29 };
  return <View pointerEvents="box-none" style={{ position: 'absolute', bottom: Math.max(insets.bottom, Platform.OS === 'web' ? 20 : 10), left: 22, right: 22, alignItems: 'center' }}>
    <View ref={dock} testID="liquid-dock" {...pan?.panHandlers} onLayout={event => {
      setWidth(event.nativeEvent.layout.width);
      dock.current?.measureInWindow(x => { originX.current = x; });
    }} style={[{
      flexDirection: 'row', width: '100%', maxWidth: 400, padding: 6, minHeight: 70, borderRadius: 35, borderCurve: 'continuous',
      backgroundColor: reduce ? t.sheet : liquid ? 'transparent' : t.dock,
      borderWidth: 1, borderColor: t.border, overflow: 'hidden',
      boxShadow: t.dark ? '0px 10px 30px rgba(0,0,0,0.24)' : '0px 10px 30px rgba(42,77,52,0.13)',
    }, web]}>
      {liquid ? <GlassView pointerEvents="none" isInteractive glassEffectStyle="clear" tintColor={t.glassTint} colorScheme={t.dark ? 'dark' : 'light'} style={surface} />
        : Platform.OS === 'ios' && !reduce ? <BlurView pointerEvents="none" tint={t.dark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'} intensity={65} style={surface} /> : null}
      {cell > 0 ? <Animated.View pointerEvents="none" testID="liquid-dock-lens" style={{
        position: 'absolute', left: 7, top: 6, bottom: 6, width: cell, borderRadius: 29, borderCurve: 'continuous',
        backgroundColor: reduce ? t.selected : t.lens, borderWidth: 1, borderColor: t.lensRim,
        boxShadow: t.dark ? '0px 3px 12px rgba(0,0,0,0.15)' : '0px 3px 12px rgba(42,77,52,0.09)',
        transform: [{ translateX: translation }, { scaleX: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.055] }) }, { scaleY: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] }) }],
      }}>
        {liquid ? <GlassView glassEffectStyle="clear" tintColor={t.glassTint} colorScheme={t.dark ? 'dark' : 'light'} style={lensSurface} /> : null}
        {!reduce ? <LinearGradient pointerEvents="none" colors={t.dark ? ['rgba(240,255,235,0.16)', 'rgba(240,255,235,0.015)', 'rgba(240,255,235,0.08)'] : ['rgba(255,255,255,0.58)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0.22)']} locations={[0, .52, 1]} style={[lensSurface, { overflow: 'hidden' }]} /> : null}
      </Animated.View> : null}
      {tabs.map((tab, tabIndex) => <Pressable key={tab.path} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityHint="也可按住底栏拖动切换" accessibilityState={{ selected: index === tabIndex }} aria-selected={index === tabIndex}
        onPress={() => { if (Date.now() >= ignoreClickUntil.current && !gesture.current.active) { gesture.current.dragging = false; actions.settle(tabIndex, true); } }}
        style={{ flex: 1, minHeight: 56, gap: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 29 }}>
        <tab.icon size={20} strokeWidth={selected === tabIndex ? 1.9 : 1.65} color={selected === tabIndex ? t.ink : t.secondary} />
        <Text style={{ fontSize: 10, fontWeight: selected === tabIndex ? '600' : '400', color: selected === tabIndex ? t.ink : t.secondary }}>{tab.label}</Text>
      </Pressable>)}
    </View>
  </View>;
}
