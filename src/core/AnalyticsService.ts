import { AnalyticsService, LoggerService, RemoteConfigService } from '../types';

// ---------------------------------------------------------------------------
// Shared deps
// ---------------------------------------------------------------------------

export interface AnalyticsServiceDeps {
  logger: LoggerService;
  remoteConfig: RemoteConfigService;
}

// ---------------------------------------------------------------------------
// DefaultAnalyticsService — platform-agnostic base (no Firebase)
// ---------------------------------------------------------------------------

/**
 * Base `AnalyticsService` with event queuing, user properties, and predefined
 * RADAR analytics events. Has **no** Firebase dependency — subclasses (e.g.
 * `FirebaseAnalyticsService`) override `initProvider()` to wire a real backend.
 */
export class DefaultAnalyticsService implements AnalyticsService {
  protected isInitialized = false;
  protected userId: string | null = null;
  protected userProperties: Record<string, any> = {};
  protected eventQueue: Array<{ name: string; parameters: Record<string, any>; timestamp: number }> = [];

  protected readonly logger: LoggerService;
  protected readonly remoteConfig: RemoteConfigService;

  constructor(deps: AnalyticsServiceDeps) {
    this.logger = deps.logger;
    this.remoteConfig = deps.remoteConfig;
  }

  async init(): Promise<void> {
    try {
      await this.initProvider();
      this.isInitialized = true;
      this.logger.log('Analytics service initialized');
      await this.flushQueuedEvents();
    } catch (error) {
      this.logger.error('Failed to initialize analytics', error);
      throw error;
    }
  }

  /**
   * Hook for subclasses to initialise a platform-specific analytics backend.
   * The base implementation is a no-op (events are logged to console only).
   */
  protected async initProvider(): Promise<void> {
    // no-op — subclasses override
  }

  /**
   * Hook for subclasses to send an event to their analytics backend.
   * Called only when analytics is enabled and initialized.
   */
  protected async sendEvent(_eventName: string, _parameters: Record<string, any>): Promise<void> {
    // no-op — subclasses override
  }

  /** Hook for subclasses to push user properties to their backend. */
  protected async syncUserProperties(_properties: Record<string, any>): Promise<void> {
    // no-op — subclasses override
  }

  /** Hook for subclasses to push the user ID to their backend. */
  protected async syncUserId(_userId: string): Promise<void> {
    // no-op — subclasses override
  }

  async logEvent(eventName: string, parameters: Record<string, any> = {}): Promise<void> {
    const event = {
      name: eventName,
      parameters: {
        ...parameters,
        timestamp: Date.now(),
        userId: this.userId,
        ...this.userProperties,
      },
      timestamp: Date.now(),
    };

    if (!this.isInitialized) {
      this.eventQueue.push(event);
      return;
    }

    try {
      const config = await this.remoteConfig.forceFetch();
      const analyticsEnabled = config.getOrDefault('ANALYTICS_ENABLED', 'true') === 'true';
      if (!analyticsEnabled) {
        this.logger.log('Analytics disabled via remote config');
        return;
      }

      await this.sendEvent(eventName, event.parameters);
    } catch (error) {
      this.logger.error(`Failed to log analytics event: ${eventName}`, error);
    }
  }

  async setUserProperties(properties: Record<string, any>): Promise<void> {
    try {
      this.userProperties = { ...this.userProperties, ...properties };
      if (this.isInitialized) {
        await this.syncUserProperties(this.userProperties);
      }
    } catch (error) {
      this.logger.error('Failed to set user properties', error);
    }
  }

  async setUserId(userId: string): Promise<void> {
    try {
      this.userId = userId;
      if (this.isInitialized) {
        await this.syncUserId(userId);
      }
    } catch (error) {
      this.logger.error('Failed to set user ID', error);
    }
  }

  async logScreen(screenName: string, screenClass?: string): Promise<void> {
    await this.logEvent('screen_view', {
      screen_name: screenName,
      screen_class: screenClass || screenName,
    });
  }

