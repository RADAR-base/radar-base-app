import { CacheService, StorageService, LoggerService } from '../types';

/** Lightweight manifest entry — stored as an array, no payload data. */
interface ManifestEntry {
  key: string;
  type: string;
  timestamp: number;
}

const MANIFEST_KEY = '@cache:manifest';
const ENTRY_PREFIX = '@cache:entry:';

export class DefaultCacheService implements CacheService {
  private manifest: ManifestEntry[] = [];
  private data = new Map<string, any>();
  private initialized = false;

  constructor(
    private readonly storage: StorageService,
    private readonly logger: LoggerService,
  ) {}

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const saved = await this.storage.get<ManifestEntry[]>(MANIFEST_KEY);
      if (saved && saved.length) {
        // Load each entry from its own storage key
        for (const meta of saved) {
          const value = await this.storage.get(`${ENTRY_PREFIX}${meta.key}`);
          if (value !== null) {
            this.manifest.push(meta);
            this.data.set(meta.key, value);

          }
        }
      }
      this.initialized = true;
      this.logger.log(`Cache initialized with ${this.manifest.length} entries`);
    } catch (error) {
      this.manifest = [];
      this.data.clear();
      this.initialized = true;
      this.logger.error('Failed to initialize cache', error);
    }
  }

  async store(key: string, data: any): Promise<void> {
    await this.ensureInit();

    // Remove existing entry if key already exists (dedup overwrite)
    const existing = this.manifest.findIndex(m => m.key === key);
    if (existing !== -1) {
      this.manifest.splice(existing, 1);
    }

    this.manifest.push({ key, type: key.split(':')[0] || '', timestamp: Date.now() });
    this.data.set(key, data);

    // Per-entry write: 1 small entry + 1 small manifest (no payload in manifest)
    await this.storage.set(`${ENTRY_PREFIX}${key}`, data);
    await this.persistManifest();
  }

  async get(key: string): Promise<any | null> {
    await this.ensureInit();
    return this.data.get(key) ?? null;
  }

  async getAll(): Promise<Record<string, any>> {
    await this.ensureInit();
    const result: Record<string, any> = {};
    for (const [key, value] of this.data) {
      result[key] = value;
    }
    return result;
  }

  keys(): string[] {
    return this.manifest.map(m => m.key);
  }

  size(): number {
    return this.manifest.length;
  }

  async remove(key: string): Promise<void> {
    await this.ensureInit();
    const idx = this.manifest.findIndex(m => m.key === key);
    if (idx === -1) return;

    this.manifest.splice(idx, 1);
    this.data.delete(key);

    await this.storage.remove(`${ENTRY_PREFIX}${key}`);
    await this.persistManifest();
  }

  async removeMultiple(keys: string[]): Promise<void> {
    await this.ensureInit();
    const keySet = new Set(keys);
    const toRemove = this.manifest.filter(m => keySet.has(m.key));
    if (!toRemove.length) return;

    for (const entry of toRemove) {
      this.data.delete(entry.key);
      await this.storage.remove(`${ENTRY_PREFIX}${entry.key}`);
    }

    this.manifest = this.manifest.filter(m => !keySet.has(m.key));
    await this.persistManifest();
  }

  async clear(): Promise<void> {
    for (const meta of this.manifest) {
      await this.storage.remove(`${ENTRY_PREFIX}${meta.key}`);
    }
    this.manifest = [];
    this.data.clear();
    await this.storage.remove(MANIFEST_KEY);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async ensureInit(): Promise<void> {
    if (!this.initialized) await this.init();
  }

  private async persistManifest(): Promise<void> {
    await this.storage.set(MANIFEST_KEY, this.manifest);
  }

}

export const cacheServiceFactory = (deps: {
  storage: StorageService;
  logger: LoggerService;
}) => new DefaultCacheService(deps.storage, deps.logger);
