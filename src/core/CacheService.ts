import { CacheService, StorageService, LoggerService } from '../types';

interface CacheEntry {
  data: any;
  timestamp: number;
  type: string;
  size: number;
}

export class DefaultCacheService implements CacheService {
  private readonly CACHE_KEY = 'KAFKA_CACHE';
  private readonly CACHE_SIZE_KEY = 'KAFKA_CACHE_SIZE';
  private readonly MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB max cache size
  private readonly CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days TTL

  private cache: Record<string, CacheEntry> = {};
  private cacheSize = 0;
  private isInitialized = false;

  constructor(
    private readonly storage: StorageService,
    private readonly logger: LoggerService
  ) {}

  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.loadCacheFromStorage();
      await this.cleanExpiredEntries();
      this.isInitialized = true;
      this.logger.log(`Cache initialized with ${Object.keys(this.cache).length} entries`);
    } catch (error) {
      this.logger.error('Failed to initialize cache', error);
      // Initialize with empty cache if loading fails
      this.cache = {};
      this.cacheSize = 0;
      this.isInitialized = true;
    }
  }

  async getCache(): Promise<Record<string, any>> {
    await this.ensureInitialized();
    // Return only the data portion, not the metadata
    const result: Record<string, any> = {};
    for (const [key, entry] of Object.entries(this.cache)) {
      result[key] = entry.data;
    }
    return result;
  }

  async getCacheSize(): Promise<number> {
    await this.ensureInitialized();
    return Object.keys(this.cache).length;
  }

  async storeInCache(type: string, value: any, cacheValue: any): Promise<void> {
    await this.ensureInitialized();

    const key = this.generateCacheKey(type, value);
    const serialized = JSON.stringify(cacheValue);
    const size = new Blob([serialized]).size;

    // Check if adding this entry would exceed max cache size
    if (this.cacheSize + size > this.MAX_CACHE_SIZE) {
      await this.evictOldestEntries(size);
    }

    const entry: CacheEntry = {
      data: cacheValue,
      timestamp: Date.now(),
      type,
      size,
    };

    // Remove old entry size if it exists
    if (this.cache[key]) {
      this.cacheSize -= this.cache[key].size;
    }

    this.cache[key] = entry;
    this.cacheSize += size;

    await this.persistCache();
    this.logger.log(`Cached entry: ${key} (${size} bytes)`);
  }

  async removeFromCache(key: string): Promise<void> {
    await this.ensureInitialized();
    
    if (this.cache[key]) {
      this.cacheSize -= this.cache[key].size;
      delete this.cache[key];
      await this.persistCache();
      this.logger.log(`Removed cache entry: ${key}`);
    }
  }

  async removeFromCacheMultiple(keys: string[]): Promise<void> {
    await this.ensureInitialized();
    
    let removedCount = 0;
    for (const key of keys) {
      if (this.cache[key]) {
        this.cacheSize -= this.cache[key].size;
        delete this.cache[key];
        removedCount++;
      }
    }

    if (removedCount > 0) {
      await this.persistCache();
      this.logger.log(`Removed ${removedCount} cache entries`);
    }
  }

  async setCache(cache: Record<string, any>): Promise<void> {
    await this.ensureInitialized();
    
    this.cache = {};
    this.cacheSize = 0;

    for (const [key, value] of Object.entries(cache)) {
      const serialized = JSON.stringify(value);
      const size = new Blob([serialized]).size;
      
      this.cache[key] = {
        data: value,
        timestamp: Date.now(),
        type: 'imported',
        size,
      };
      this.cacheSize += size;
    }

    await this.persistCache();
    this.logger.log(`Cache reset with ${Object.keys(cache).length} entries`);
  }

  async clearCache(): Promise<void> {
    this.cache = {};
    this.cacheSize = 0;
    await this.storage.set(this.CACHE_KEY, null);
    await this.storage.set(this.CACHE_SIZE_KEY, 0);
    this.logger.log('Cache cleared');
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }
  }

  private generateCacheKey(type: string, value: any): string {
    const timestamp = value.time || value.timestamp || Date.now();
    const identifier = value.id || value.key || Math.random().toString(36).substr(2, 9);
    return `${type}_${timestamp}_${identifier}`;
  }

  private async loadCacheFromStorage(): Promise<void> {
    const cachedData = await this.storage.get<Record<string, CacheEntry>>(this.CACHE_KEY);
    const cachedSize = await this.storage.get<number>(this.CACHE_SIZE_KEY);

    if (cachedData) {
      this.cache = cachedData;
      this.cacheSize = cachedSize || this.calculateCacheSize();
    } else {
      this.cache = {};
      this.cacheSize = 0;
    }
  }

  private async persistCache(): Promise<void> {
    try {
      await this.storage.set(this.CACHE_KEY, this.cache);
      await this.storage.set(this.CACHE_SIZE_KEY, this.cacheSize);
    } catch (error) {
      this.logger.error('Failed to persist cache', error);
      throw error;
    }
  }

  private calculateCacheSize(): number {
    let size = 0;
    for (const entry of Object.values(this.cache)) {
      size += entry.size || 0;
    }
    return size;
  }

  private async cleanExpiredEntries(): Promise<void> {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of Object.entries(this.cache)) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        expiredKeys.push(key);
      }
    }

    if (expiredKeys.length > 0) {
      await this.removeFromCacheMultiple(expiredKeys);
      this.logger.log(`Cleaned ${expiredKeys.length} expired cache entries`);
    }
  }

  private async evictOldestEntries(requiredSpace: number): Promise<void> {
    const entries = Object.entries(this.cache)
      .map(([key, entry]) => ({ key, ...entry }))
      .sort((a, b) => a.timestamp - b.timestamp);

    let freedSpace = 0;
    const keysToRemove: string[] = [];

    for (const entry of entries) {
      keysToRemove.push(entry.key);
      freedSpace += entry.size;
      
      if (freedSpace >= requiredSpace) {
        break;
      }
    }

    await this.removeFromCacheMultiple(keysToRemove);
    this.logger.log(`Evicted ${keysToRemove.length} entries to free ${freedSpace} bytes`);
  }

  // Utility methods for cache management
  async getCacheStats(): Promise<{
    entryCount: number;
    totalSize: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  }> {
    await this.ensureInitialized();
    
    const timestamps = Object.values(this.cache).map(entry => entry.timestamp);
    
    return {
      entryCount: Object.keys(this.cache).length,
      totalSize: this.cacheSize,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : null,
    };
  }

  async getCacheByType(type: string): Promise<Record<string, any>> {
    await this.ensureInitialized();
    
    const result: Record<string, any> = {};
    for (const [key, entry] of Object.entries(this.cache)) {
      if (entry.type === type) {
        result[key] = entry.data;
      }
    }
    return result;
  }
}

export const cacheServiceFactory = (deps: {
  storage: StorageService;
  logger: LoggerService;
}) => new DefaultCacheService(deps.storage, deps.logger);
