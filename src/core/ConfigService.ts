import {
  ConfigService,
  KafkaService,
  AnalyticsService,
  CacheService,
  TokenService,
  RemoteConfigService,
  StorageService,
  LoggerService,
  DataService
} from '../types';
// Note: Avoid direct RN Firebase imports for web compatibility. Use injected RemoteConfigService instead.

export class DefaultConfigService implements ConfigService {
  private isInitialized = false;
  
  constructor(
    private readonly kafka: KafkaService,
    private readonly analytics: AnalyticsService,
    private readonly cache: CacheService,
    private readonly token: TokenService,
    private readonly remoteConfig: RemoteConfigService,
    private readonly storage: StorageService,
    private readonly logger: LoggerService,
    private readonly dataService: DataService
  ) {}

  async init(): Promise<any> {
    if (this.isInitialized) {
      return Promise.resolve();
    }

    try {
      this.logger.log('Initializing Config Service...');
      
      // Initialize services in dependency order
      // Ensure remote config is ready via injected service (safe on web)
      try {
        await this.remoteConfig.forceFetch();
      } catch {}
      
      try {
        await this.analytics.init();
      } catch (e) {
        this.logger.log('Analytics init failed; continuing without analytics');
      }
      await this.cache.init();
      await this.kafka.init();
      
      this.isInitialized = true;
      
      this.logger.log('Config Service initialized successfully');
      this.sendConfigChangeEvent('CONFIG_INITIALIZED', null, true, null, { timestamp: Date.now() });
      
      return Promise.resolve();
    } catch (error) {
      this.logger.error('Failed to initialize Config Service', error);
      this.sendConfigChangeEvent('CONFIG_INIT_FAILED', null, false, error, { timestamp: Date.now() });
      throw error;
    }
  }

  async getAll(): Promise<Record<string, any>> {
    await this.ensureInitialized();
    
    try {
      const config = await this.remoteConfig.forceFetch();
      
      // Merge with local defaults and stored configuration
      const defaults = await this.getDefaultConfig();
      const stored = await this.getStoredConfig();
      
      const allConfig = {
        ...defaults,
        ...stored,
        // Remote config takes precedence
        remoteConfig: this.extractRemoteConfigValues(config),
      };
      
      return allConfig;
    } catch (error) {
      this.logger.error('Failed to get all configuration', error);
      
      // Fallback to stored configuration
      return this.getStoredConfig();
    }
  }

  async get(key: string): Promise<any> {
    await this.ensureInitialized();
    
    try {
      const config = await this.remoteConfig.forceFetch();
      const value = config.getOrDefault(key, '');
      
      if (value !== null) {
        return value;
      }
      
      // Fallback to stored value
      return this.storage.get(key);
    } catch (error) {
      this.logger.error(`Failed to get configuration value for key: ${key}`, error);
      return this.storage.get(key);
    }
  }

  async set(key: string, value: any): Promise<void> {
    await this.ensureInitialized();
    
    try {
      const previous = await this.storage.get(key);
      await this.storage.set(key, value);
      
      this.sendConfigChangeEvent('CONFIG_VALUE_CHANGED', previous, value, null, { key });
      this.logger.log(`Configuration value set: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to set configuration value for key: ${key}`, error);
      this.sendConfigChangeEvent('CONFIG_VALUE_SET_FAILED', null, value, error, { key });
      throw error;
    }
  }

  async sendCachedData(): Promise<{ successKeys: string[]; failedKeys: string[] }> {
    await this.ensureInitialized();
    
    try {
      this.logger.log('Starting to send cached data...');
      this.sendConfigChangeEvent('CACHE_SEND_STARTED', null, null, null, { timestamp: Date.now() });
      
      const result = await this.kafka.sendAllFromCache();
      
      this.analytics.logDataSent('cached_data', result.successKeys.length, result.failedKeys.length === 0);
      this.sendConfigChangeEvent('CACHE_SEND_COMPLETED', null, null, null, { 
        successCount: result.successKeys.length,
        failedCount: result.failedKeys.length 
      });
      
      this.logger.log(`Cached data sent - Success: ${result.successKeys.length}, Failed: ${result.failedKeys.length}`);
      
      return result;
    } catch (error: any) {
      this.logger.error('Failed to send cached data', error);
      this.analytics.logError('cache_send_error', (error as any)?.message || String(error));
      this.sendConfigChangeEvent('CACHE_SEND_FAILED', null, null, error, { timestamp: Date.now() });
      throw error;
    }
  }

  getKafkaService(): KafkaService {
    return this.kafka;
  }

  sendConfigChangeEvent(type: string, previous?: any, current?: any, error?: any, data?: any): void {
    try {
      const event = {
        type,
        previous: previous !== undefined ? String(previous) : null,
        current: current !== undefined ? String(current) : null,
        error: error ? String(error) : null,
        data: data || null,
        timestamp: Date.now(),
      };

      // Log the config change event
      this.analytics.logConfigChange(type, previous, current);
      
      // Store the event for debugging purposes
      this.storeConfigEvent(event);
      
      this.logger.log(`Config change event: ${type}`, event);
    } catch (err: any) {
      this.logger.error('Failed to send config change event', err);
    }
  }

