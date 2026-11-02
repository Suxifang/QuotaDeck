import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useTabsWithTriggers } from 'expo-router/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { PageRail } from './page-rail';
import { Ambient } from './ambient';
import { useTheme } from './theme';

const triggers = [
  { type: 'internal' as const, name: 'overview', href: '/' as const },
  { type: 'internal' as const, name: 'connections', href: '/connections' as const },
  { type: 'internal' as const, name: 'settings', href: '/settings' as const },
];
const pageNames = ['index', 'connections', 'settings'];

/** Keep route instances mounted so paging preserves forms and scroll positions. */
export function SwipeTabs() {
  const theme = useTheme();
  const { state, descriptors, navigation, NavigationContent } = useTabsWithTriggers({ triggers, backBehavior: 'initialRoute', activityEnabled: false });
  // Router 58 creates tab routes on demand. Preload once before mounting the
  // pager so all three routes keep their real keys, including on deep links.
  useEffect(() => {
    for (const name of pageNames) if (!state.routes.some(route => route.name === name)) navigation.preload(name);
  }, [state.routes, navigation]);
  const routes = pageNames.map(name => state.routes.find(route => route.name === name));
  const index = Math.max(0, pageNames.indexOf(state.routes[state.index]?.name));
  return <NavigationContent><LinearGradient colors={theme.backdrop} style={{ flex: 1 }}><Ambient />{routes.every(route => !!route) ? <PageRail index={index} onSelect={next => {
    if (index !== next && pageNames[next]) navigation.jumpTo(pageNames[next]);
  }}>
    {routes.map((route, page) => <View key={route!.name} collapsable={false}
      aria-hidden={page !== index}
      accessibilityElementsHidden={page !== index} importantForAccessibility={page === index ? 'auto' : 'no-hide-descendants'}
      style={{ width: '100%', height: '100%' }}>{descriptors[route!.key].render()}</View>)}
  </PageRail> : null}</LinearGradient></NavigationContent>;
}
