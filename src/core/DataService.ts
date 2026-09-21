import AsyncStorage from '@react-native-async-storage/async-storage';
// import * as Keychain from 'react-native-keychain';
import { DataService } from '../types/index';

class DataServiceImpl implements DataService {
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw == null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as unknown as T;
      }
    } catch {
      return null;
    }
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    if (value === null || value === undefined) {
      await AsyncStorage.removeItem(key);
      return;
    }
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await AsyncStorage.setItem(key, serialized);
  }

  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  }

  async clear(): Promise<void> {
    await AsyncStorage.clear();
  }

  async getSecure<T = any>(key: string): Promise<T | null> {
    try {
      // TODO: Replace with Keychain.getInternetCredentials(key)
      return this.get<T>(`secure_${key}`);
    } catch {
      return null;
    }
  }

  async setSecure<T = any>(key: string, value: T): Promise<void> {
    // TODO: Replace with Keychain.setInternetCredentials(key, key, JSON.stringify(value))
    await this.set(`secure_${key}`, value);
  }
}

export const dataService = new DataServiceImpl();
