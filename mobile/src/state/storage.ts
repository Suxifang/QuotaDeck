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
const usageKey = (connectionId: string) => `quotadeck.usage-session.${connectionId}`;
const secretWrites = new Map<string, Promise<void>>();
function serializeSecret(id: string, operation: () => Promise<void>) {
  const work = (secretWrites.get(id) ?? Promise.resolve()).catch(() => {}).then(operation);
  secretWrites.set(id, work);
  void work.finally(() => { if (secretWrites.get(id) === work) secretWrites.delete(id); }).catch(() => {});
  return work;
}
export async function writeCredential(connectionId: string, credential: Credential): Promise<void> {
  return putSecret(keyFor(connectionId), credential);
}
export async function readCredential(connectionId: string): Promise<Credential | undefined> {
  return getSecret(keyFor(connectionId));
}
export async function deleteCredential(connectionId: string): Promise<void> {
  await Promise.all([removeSecret(keyFor(connectionId)), deleteUsageCredential(connectionId)]);
}

// A user JWT must never replace the API key used by /v1/usage.
export const readUsageCredential = (id: string) => getSecret(usageKey(id));
export const writeUsageCredential = (id: string, credential: Credential) => putSecret(usageKey(id), credential);
export const deleteUsageCredential = (id: string) => removeSecret(usageKey(id));

function putSecret(id: string, credential: Credential) {
  return serializeSecret(id, async () => {
    if (Platform.OS === 'web') { previewCredentials.set(id, credential); return; }
    await SecureStore.setItemAsync(id, JSON.stringify(credential), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  });
}
async function getSecret(id: string): Promise<Credential | undefined> {
  await secretWrites.get(id);
  if (Platform.OS === 'web') return previewCredentials.get(id);
  const json = await SecureStore.getItemAsync(id);
  return json ? JSON.parse(json) as Credential : undefined;
}
function removeSecret(id: string) {
  return serializeSecret(id, async () => {
    previewCredentials.delete(id);
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(id);
  });
}

export function configurationExport(data: SavedData): string {
  return JSON.stringify({ app: 'Yudu', version: 1, exportedAt: new Date().toISOString(),
    sources: data.sources.map(({ id, connectionId, name, baseUrl, kind, resolvedKind, accountId, pinned, enabled, custom }) => ({ id, connectionId, name, baseUrl, kind, resolvedKind, accountId, pinned, enabled, custom })),
    preferences: data.preferences }, null, 2);
}
