import { createContext, useContext } from 'react';
import type { Preferences } from '../domain/types';

export const radius = { card: 24, control: 14, button: 16, badge: 8, dock: 26, sheet: 30 };

export const light = {
  dark: false, ink: '#18363C', secondary: '#405D62', muted: '#567074', accent: '#256D5E', accentSoft: 'rgba(235,252,242,0.64)', accentForeground: '#FFFFFF',
  mint: '#286D5B', mintSoft: 'rgba(229,249,233,0.64)', amber: '#815618', amberSoft: 'rgba(255,245,217,0.84)', red: '#AA3D40',
  panel: 'rgba(246,255,250,0.40)', panelSubtle: 'rgba(246,255,250,0.18)', border: 'rgba(255,255,255,0.64)', line: 'rgba(38,79,83,0.13)',
  input: 'rgba(239,250,244,0.64)', backdrop: ['#D5E5E5', '#CDDACD', '#C7CFAE'] as readonly [string, string, string],
  ambient: ['#AFCFDf', '#9CAA75', '#D7E7E3'] as readonly [string, string, string],
  track: 'rgba(45,105,85,0.16)', meter: ['#256D5E', '#578D6B'] as readonly [string, string],
  meterLow: ['#AF7B32', '#C69B59'] as readonly [string, string],
  shadow: '#284B3F', sheet: '#E8F0E8', dock: 'rgba(242,252,239,0.36)',
  selected: 'rgba(255,255,255,0.58)', control: 'rgba(246,255,250,0.32)',
  glassTint: '#EAF9EE18', lens: 'rgba(255,255,255,0.24)', lensRim: 'rgba(255,255,255,0.86)',
};
export const dark: typeof light = {
  dark: true, ink: '#F0F5F1', secondary: '#C3D3CC', muted: '#A6BDB3', accent: '#B8DAC1', accentSoft: 'rgba(196,225,199,0.14)', accentForeground: '#193C30',
  mint: '#BEDBC5', mintSoft: 'rgba(163,213,173,0.14)', amber: '#F1CF94', amberSoft: 'rgba(110,86,40,0.50)', red: '#FFA8A4',
  panel: 'rgba(231,248,236,0.055)', panelSubtle: 'rgba(231,248,236,0.025)', border: 'rgba(237,255,240,0.17)', line: 'rgba(233,246,237,0.14)',
  input: 'rgba(15,35,27,0.48)', backdrop: ['#34484D', '#304139', '#293B29'],
  ambient: ['#52777A', '#536B3D', '#344B3B'],
  track: 'rgba(229,242,224,0.16)', meter: ['#A3C9AC', '#CBDCC0'], meterLow: ['#CDA362', '#E8C796'],
  shadow: '#000000', sheet: '#23382E', dock: 'rgba(20,40,29,0.48)',
  selected: 'rgba(226,242,223,0.16)', control: 'rgba(231,248,236,0.07)',
  glassTint: '#B8D7B610', lens: 'rgba(228,249,223,0.10)', lensRim: 'rgba(235,255,230,0.38)',
};
export type Theme = typeof light;
export const ThemeContext = createContext<Theme>(light);
export const useTheme = () => useContext(ThemeContext);
export function selectedTheme(preferences: Preferences, system: string | null | undefined): Theme {
  return preferences.theme === 'dark' || (preferences.theme === 'system' && system === 'dark') ? dark : light;
}
