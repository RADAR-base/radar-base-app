import { 
  KafkaService, 
  CacheService, 
  ApiService, 
  TokenService, 
  LoggerService, 
  RemoteConfigService,
  StorageService,
  ObservableLike
} from '../types';

interface ProgressUpdate {
  progress: number;
  total: number;
  stage: string;
}

// Simple observable implementation
class SimpleObservable<T> implements ObservableLike<T> {
  private handlers: Array<(value: T) => void> = [];

  next(value: T): void {
    this.handlers.forEach(handler => handler(value));
  }

  subscribe(handler: (value: T) => void): { unsubscribe(): void } {
    this.handlers.push(handler);
    return {
      unsubscribe: () => {
        this.handlers = this.handlers.filter(h => h !== handler);
      }
    };
  }
}

export class DefaultKafkaService implements KafkaService {
  private readonly BATCH_SIZE = 10;
  private readonly CONCURRENCY_LIMIT = 3;
  private readonly SEND_ERROR_NOTIFICATION_THRESHOLD = 10;
  private readonly KAFKA_CLIENT_URL_KEY = 'KAFKA_CLIENT_URL';
  private readonly TOPICS_CACHE_KEY = 'KAFKA_TOPICS_CACHE';
  private readonly LAST_UPLOAD_DATE_KEY = 'LAST_UPLOAD_DATE';

  private kafkaClientUrl: string = '';
  private isCacheSending = false;
  private progress = 0;
  private cacheSize = 0;
  private topics: string[] = [];
  
  private progressSubject = new SimpleObservable<number>();
  public eventCallback$ = this.progressSubject;

  constructor(
    private readonly cache: CacheService,
    private readonly api: ApiService,
    private readonly token: TokenService,
    private readonly logger: LoggerService,
    private readonly remoteConfig: RemoteConfigService,
    private readonly storage: StorageService
  ) {}

  async init(): Promise<any> {
    try {
      await this.updateKafkaClientURL();
      await this.fetchTopics();
      await this.cache.init();
      this.logger.log('Kafka service initialized');
      return Promise.resolve();
    } catch (error) {
      this.logger.error('Failed to initialize Kafka service', error);
      throw error;
    }
  }

  async sendAllFromCache(): Promise<{ successKeys: string[]; failedKeys: string[] }> {
    if (this.isCacheSending) {
      this.logger.log('Cache sending already in progress');
      return { successKeys: [], failedKeys: [] };
    }

    this.setCacheSending(true);
    const successKeys: string[] = [];
    const failedKeys: string[] = [];

    try {
      const cachedData = await this.cache.getCache();
      const cacheSize = await this.cache.getCacheSize();
      
      this.progress = 0;
      this.cacheSize = cacheSize;

      if (cacheSize === 0) {
        this.logger.log('No cached data to send');
        return { successKeys: [], failedKeys: [] };
      }

      const headers = await this.getKafkaHeaders();
      const entries = Object.entries(cachedData).filter(([k]) => k);

      // Process entries in batches to avoid overwhelming the system
      for (let i = 0; i < entries.length; i += this.BATCH_SIZE) {
        const batch = entries.slice(i, i + this.BATCH_SIZE);
        
        const batchPromises = batch.map(async ([key, value]) => {
          try {
            const record = await this.convertEntryToRecord(key, value);
            if (record.record.records?.length === 0) {
              successKeys.push(key);
              this.logger.log('Kafka record is empty, skipping sending');
              return;
            }
            
            await this.sendToKafka(record.topic, record.record, headers);
            successKeys.push(key);
          } catch (e) {
            failedKeys.push(key);
            this.logger.error(`Failed to send cached data for key ${key}`, e);
          } finally {
            this.updateProgress(++this.progress, this.cacheSize);
          }
        });

        await Promise.all(batchPromises);
      }

      // Remove successfully sent items from cache
      if (successKeys.length > 0) {
        await this.cache.removeFromCacheMultiple(successKeys);
      }

      this.updateProgress(this.cacheSize, this.cacheSize);
      
      if (failedKeys.length > this.SEND_ERROR_NOTIFICATION_THRESHOLD) {
        await this.sendDataErrorNotification();
      }

      this.setLastUploadDate(new Date());
      return { successKeys, failedKeys };
    } catch (error) {
      this.logger.error('Error in sendAllFromCache:', error);
      throw error;
    } finally {
      this.setCacheSending(false);
    }
  }

  async prepareKafkaObjectAndStore(type: string, value: any): Promise<void> {
    try {
      const kafkaObject = await this.prepareKafkaObject(type, value);
      await this.cache.storeInCache(type, value, kafkaObject);
      this.logger.log(`Stored Kafka object in cache: ${type}`);
    } catch (error) {
      this.logger.error(`Failed to prepare and store Kafka object: ${type}`, error);
      throw error;
    }
  }

  resetProgress(): void {
    this.progress = 0;
    this.progressSubject.next(0);
  }

  isCacheCurrentlySending(): boolean {
    return this.isCacheSending;
  }