  // Additional configuration management methods
  async resetToDefaults(): Promise<void> {
    await this.ensureInitialized();
    
    try {
      this.logger.log('Resetting configuration to defaults...');
      
      const defaults = await this.getDefaultConfig();
      await this.dataService.clear();
      
      for (const [key, value] of Object.entries(defaults)) {
        await this.storage.set(key, value);
      }
      
      // Also clear cache if requested
      await this.cache.clearCache();
      
      this.sendConfigChangeEvent('CONFIG_RESET_TO_DEFAULTS', null, defaults, null, { timestamp: Date.now() });
      this.analytics.logEvent('config_reset', { reason: 'user_action' });
      
      this.logger.log('Configuration reset to defaults successfully');
    } catch (error) {
      this.logger.error('Failed to reset configuration to defaults', error);
      this.sendConfigChangeEvent('CONFIG_RESET_FAILED', null, null, error, { timestamp: Date.now() });
      throw error;
    }
  }

  async getCacheStats(): Promise<any> {
    await this.ensureInitialized();
    
    if ('getCacheStats' in this.cache) {
      return (this.cache as any).getCacheStats();
    }
    
    return {
      entryCount: await this.cache.getCacheSize(),
      totalSize: 0,
      oldestEntry: null,
      newestEntry: null,
    };
  }

  async validateConfiguration(): Promise<{ isValid: boolean; errors: string[] }> {
    await this.ensureInitialized();
    
    const errors: string[] = [];
    
    try {
      // Check if required services are available
      if (!this.kafka) errors.push('Kafka service not available');
      if (!this.analytics) errors.push('Analytics service not available');
      if (!this.cache) errors.push('Cache service not available');
      
      // Check if Kafka is properly configured
      const kafkaTopics = await this.kafka.getTopics();
      if (kafkaTopics.length === 0) {
        errors.push('No Kafka topics configured');
      }
      
      // Check remote config accessibility
      try {
        await this.remoteConfig.forceFetch();
      } catch (e) {
        errors.push('Remote configuration not accessible');
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    } catch (error: any) {
      errors.push(`Configuration validation failed: ${error?.message || String(error)}`);
      return {
        isValid: false,
        errors
      };
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }
  }

  private async getDefaultConfig(): Promise<Record<string, any>> {
    return {
      // Analytics settings
      ANALYTICS_ENABLED: 'true',
      
      // Cache settings
      AUTO_SEND_CACHED_DATA: 'false',
      CACHE_TTL_DAYS: '7',
      MAX_CACHE_SIZE_MB: '50',
      
      // Kafka settings
      KAFKA_BATCH_SIZE: '10',
      KAFKA_RETRY_COUNT: '3',
      
      // Notification settings
      SEND_ERROR_NOTIFICATION: 'false',
      NOTIFICATION_RETRY_INTERVAL: '300000', // 5 minutes
      
      // App settings
      LOG_LEVEL: 'INFO',
      DEBUG_MODE: 'false',
    };
  }

  private async getStoredConfig(): Promise<Record<string, any>> {
    try {
      const config: Record<string, any> = {};
      const defaults = await this.getDefaultConfig();
      
      for (const key of Object.keys(defaults)) {
        const value = await this.storage.get(key);
        if (value !== null) {
          config[key] = value;
        }
      }
      
      return config;
    } catch (error) {
      this.logger.error('Failed to get stored configuration', error);
      return {};
    }
  }

  private extractRemoteConfigValues(config: any): Record<string, any> {
    // This would extract all available remote config values
    // For now, we'll return the config object as-is
    return {
      lastFetched: Date.now(),
      source: 'remote',
    };
  }

  private async storeConfigEvent(event: any): Promise<void> {
    try {
      const events = await this.storage.get<any[]>('CONFIG_EVENTS') || [];
      
      // Keep only last 100 events
      events.push(event);
      if (events.length > 100) {
        events.splice(0, events.length - 100);
      }
      
      await this.storage.set('CONFIG_EVENTS', events);
    } catch (error) {
      // Don't throw - this is just for debugging
      this.logger.error('Failed to store config event', error);
    }
  }
}

export const configServiceFactory = (deps: {
  kafka: KafkaService;
  analytics: AnalyticsService;
  cache: CacheService;
  token: TokenService;
  remoteConfig: RemoteConfigService;
  storage: StorageService;
  logger: LoggerService;
  dataService: DataService;
}) => new DefaultConfigService(
  deps.kafka,
  deps.analytics,
  deps.cache,
  deps.token,
  deps.remoteConfig,
  deps.storage,
  deps.logger,
  deps.dataService
);
