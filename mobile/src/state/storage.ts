import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Credential, SavedData } from '../domain/types';
import { DEFAULT_PREFERENCES } from '../domain/types';

const CONFIG_KEY = 'quotadeck.config.v1';
const previewCredentials = new Map<string, Credential>();
export const EMPTY_DATA: SavedData = { version: 1, sources: [], states: {}, history: {}, preferences: DEFAULT_PREFERENCES };

export async function readData(): Promise<SavedData> {
  const text = await AsyncStorage.getItem(CONFIG_KEY);
  if (!text) return { ...EMPTY_DATA, preferences: { ...DEFAULT_PREFERENCES } };
  const data = JSON.parse(text) as SavedData;
  if (data.version !== 1 || !Array.isArray(data.sources)) throw new Error('无法读取本机配置');
  const states = Object.fromEntries(Object.entries(data.states ?? {}).map(([id, state]) => [id, { ...state, refreshing: false }]));
  return { ...data, states, history: data.history ?? {}, preferences: { ...DEFAULT_PREFERENCES, ...data.preferences } };
}

let pendingSave = Promise.resolve();
export function saveData(data: SavedData): Promise<void> {
  // A serialized queue prevents an older asynchronous write from replacing newer preferences.
  const serializable = { ...data, states: Object.fromEntries(Object.entries(data.states).map(([id, state]) => [id, { ...state, refreshing: false }])) };
  pendingSave = pendingSave.catch(() => {}).then(() => AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(serializable)));
  return pendingSave;
}

const keyFor = (connectionId: string) => `quotadeck.credential.${connectionId}`;
export async function writeCredential(connectionId: string, credential: Credential): Promise<void> {
  if (Platform.OS === 'web') { previewCredentials.set(connectionId, credential); return; }
  await SecureStore.setItemAsync(keyFor(connectionId), JSON.stringify(credential), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
export async function readCredential(connectionId: string): Promise<Credential | undefined> {
  if (Platform.OS === 'web') return previewCredentials.get(connectionId);
  const json = await SecureStore.getItemAsync(keyFor(connectionId));
  return json ? JSON.parse(json) as Credential : undefined;
}
export async function deleteCredential(connectionId: string): Promise<void> {
  previewCredentials.delete(connectionId);
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(keyFor(connectionId));
}

export function configurationExport(data: SavedData): string {
  return JSON.stringify({ app: 'Yudu', version: 1, exportedAt: new Date().toISOString(),
    sources: data.sources.map(({ id, connectionId, name, baseUrl, kind, resolvedKind, accountId, pinned, enabled, custom }) => ({ id, connectionId, name, baseUrl, kind, resolvedKind, accountId, pinned, enabled, custom })),
    preferences: data.preferences }, null, 2);
}
