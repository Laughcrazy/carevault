import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Supabase session storage.
 *
 * The session token is a bearer credential for a medical record, so it lives in
 * the iOS Keychain / Android Keystore, never in AsyncStorage. SecureStore caps
 * values at ~2KB, so long JWTs are chunked.
 */
const CHUNK = 1800;

async function setChunked(key: string, value: string) {
  const chunks = Math.ceil(value.length / CHUNK);
  await SecureStore.setItemAsync(`${key}__n`, String(chunks));
  for (let i = 0; i < chunks; i++) {
    await SecureStore.setItemAsync(`${key}__${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
  }
}

async function getChunked(key: string): Promise<string | null> {
  const n = await SecureStore.getItemAsync(`${key}__n`);
  if (!n) return null;
  let out = '';
  for (let i = 0; i < Number(n); i++) {
    const part = await SecureStore.getItemAsync(`${key}__${i}`);
    if (part == null) return null;
    out += part;
  }
  return out;
}

async function removeChunked(key: string) {
  const n = await SecureStore.getItemAsync(`${key}__n`);
  if (n) for (let i = 0; i < Number(n); i++) await SecureStore.deleteItemAsync(`${key}__${i}`);
  await SecureStore.deleteItemAsync(`${key}__n`);
}

const web = Platform.OS === 'web';

export const secureStorage = {
  getItem: (key: string) =>
    web ? Promise.resolve(globalThis.localStorage?.getItem(key) ?? null) : getChunked(key),
  setItem: (key: string, value: string) =>
    web ? Promise.resolve(globalThis.localStorage?.setItem(key, value)) : setChunked(key, value),
  removeItem: (key: string) =>
    web ? Promise.resolve(globalThis.localStorage?.removeItem(key)) : removeChunked(key),
};
