import React from 'react';
import { Text, View } from 'react-native';
import { Button } from './primitives';
import type { SiteLoginProps } from './site-login.types';
import { useTheme } from './theme';

export function SiteLogin({ onClose }: SiteLoginProps) {
  const t = useTheme();
  return <View style={{ gap: 14 }}><Text style={{ color: t.secondary, fontSize: 12, lineHeight: 21 }}>本站需要网页验证。请在安装的 iPhone 应用内完成验证登录。</Text><Button title="返回" secondary onPress={onClose} /></View>;
}
