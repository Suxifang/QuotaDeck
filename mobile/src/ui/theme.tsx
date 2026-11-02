import { createContext, useContext } from 'react';
import type { Preferences } from '../domain/types';

export const radius = { card: 24, control: 14, button: 16, badge: 8, dock: 26, sheet: 30 };

export const light = {
  dark: false, ink: '#142D46', secondary: '#65788C', muted: '#8C9BAD', accent: '#3078EA', accentSoft: '#E9F1FF',
  mint: '#188E79', mintSoft: '#E5F4EE', amber: '#C07C22', amberSoft: '#FFF2DF', red: '#BE4C50',
  panel: 'rgba(255,255,255,0.72)', border: 'rgba(255,255,255,0.94)', line: 'rgba(36,68,99,0.08)',
  input: 'rgba(236,241,248,0.8)', backdrop: ['#EDF3FA', '#F6F8FC', '#EEF5F4'] as readonly [string, string, string],
  shadow: '#284F78', sheet: '#F6F8FC', dock: 'rgba(255,255,255,0.78)',
};
export const dark: typeof light = {
  dark: true, ink: '#E8F1FC', secondary: '#9BAFC4', muted: '#70869E', accent: '#82AEFF', accentSoft: '#223A59',
  mint: '#75D8BC', mintSoft: '#203E3B', amber: '#F0BA6C', amberSoft: '#473A2B', red: '#FA9498',
  panel: 'rgba(26,43,63,0.76)', border: 'rgba(164,194,227,0.12)', line: 'rgba(185,210,238,0.11)',
  input: 'rgba(42,60,81,0.8)', backdrop: ['#0B1829', '#102236', '#122A35'],
  shadow: '#000000', sheet: '#132439', dock: 'rgba(26,44,65,0.88)',
};
export type Theme = typeof light;
export const ThemeContext = createContext<Theme>(light);
export const useTheme = () => useContext(ThemeContext);
export function selectedTheme(preferences: Preferences, system: string | null | undefined): Theme {
  return preferences.theme === 'dark' || (preferences.theme === 'system' && system === 'dark') ? dark : light;
}
