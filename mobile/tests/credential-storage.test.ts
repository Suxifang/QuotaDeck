import { beforeEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ values: new Map<string, string>(), set: vi.fn<(key: string, value: string) => Promise<void>>() }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only', setItemAsync: native.set,
  getItemAsync: async (key: string) => native.values.get(key), deleteItemAsync: async (key: string) => { native.values.delete(key); } }));
import { deleteCredential, readCredential, readUsageCredential, writeCredential, writeUsageCredential } from '../src/state/storage';

beforeEach(() => { native.values.clear(); native.set.mockReset(); native.set.mockImplementation(async (key, value) => { native.values.set(key, value); }); });
describe('independent Keychain slots', () => {
  it('keeps the original quota key intact when saving a user login and removes both on deletion', async () => {
    const primary = { mode: 'key' as const, apiKey: 'test-only-quota' };
    const usage = { mode: 'session' as const, accessToken: 'test-only-jwt', userId: 10, apiKeyId: 23 };
    await writeCredential('site', primary); await writeUsageCredential('site', usage);
    expect(await readCredential('site')).toEqual(primary); expect(await readUsageCredential('site')).toEqual(usage);
    expect(native.values.has('quotadeck.credential.site')).toBe(true);
    await deleteCredential('site');
    expect(await readCredential('site')).toBeUndefined(); expect(await readUsageCredential('site')).toBeUndefined();
  });
  it('serializes removal after an in-flight login write so it cannot revive a removed connection', async () => {
    const begin = Promise.withResolvers<void>(); const gate = Promise.withResolvers<void>();
    native.set.mockImplementationOnce(async (key, value) => { begin.resolve(); await gate.promise; native.values.set(key, value); });
    const save = writeUsageCredential('site', { mode: 'session', accessToken: 'test' });
    await begin.promise; const remove = deleteCredential('site'); gate.resolve(); await Promise.all([save, remove]);
    expect(await readUsageCredential('site')).toBeUndefined();
  });
});
