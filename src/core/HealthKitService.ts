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

export interface HealthKitConfig {
  /** HealthKit data types to request read access for (e.g. `HKQuantityTypeIdentifierStepCount`). */
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

    try {
      const mod = healthModule.default ?? healthModule;

      // Check if HealthKit is available on this device
      const isAvailable = mod.isHealthDataAvailable ?? healthModule.isHealthDataAvailable;
      if (typeof isAvailable === 'function') {
        const available = await isAvailable();
        if (!available) {
          this.logger.log('HealthKit is not available on this device');
          return false;
        }
      }

      // Request authorization
      const requestAuth = mod.requestAuthorization ?? healthModule.requestAuthorization;
      if (typeof requestAuth !== 'function') {
        this.logger.log('requestAuthorization not found on healthkit module');
        return false;
      }

      await requestAuth(this.config.read ?? [], this.config.write ?? []);
      this.logger.log('HealthKit permissions requested successfully');
      this.authorized = true;
      return true;
    } catch (err) {
      this.logger.log(`HealthKit permission request failed: ${err}`);
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
