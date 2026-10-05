/**
 * HealthKit / Health Connect service — requests health-data permissions and queries data.
 *
 * Two implementations ship:
 *
 *   - `DefaultHealthKitService` — a no-op that logs when called. Used when no health
 *     library is installed. The connect-health enrolment step still renders but the
 *     "Connect" button is effectively a skip.
 *
 *   - `KingstinctHealthKitService` — wraps `@kingstinct/react-native-healthkit` (iOS).
 *     Modern, TypeScript-first, New Architecture compatible, with an Expo config plugin.
 *     Auto-selected by the factory when the module is installed.
 *
 * Usage in the host app (auto-detected):
 * ```
 * npx expo install @kingstinct/react-native-healthkit
 * ```
 * Then add to app.json plugins:
 * ```json
 * ["@kingstinct/react-native-healthkit"]
 * ```
 * The factory picks it up automatically — no serviceOverrides needed.
 */
import type { HealthKitService, LoggerService } from '../types';

// ---------------------------------------------------------------------------
// Shared deps
// ---------------------------------------------------------------------------

export interface HealthKitServiceDeps {
  logger: LoggerService;
}

// ---------------------------------------------------------------------------
// DefaultHealthKitService — no-op
// ---------------------------------------------------------------------------

export class DefaultHealthKitService implements HealthKitService {
  protected readonly logger: LoggerService;

  constructor(deps: HealthKitServiceDeps) {
    this.logger = deps.logger;
  }

  async requestPermission(): Promise<boolean> {
    this.logger.log('No health library installed — requestPermission() is a no-op');
    return false;
  }

  async isAuthorized(): Promise<boolean> {
    return false;
  }
}

// ---------------------------------------------------------------------------
// KingstinctHealthKitService — backed by @kingstinct/react-native-healthkit
// ---------------------------------------------------------------------------

let healthModule: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  healthModule = require('@kingstinct/react-native-healthkit');
} catch {
  healthModule = null;
}

/** Default read types requested when no config is provided. */
const DEFAULT_READ_PERMISSIONS = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierHeartRate',
  'HKCategoryTypeIdentifierSleepAnalysis',
];

export interface HealthKitConfig {
  /** HealthKit data types to request read access for.
   *  Defaults to step count, heart rate, and sleep analysis. */
  read?: string[];
  /** HealthKit data types to request write access for. */
  write?: string[];
}

/**
 * `@kingstinct/react-native-healthkit` implementation (iOS only). Wraps HealthKit
 * permission requests and authorization checks.
 *
 * Falls back to the no-op base when the module is not installed.
 */
export class KingstinctHealthKitService extends DefaultHealthKitService {
  private readonly config: HealthKitConfig;
  private authorized = false;

  constructor(deps: HealthKitServiceDeps, config?: HealthKitConfig) {
    super(deps);
    this.config = config ?? {};
  }

  override async requestPermission(): Promise<boolean> {
    if (!healthModule) {
      this.logger.log('@kingstinct/react-native-healthkit not installed — cannot request permissions');
      return false;
    }

    const read = this.config.read ?? DEFAULT_READ_PERMISSIONS;
    const write = this.config.write ?? [];

    this.logger.log(`[HealthKit] Requesting permissions — read: [${read.join(', ')}], write: [${write.join(', ')}]`);

    try {
      // The module exports both a default object and named exports.
      const requestAuth = healthModule.requestAuthorization
        ?? healthModule.default?.requestAuthorization;

      if (typeof requestAuth !== 'function') {
        this.logger.log('[HealthKit] requestAuthorization not found on module — available keys: '
          + Object.keys(healthModule).join(', '));
        return false;
      }

      const isAvailable = healthModule.isHealthDataAvailable
        ?? healthModule.default?.isHealthDataAvailable;

      if (typeof isAvailable === 'function') {
        const available = await isAvailable();
        if (!available) {
          this.logger.log('[HealthKit] HealthKit is not available on this device (simulator?)');
          return false;
        }
      }

      await requestAuth(read, write);
      this.logger.log('[HealthKit] Permission request completed');
      this.authorized = true;
      return true;
    } catch (err) {
      this.logger.log(`[HealthKit] Permission request failed: ${err}`);
      this.authorized = false;
      return false;
    }
  }

  override async isAuthorized(): Promise<boolean> {
    return this.authorized;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const healthKitServiceFactory = (
  deps: HealthKitServiceDeps,
  config?: HealthKitConfig,
): HealthKitService =>
  healthModule
    ? new KingstinctHealthKitService(deps, config)
    : new DefaultHealthKitService(deps);
