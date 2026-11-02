import React, { Children, useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, View } from 'react-native';
import { LiquidDock } from './liquid-dock';
import { useReduceMotion } from './primitives';
import type { PageRailProps } from './page-rail.types';

/** Browser preview uses the same mounted pages and continuous dock position. */
export function PageRail({ index, onSelect, children }: PageRailProps) {
  const rail = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(0);
  const [offset] = useState(() => new Animated.Value(0));
  const reduceMotion = useReduceMotion();
  const previousWidth = useRef(0);
  const dockTarget = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!width) return;
    rail.current?.scrollTo({ x: index * width, animated: dockTarget.current !== index && previousWidth.current === width && !reduceMotion });
    dockTarget.current = undefined;
    previousWidth.current = width;
  }, [index, width, reduceMotion]);
  const progress = offset.interpolate({ inputRange: [0, Math.max(width, 1) * 2], outputRange: [0, 2], extrapolate: 'clamp' });
  return <View style={{ flex: 1 }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <Animated.ScrollView ref={rail} horizontal pagingEnabled directionalLockEnabled showsHorizontalScrollIndicator={false}
      style={{ flex: 1 }} scrollEventThrottle={16}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: offset } } }], { useNativeDriver: false })}
      onMomentumScrollEnd={event => { if (width) onSelect(Math.round(event.nativeEvent.contentOffset.x / width)); }}>
      {width ? Children.map(children, (child, page) => <View key={page} style={{ width, height: '100%' }}>{child}</View>) : null}
    </Animated.ScrollView>
    <LiquidDock index={index} progress={progress} onSelect={next => {
      dockTarget.current = next;
      rail.current?.scrollTo({ x: next * width, animated: false });
      onSelect(next);
    }} />
  </View>;
}
