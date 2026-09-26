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
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DefaultSyncService implements SyncService {
  private steps = new Map<string, () => Promise<void>>();
  private lastSyncedAt: Date | null = null;

  constructor(
    private readonly storage: StorageService,
    private readonly logger: LoggerService,
  ) {
    // Restore persisted timestamp on construction (fire-and-forget).
    this.storage.get<string>(LAST_SYNCED_KEY).then((iso) => {
      if (iso) this.lastSyncedAt = new Date(iso);
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

    const results = await Promise.allSettled(
      entries.map(([name, step]) =>
        step().catch((err) => {
          this.logger.log(`[SyncService] step "${name}" failed: ${err}`);
          throw err;
        }),
      ),
    );

    const failures: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') failures.push(entries[i][0]);
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
