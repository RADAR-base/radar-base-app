import { AnalyticsService, LoggerService, RemoteConfigService } from '../types';

// Replace static import with dynamic require + fallback for web/demo environments
let RNAnalyticsModule: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  RNAnalyticsModule = require('@react-native-firebase/analytics');
} catch {
  RNAnalyticsModule = null;
}
const RNAnalytics: any = RNAnalyticsModule?.default || RNAnalyticsModule || (() => ({
  setAnalyticsCollectionEnabled: async (_enabled: boolean) => { },
  logEvent: async (_name: string, _params: Record<string, any>) => { },
  setUserProperties: async (_props: Record<string, any>) => { },
  setUserId: async (_id: string) => { },
}));

export class DefaultAnalyticsService implements AnalyticsService {
  private isInitialized = false;
  private userId: string | null = null;
  private userProperties: Record<string, any> = {};
  private eventQueue: Array<{ name: string; parameters: Record<string, any>; timestamp: number }> = [];

  constructor(
    private readonly logger: LoggerService,
    private readonly remoteConfig: RemoteConfigService
  ) { }

  async init(): Promise<void> {
    try {
      // Initialize Firebase Analytics (auto-initialized by RN Firebase)
      await RNAnalytics().setAnalyticsCollectionEnabled(true);
      this.isInitialized = true;
      this.logger.log('Analytics service initialized (Firebase)');

      // Flush any queued events
      await this.flushQueuedEvents();
    } catch (error) {
      this.logger.error('Failed to initialize analytics', error);
      throw error;
    }
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
      // Queue the event for later if not initialized
      this.eventQueue.push(event);
      return;
    }

    try {
      // Check if analytics is enabled via remote config
      const config = await this.remoteConfig.forceFetch();
      const analyticsEnabled = config.getOrDefault('ANALYTICS_ENABLED', 'true') === 'true';
      if (!analyticsEnabled) {
        this.logger.log('Analytics disabled via remote config');
        return;
      }

      await RNAnalytics().logEvent(eventName as any, event.parameters);
    } catch (error) {
      this.logger.error(`Failed to log analytics event: ${eventName}`, error);
      // Don't throw - analytics failures shouldn't break the app
    }
  }

  async setUserProperties(properties: Record<string, any>): Promise<void> {
    try {
      this.userProperties = { ...this.userProperties, ...properties };

      if (this.isInitialized) {
        await RNAnalytics().setUserProperties(this.userProperties);
      }
    } catch (error) {
      this.logger.error('Failed to set user properties', error);
      // Don't throw - analytics failures shouldn't break the app
    }
  }

  async setUserId(userId: string): Promise<void> {
    try {
      this.userId = userId;

      if (this.isInitialized) {
        await RNAnalytics().setUserId(userId);
      }
    } catch (error) {
      this.logger.error('Failed to set user ID', error);
      // Don't throw - analytics failures shouldn't break the app
    }
  }

  async logScreen(screenName: string, screenClass?: string): Promise<void> {
    await this.logEvent('screen_view', {
      screen_name: screenName,
      screen_class: screenClass || screenName,
    });
  }

  private async flushQueuedEvents(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const eventsToFlush = [...this.eventQueue];
    this.eventQueue = [];

    for (const event of eventsToFlush) {
      await this.logEvent(event.name, event.parameters);
    }
  }

  // Predefined analytics events based on RADAR usage
  async logTaskStarted(taskId: string, taskType: string): Promise<void> {
    await this.logEvent('task_started', {
      task_id: taskId,
      task_type: taskType,
    });
  }

  async logTaskCompleted(taskId: string, taskType: string, duration: number): Promise<void> {
    await this.logEvent('task_completed', {
      task_id: taskId,
      task_type: taskType,
      duration_ms: duration,
    });
  }

  async logTaskSkipped(taskId: string, taskType: string, reason?: string): Promise<void> {
    await this.logEvent('task_skipped', {
      task_id: taskId,
      task_type: taskType,
      reason: reason || 'user_action',
    });
  }

  async logDataSent(dataType: string, recordCount: number, success: boolean): Promise<void> {
    await this.logEvent('data_sent', {
      data_type: dataType,
      record_count: recordCount,
      success,
    });
  }

  async logConfigChange(configKey: string, oldValue: any, newValue: any): Promise<void> {
    await this.logEvent('config_change', {
      config_key: configKey,
      old_value: String(oldValue),
      new_value: String(newValue),
    });
  }

  async logError(errorType: string, errorMessage: string, errorContext?: Record<string, any>): Promise<void> {
    await this.logEvent('app_error', {
      error_type: errorType,
      error_message: errorMessage,
      ...errorContext,
    });
  }

  async logAuthenticationEvent(eventType: 'login' | 'logout' | 'token_refresh', success: boolean): Promise<void> {
    await this.logEvent('authentication', {
      event_type: eventType,
      success,
    });
  }
}

export const analyticsServiceFactory = (deps: {
  logger: LoggerService;
  remoteConfig: RemoteConfigService;
}) => new DefaultAnalyticsService(deps.logger, deps.remoteConfig);
