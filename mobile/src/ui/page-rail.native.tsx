import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import { LiquidDock } from './liquid-dock';
import { useReduceMotion } from './primitives';
import type { PageRailProps } from './page-rail.types';

const AnimatedPager = Animated.createAnimatedComponent(PagerView);

export function PageRail({ index, onSelect, children }: PageRailProps) {
  const pager = useRef<PagerView>(null);
  const selected = useRef(index);
  const [initialPage] = useState(index);
  const reduceMotion = useReduceMotion();
  const [position] = useState(() => new Animated.Value(index));
  const [offset] = useState(() => new Animated.Value(0));
  const progress = useMemo(() => Animated.add(position, offset).interpolate({ inputRange: [0, 2], outputRange: [0, 2], extrapolate: 'clamp' }), [position, offset]);
  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { position, offset } }], { useNativeDriver: true }), [position, offset]);
  useEffect(() => {
    if (selected.current === index) return;
    // Run after native children have been attached to the page controller.
    const frame = requestAnimationFrame(() => {
      if (reduceMotion) pager.current?.setPageWithoutAnimation(index);
      else pager.current?.setPage(index);
    });
    return () => cancelAnimationFrame(frame);
  }, [index, reduceMotion]);
  return <View style={{ flex: 1 }}>
    <AnimatedPager ref={pager} style={{ flex: 1 }} initialPage={initialPage} overdrag={false} keyboardDismissMode="on-drag"
      onPageScroll={onScroll}
      onPageSelected={event => { selected.current = event.nativeEvent.position; onSelect(event.nativeEvent.position); }}>
      {children}
    </AnimatedPager>
    <LiquidDock index={index} progress={progress} onSelect={next => {
      selected.current = next;
      pager.current?.setPageWithoutAnimation(next);
      onSelect(next);
    }} />
  </View>;
}
