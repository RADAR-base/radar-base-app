import { RemoteConfig, RemoteConfigService, LoggerService } from '../types';

// ---------------------------------------------------------------------------
// Shared deps
// ---------------------------------------------------------------------------

export interface RemoteConfigServiceDeps {
  logger: LoggerService;
}

// ---------------------------------------------------------------------------
// DefaultRemoteConfigService — returns defaults, no remote backend
// ---------------------------------------------------------------------------

/**
 * Base `RemoteConfigService` that always returns the supplied default values.
 * Subclasses (e.g. `FirebaseRemoteConfigService`) override `fetchConfig()` to
 * pull real values from a remote backend.
 */
export class DefaultRemoteConfigService implements RemoteConfigService {
  protected readonly logger: LoggerService;

  constructor(deps: RemoteConfigServiceDeps) {
    this.logger = deps.logger;
  }

  async forceFetch(): Promise<RemoteConfig> {
    return this.fetchConfig();
  }

  /**
   * Hook for subclasses to fetch config from a remote source.
   * Base implementation returns a config that always yields the default value.
   */
  protected async fetchConfig(): Promise<RemoteConfig> {
    return {
      getOrDefault: (_key: string, defaultValue: string) => defaultValue,
    };
  }
}

// ---------------------------------------------------------------------------
// FirebaseRemoteConfigService — backed by RN Firebase remote-config
// ---------------------------------------------------------------------------

let remoteConfigModule: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  remoteConfigModule = require('@react-native-firebase/remote-config');
} catch {
  remoteConfigModule = null;
}

function getRemoteConfig(): any | null {
  const mod = remoteConfigModule?.default || remoteConfigModule;
  if (typeof mod === 'function') {
    try { return mod(); } catch { return null; }
  }
  return null;
}

/**
 * Firebase Remote Config implementation. Extends `DefaultRemoteConfigService` with:
 *  - `fetchAndActivate()` on each `forceFetch()`
 *  - `getValue(key).asString()` to resolve config values
 *
 * Falls back gracefully to defaults when Firebase remote-config isn't installed.
 */
export class FirebaseRemoteConfigService extends DefaultRemoteConfigService {
  protected override async fetchConfig(): Promise<RemoteConfig> {
    const rc = getRemoteConfig();
    if (!rc) {
      this.logger.log('Firebase remote-config module not available — using defaults');
      return super.fetchConfig();
    }

    try {
      await rc.fetchAndActivate();
    } catch {
      this.logger.log('Firebase remote-config fetchAndActivate failed — using cached/defaults');
    }

    return {
      getOrDefault: (key: string, defaultValue: string) => {
        try {
          const val = rc.getValue(key);
          const str = val.asString();
          return str !== '' ? str : defaultValue;
        } catch {
          return defaultValue;
        }
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the best available `RemoteConfigService`:
 *  - `FirebaseRemoteConfigService` when `@react-native-firebase/remote-config` is loadable
 *  - `DefaultRemoteConfigService` otherwise (always returns defaults)
 */
export const remoteConfigServiceFactory = (deps: RemoteConfigServiceDeps): RemoteConfigService =>
  remoteConfigModule
    ? new FirebaseRemoteConfigService(deps)
    : new DefaultRemoteConfigService(deps);
