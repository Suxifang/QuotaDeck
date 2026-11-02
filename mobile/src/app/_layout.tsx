import React from 'react';
import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useQuota } from '../state/useQuota';
import { QuotaContext } from '../state/context';
import { selectedTheme, ThemeContext } from '../ui/theme';
import { SwipeTabs } from '../ui/swipe-tabs';
import { UpdateProvider } from '../updates/context';

export default function Layout() {
  const controller = useQuota();
  const theme = selectedTheme(controller.data.preferences, useColorScheme());
  return <SafeAreaProvider><QuotaContext.Provider value={controller}><ThemeContext.Provider value={theme}><UpdateProvider>
    <StatusBar style={theme.dark ? 'light' : 'dark'} /><SwipeTabs />
  </UpdateProvider></ThemeContext.Provider></QuotaContext.Provider></SafeAreaProvider>;
}
