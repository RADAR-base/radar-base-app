import type { LoggerService, StorageService } from '../types';

const LAST_SYNCED_KEY = '@radarbase/last_synced_at';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncResult {
  /** True when every registered step succeeded. */
  success: boolean;
  /** True when at least one step succeeded and at least one failed. */
  partial: boolean;
  /** Timestamp of this sync attempt's completion. */
  lastSyncedAt: Date;
  /** Names of steps that threw. Empty when `success` is true. */
  failures: string[];
}

export interface SyncService {
  /** Register a named sync step. Later registrations with the same name replace earlier ones. */
  register(name: string, step: () => Promise<void>): void;
  /** Remove a previously registered step (e.g. on sign-out teardown). */
  unregister(name: string): void;
  /** Run all registered steps in parallel. Returns a summary of what succeeded/failed. */
  sync(): Promise<SyncResult>;
  /** Last successful (full or partial) sync time, restored from storage on boot. */
  getLastSyncedAt(): Date | null;
  /** The same, once the saved value has been read back; `getLastSyncedAt` can be too early. */
  loadLastSyncedAt(): Promise<Date | null>;
  /** Record that the app has just refreshed from the server outside a manual sync. */
  markSynced(at?: Date): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DefaultSyncService implements SyncService {
  private steps = new Map<string, () => Promise<void>>();
  private lastSyncedAt: Date | null = null;
  private restored: Promise<void>;

  constructor(
    private readonly storage: StorageService,
    private readonly logger: LoggerService,
  ) {
    // Restore the persisted timestamp. A sync that finishes first keeps its newer time.
    this.restored = this.storage.get<string>(LAST_SYNCED_KEY).then((iso) => {
      if (iso && !this.lastSyncedAt) this.lastSyncedAt = new Date(iso);
    }).catch(() => {});
  }

  register(name: string, step: () => Promise<void>): void {
    this.steps.set(name, step);
  }

  unregister(name: string): void {
    this.steps.delete(name);
  }

  async sync(): Promise<SyncResult> {
    const entries = Array.from(this.steps.entries());
    if (entries.length === 0) {
      const now = new Date();
      return { success: true, partial: false, lastSyncedAt: now, failures: [] };
    }

    const settled = await Promise.all(
      entries.map(([name, step]) =>
        step()
          .then(() => true as const)
          .catch((err) => {
            this.logger.log(`[SyncService] step "${name}" failed: ${err}`);
            return false as const;
          }),
      ),
    );

    const failures: string[] = [];
    settled.forEach((ok, i) => {
      if (!ok) failures.push(entries[i][0]);
    });

    const now = new Date();
    const success = failures.length === 0;
    const partial = !success && failures.length < entries.length;

    // Persist timestamp on full or partial success.
    if (success || partial) {
      this.lastSyncedAt = now;
      this.storage.set(LAST_SYNCED_KEY, now.toISOString()).catch(() => {});
    }

    return { success, partial, lastSyncedAt: this.lastSyncedAt ?? now, failures };
  }

  getLastSyncedAt(): Date | null {
    return this.lastSyncedAt;
  }

  markSynced(at: Date = new Date()): void {
    this.lastSyncedAt = at;
    this.storage.set(LAST_SYNCED_KEY, at.toISOString()).catch(() => {});
  }

  async loadLastSyncedAt(): Promise<Date | null> {
    await this.restored;
    return this.lastSyncedAt;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface SyncServiceDeps {
  storage: StorageService;
  logger: LoggerService;
}

export const syncServiceFactory = (deps: SyncServiceDeps): SyncService =>
  new DefaultSyncService(deps.storage, deps.logger);