  protected async flushQueuedEvents(): Promise<void> {
    if (this.eventQueue.length === 0) return;
    const eventsToFlush = [...this.eventQueue];
    this.eventQueue = [];
    for (const event of eventsToFlush) {
      await this.logEvent(event.name, event.parameters);
    }
  }

  // Predefined analytics events based on RADAR usage

  async logTaskStarted(taskId: string, taskType: string): Promise<void> {
    await this.logEvent('task_started', { task_id: taskId, task_type: taskType });
  }

  async logTaskCompleted(taskId: string, taskType: string, duration: number): Promise<void> {
    await this.logEvent('task_completed', { task_id: taskId, task_type: taskType, duration_ms: duration });
  }

  async logTaskSkipped(taskId: string, taskType: string, reason?: string): Promise<void> {
    await this.logEvent('task_skipped', { task_id: taskId, task_type: taskType, reason: reason || 'user_action' });
  }

  async logDataSent(dataType: string, recordCount: number, success: boolean): Promise<void> {
    await this.logEvent('data_sent', { data_type: dataType, record_count: recordCount, success });
  }

  async logConfigChange(configKey: string, oldValue: any, newValue: any): Promise<void> {
    await this.logEvent('config_change', { config_key: configKey, old_value: String(oldValue), new_value: String(newValue) });
  }

  async logError(errorType: string, errorMessage: string, errorContext?: Record<string, any>): Promise<void> {
    await this.logEvent('app_error', { error_type: errorType, error_message: errorMessage, ...errorContext });
  }

  async logAuthenticationEvent(eventType: 'login' | 'logout' | 'token_refresh', success: boolean): Promise<void> {
    await this.logEvent('authentication', { event_type: eventType, success });
  }
}

// ---------------------------------------------------------------------------
// FirebaseAnalyticsService — Firebase Analytics backend
// ---------------------------------------------------------------------------

let RNAnalyticsModule: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  RNAnalyticsModule = require('@react-native-firebase/analytics');
} catch {
  RNAnalyticsModule = null;
}

function getAnalytics(): any | null {
  const mod = RNAnalyticsModule?.default || RNAnalyticsModule;
  if (typeof mod === 'function') {
    try { return mod(); } catch { return null; }
  }
  return null;
}

/**
 * Firebase Analytics implementation. Extends `DefaultAnalyticsService` with:
 *  - `setAnalyticsCollectionEnabled(true)` on init
 *  - `logEvent`, `setUserProperties`, `setUserId` forwarded to Firebase
 *
 * Falls back gracefully when the Firebase analytics module isn't installed.
 */
export class FirebaseAnalyticsService extends DefaultAnalyticsService {
  protected override async initProvider(): Promise<void> {
    const analytics = getAnalytics();
    if (!analytics) {
      this.logger.log('Firebase analytics module not available — analytics disabled');
      return;
    }
    await analytics.setAnalyticsCollectionEnabled(true);
    this.logger.log('Firebase Analytics initialized');
  }

  protected override async sendEvent(eventName: string, parameters: Record<string, any>): Promise<void> {
    const analytics = getAnalytics();
    if (analytics) {
      await analytics.logEvent(eventName, parameters);
    }
  }

  protected override async syncUserProperties(properties: Record<string, any>): Promise<void> {
    const analytics = getAnalytics();
    if (analytics) {
      await analytics.setUserProperties(properties);
    }
  }

  protected override async syncUserId(userId: string): Promise<void> {
    const analytics = getAnalytics();
    if (analytics) {
      await analytics.setUserId(userId);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the best available `AnalyticsService`:
 *  - `FirebaseAnalyticsService` when `@react-native-firebase/analytics` is loadable
 *  - `DefaultAnalyticsService` otherwise (event queuing only, no backend)
 */
export const analyticsServiceFactory = (deps: AnalyticsServiceDeps): AnalyticsService =>
  RNAnalyticsModule
    ? new FirebaseAnalyticsService(deps)
    : new DefaultAnalyticsService(deps);
