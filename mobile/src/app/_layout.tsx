import React from 'react';
import { useColorScheme, View } from 'react-native';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useQuota } from '../state/useQuota';
import { QuotaContext } from '../state/context';
import { selectedTheme, ThemeContext } from '../ui/theme';
import { LiquidDock } from '../ui/liquid-dock';
import { UpdateProvider } from '../updates/context';

export default function Layout() {
  const controller = useQuota();
  const theme = selectedTheme(controller.data.preferences, useColorScheme());
  return <SafeAreaProvider><QuotaContext.Provider value={controller}><ThemeContext.Provider value={theme}><UpdateProvider>
    <StatusBar style={theme.dark ? 'light' : 'dark'} /><View style={{ flex: 1 }}><Slot /><LiquidDock /></View>
  </UpdateProvider></ThemeContext.Provider></QuotaContext.Provider></SafeAreaProvider>;
}
