import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from './theme';

export function Ambient() {
  const t = useTheme();
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
    <Svg width="100%" height="100%" viewBox="0 0 1000 1800" preserveAspectRatio="none">
      <Defs>{t.ambient.map((color, index) => <RadialGradient key={index} id={`ambient-${index}`}>
        <Stop offset="0" stopColor={color} stopOpacity={.95} />
        <Stop offset="0.48" stopColor={color} stopOpacity={.52} />
        <Stop offset="1" stopColor={color} stopOpacity={0} />
      </RadialGradient>)}</Defs>
      <Ellipse cx="150" cy="180" rx="1050" ry="1100" fill="url(#ambient-0)" />
      <Ellipse cx="1060" cy="1170" rx="950" ry="1100" fill="url(#ambient-1)" />
      <Ellipse cx="-180" cy="1700" rx="1000" ry="900" fill="url(#ambient-2)" />
    </Svg>
  </View>;
}
