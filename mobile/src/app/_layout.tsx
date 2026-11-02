import React from 'react';
import { useColorScheme } from 'react-native';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useQuota } from '../state/useQuota';
import { QuotaContext } from '../state/context';
import { selectedTheme, ThemeContext } from '../ui/theme';

export default function Layout() {
  const controller = useQuota();
  const theme = selectedTheme(controller.data.preferences, useColorScheme());
  return <SafeAreaProvider><QuotaContext.Provider value={controller}><ThemeContext.Provider value={theme}>
    <StatusBar style={theme.dark ? 'light' : 'dark'} /><Slot />
  </ThemeContext.Provider></QuotaContext.Provider></SafeAreaProvider>;
}