  private async updateKafkaClientURL(): Promise<void> {
    try {
      const config = await this.remoteConfig.forceFetch();
      const url = config.getOrDefault('KAFKA_CLIENT_URL', '');
      if (url) {
        this.kafkaClientUrl = url;
        await this.storage.set(this.KAFKA_CLIENT_URL_KEY, url);
        this.api.setBaseUrl(url);
      }
    } catch (error) {
      // Fallback to stored URL if remote config fails
      const storedUrl = await this.storage.get<string>(this.KAFKA_CLIENT_URL_KEY);
      if (storedUrl) {
        this.kafkaClientUrl = storedUrl;
        this.api.setBaseUrl(storedUrl);
      }
      this.logger.error('Failed to update Kafka client URL', error);
    }
  }

  private async fetchTopics(): Promise<void> {
    try {
      const config = await this.remoteConfig.forceFetch();
      const topicsConfig = config.getOrDefault('KAFKA_TOPICS', '');
      
      if (topicsConfig) {
        this.topics = JSON.parse(topicsConfig);
        await this.storage.set(this.TOPICS_CACHE_KEY, this.topics);
      } else {
        // Fallback to cached topics
        const cachedTopics = await this.storage.get<string[]>(this.TOPICS_CACHE_KEY);
        this.topics = cachedTopics || [];
      }
      
      this.logger.log(`Loaded ${this.topics.length} Kafka topics`);
    } catch (error) {
      this.logger.error('Failed to fetch Kafka topics', error);
      this.topics = [];
    }
  }

  private async getKafkaHeaders(): Promise<Record<string, string>> {
    try {
      const tokens = await this.token.refresh();
      return {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/vnd.kafka.avro.v2+json',
        'Accept': 'application/vnd.kafka.v2+json',
      };
    } catch (error) {
      this.logger.error('Failed to get Kafka headers', error);
      return {
        'Content-Type': 'application/vnd.kafka.avro.v2+json',
        'Accept': 'application/vnd.kafka.v2+json',
      };
    }
  }

  private async convertEntryToRecord(key: string, value: any): Promise<{ topic: string; record: any }> {
    // This is a simplified conversion - in a real implementation, this would
    // use schema validation and proper Avro serialization
    const topic = this.determineTopicForEntry(key, value);
    
    const record = {
      records: [{
        key: { id: key },
        value: value,
        headers: {
          'timestamp': Date.now().toString(),
          'source': 'react-native-app',
        }
      }]
    };

    return { topic, record };
  }

  private determineTopicForEntry(key: string, value: any): string {
    // Simple topic determination logic - enhance based on your needs
    if (key.includes('questionnaire') || key.includes('assessment')) {
      return 'questionnaire_responses';
    }
    if (key.includes('health') || key.includes('vitals')) {
      return 'health_data';
    }
    return 'generic_data';
  }

  private async sendToKafka(topic: string, record: any, headers: Record<string, string>): Promise<any> {
    if (!this.kafkaClientUrl) {
      throw new Error('Kafka client URL not configured');
    }

    try {
      const response = await this.api.post(`/topics/${topic}`, record, { headers });
      this.logger.log(`Successfully sent data to Kafka topic: ${topic}`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to send data to Kafka topic: ${topic}`, error);
      throw error;
    }
  }

  private async prepareKafkaObject(type: string, value: any): Promise<any> {
    // This would typically involve schema validation and Avro serialization
    // For now, we'll return a simplified object structure
    return {
      type,
      timestamp: Date.now(),
      data: value,
      metadata: {
        source: 'react-native-app',
        version: '1.0.0',
      }
    };
  }

  private setCacheSending(val: boolean): void {
    this.isCacheSending = val;
  }

  private updateProgress(current: number, total: number): void {
    const progressPercent = total > 0 ? current / total : 0;
    this.progressSubject.next(progressPercent);
  }

  private async setLastUploadDate(date: Date): Promise<void> {
    await this.storage.set(this.LAST_UPLOAD_DATE_KEY, date.toISOString());
  }

  private async sendDataErrorNotification(): Promise<void> {
    try {
      const config = await this.remoteConfig.forceFetch();
      const sendErrorNotification = config.getOrDefault('SEND_ERROR_NOTIFICATION', 'false');
      
      if (sendErrorNotification === 'true') {
        // In a real implementation, this would trigger a notification service
        this.logger.log('Would send error notification due to high failure rate');
      }
    } catch (error) {
      this.logger.error('Failed to check error notification setting', error);
    }
  }

  // Additional utility methods
  async getLastUploadDate(): Promise<Date | null> {
    const dateStr = await this.storage.get<string>(this.LAST_UPLOAD_DATE_KEY);
    return dateStr ? new Date(dateStr) : null;
  }

  async getTopics(): Promise<string[]> {
    return [...this.topics];
  }

  async isTopicValid(topic: string): Promise<boolean> {
    return this.topics.includes(topic);
  }
}

export const kafkaServiceFactory = (deps: {
  cache: CacheService;
  api: ApiService;
  token: TokenService;
  logger: LoggerService;
  remoteConfig: RemoteConfigService;
  storage: StorageService;
}) => new DefaultKafkaService(
  deps.cache,
  deps.api,
  deps.token,
  deps.logger,
  deps.remoteConfig,
  deps.storage
);
