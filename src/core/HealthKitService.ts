/**
 * HealthKit / Health Connect service — requests health-data permissions and queries data.
 *
 * Two implementations ship:
 *
 *   - `DefaultHealthKitService` — a no-op that logs when called. Used when no health
 *     library is installed. The connect-health enrolment step still renders but the
 *     "Connect" button is effectively a skip.
 *
 *   - `RNHealthKitService` — wraps `react-native-health` (iOS HealthKit). The host app
 *     must install `react-native-health` and pass an instance via
 *     `ServiceOverrides.healthKit`.
 *
 * Usage in the host app:
 * ```ts
 * import { RNHealthKitService } from '@radarbase/app-kit';
 *
 * <AppShell
 *   serviceOverrides={{
 *     healthKit: new RNHealthKitService({
 *       permissions: {
 *         read: ['StepCount', 'HeartRate', 'SleepAnalysis'],
 *       },
 *     }),
 *   }}
 * />
 * ```
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
// RNHealthKitService — backed by react-native-health (iOS)
// ---------------------------------------------------------------------------

let healthModule: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  healthModule = require('react-native-health');
} catch {
  healthModule = null;
}

export interface RNHealthKitConfig {
  permissions?: {
    read?: string[];
    write?: string[];
  };
}

/**
 * `react-native-health` implementation (iOS only). Wraps HealthKit permission
 * requests and authorization checks.
 *
 * Falls back to the no-op base when `react-native-health` is not installed.
 */
export class RNHealthKitService extends DefaultHealthKitService {
  private readonly config: RNHealthKitConfig;
  private authorized = false;

  constructor(deps: HealthKitServiceDeps, config?: RNHealthKitConfig) {
    super(deps);
    this.config = config ?? {};
  }

  override async requestPermission(): Promise<boolean> {
    if (!healthModule) {
      this.logger.log('react-native-health not installed — cannot request HealthKit permissions');
      return false;
    }

    const AppleHealthKit = healthModule.default ?? healthModule;
    const read = this.config.permissions?.read ?? [];
    const write = this.config.permissions?.write ?? [];

    const permissions = {
      permissions: {
        read: read.map((p: string) => AppleHealthKit.Constants?.Permissions?.[p] ?? p),
        write: write.map((p: string) => AppleHealthKit.Constants?.Permissions?.[p] ?? p),
      },
    };

    return new Promise<boolean>((resolve) => {
      AppleHealthKit.initHealthKit(permissions, (err: any) => {
        if (err) {
          this.logger.log(`HealthKit permission request failed: ${err}`);
          this.authorized = false;
          resolve(false);
          return;
        }
        this.logger.log('HealthKit permissions granted');
        this.authorized = true;
        resolve(true);
      });
    });
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
  config?: RNHealthKitConfig,
): HealthKitService =>
  healthModule
    ? new RNHealthKitService(deps, config)
    : new DefaultHealthKitService(deps);
