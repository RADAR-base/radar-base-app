import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ObservableLike, StorageService } from '@radarbase/app-kit';

/**
 * Bridge between AsyncStorage and the library's `StorageService` contract.
 *
 * The library's services (`TokenService`, `CacheService`, etc.) are storage-agnostic — they
 * receive whatever `StorageService` you provide via `CoreServicesProvider`'s `overrides`. The
 * default in the library is a no-op (in-memory) implementation, so tokens won't survive a
 * cold app restart. This adapter persists them via AsyncStorage.
 *
 * Values are JSON-serialized; primitive strings round-trip unchanged because JSON treats them
 * as quoted strings and falls back gracefully when the stored value isn't valid JSON.
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

    // The library's StorageService contract requires an `observe` method for reactivity.
    // AsyncStorage has no native change-notification API; consumers needing reactive storage
    // should swap this adapter for a wrapper around `react-native-mmkv` or a custom emitter.
    observe<T = unknown>(_key: string): ObservableLike<T> {
      return {
        subscribe: () => ({ unsubscribe: () => undefined }),
      };
    },
  };
}
