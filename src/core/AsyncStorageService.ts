import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StorageService, ObservableLike } from '../types';

/**
 * AsyncStorage-backed implementation of `StorageService`.
 *
 * Values are JSON-serialized; primitive strings round-trip unchanged.
 * Pass this to `CoreServicesProvider` via `overrides.storage` so that
 * tokens, cache, and schedule data persist across app restarts.
 */
export function createAsyncStorageService(): StorageService {
  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      const raw = await AsyncStorage.getItem(key);
      if (raw == null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as unknown as T;
      }
    },

    async set<T = unknown>(key: string, value: T): Promise<void> {
      if (value === null || value === undefined) {
        await AsyncStorage.removeItem(key);
        return;
      }
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await AsyncStorage.setItem(key, serialized);
    },

    async remove(key: string): Promise<void> {
      await AsyncStorage.removeItem(key);
    },

    observe<T = unknown>(_key: string): ObservableLike<T> {
      return {
        subscribe: () => ({ unsubscribe: () => {} }),
      };
    },
  };
}
