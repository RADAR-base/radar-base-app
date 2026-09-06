import {
  KafkaService,
  ApiService,
  TokenService,
  LoggerService,
  RemoteConfigService,
  StorageService,
} from '../types';
import { BASE_URI_KEY } from './ConfigService';

const TOPICS_CACHE_KEY = 'KAFKA_TOPICS_CACHE';
const KAFKA_PATH = '/kafka';
const SCHEMA_PATH = '/schema/subjects';

/**
 * KafkaService — pure sender + schema registry client.
 *
 * The base URL is derived from `ConfigService.setBaseUrl()` which is set during enrolment.
 * All RADAR-base platform services live under the same base:
 *   - Kafka REST proxy:  {baseUrl}/kafka/topics/{topic}
 *   - Schema registry:   {baseUrl}/schema/subjects/{topic}-value/versions/latest
 */
export class DefaultKafkaService implements KafkaService {
  private baseUrl = '';
  private topics: string[] = [];
  private readonly schemaCache = new Map<string, { id: number; version: number; schema: string }>();

  constructor(
    private readonly api: ApiService,
    private readonly token: TokenService,
    private readonly logger: LoggerService,
    private readonly remoteConfig: RemoteConfigService,
    private readonly storage: StorageService,
  ) {}

  async init(): Promise<void> {
    await this.resolveBaseURL();
    await this.fetchTopics();
    this.logger.log('Kafka service initialized');
  }

  async send(topic: string, record: any): Promise<any> {
    await this.ensureBaseUrl();

    const headers = await this.getHeaders();
    const url = `${this.baseUrl}${KAFKA_PATH}/topics/${topic}`;
    const response = await this.api.post(url, record, { headers });
    this.logger.log(`Sent to Kafka topic: ${topic}`);
    return response;
  }

  async getSchema(topic: string, schemaType: 'key' | 'value' = 'value'): Promise<{ id: number; version: number; schema: string }> {
    const subject = `${topic}-${schemaType}`;
    const cached = this.schemaCache.get(subject);
    if (cached) return cached;

    await this.ensureBaseUrl();

    const url = `${this.baseUrl}${SCHEMA_PATH}/${subject}/versions/latest`;
    const headers = await this.getSchemaHeaders();
    const response = await this.api.get<{ id: number; version: number; schema: string }>(url, { headers });

    this.schemaCache.set(subject, response);
    this.logger.log(`Fetched schema for ${subject} (id=${response.id})`);
    return response;
  }

  async getTopics(): Promise<string[]> {
    return [...this.topics];
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /** Re-resolve from storage if still empty (auth may have completed after init). */
  private async ensureBaseUrl(): Promise<void> {
    if (!this.baseUrl) {
      await this.resolveBaseURL();
    }
    if (!this.baseUrl) {
      throw new Error('Base URL not configured — is the user enrolled?');
    }
  }

  private async resolveBaseURL(): Promise<void> {
    try {
      const uri = await this.storage.get<string>(BASE_URI_KEY);
      if (uri) {
        this.baseUrl = uri;
      }
    } catch {
      this.logger.log('Base URL not available — user may not be enrolled yet');
    }
  }

  private async fetchTopics(): Promise<void> {
    try {
      const config = await this.remoteConfig.forceFetch();
      const topicsConfig = config.getOrDefault('KAFKA_TOPICS', '');

      if (topicsConfig) {
        this.topics = JSON.parse(topicsConfig);
        await this.storage.set(TOPICS_CACHE_KEY, this.topics);
      } else {
        const cached = await this.storage.get<string[]>(TOPICS_CACHE_KEY);
        this.topics = cached || [];
      }

      this.logger.log(`Loaded ${this.topics.length} Kafka topics`);
    } catch {
      this.logger.log('Failed to fetch Kafka topics');
      this.topics = [];
    }
  }

  /** Headers for Kafka REST proxy requests (produce). */
  private async getHeaders(): Promise<Record<string, string>> {
    try {
      const tokens = await this.token.refresh();
      return {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/vnd.kafka.avro.v2+json',
        Accept: 'application/vnd.kafka.v2+json',
      };
    } catch {
      return {
        'Content-Type': 'application/vnd.kafka.avro.v2+json',
        Accept: 'application/vnd.kafka.v2+json',
      };
    }
  }

  /** Headers for schema registry requests. */
  private async getSchemaHeaders(): Promise<Record<string, string>> {
    try {
      const tokens = await this.token.refresh();
      return {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: 'application/vnd.schemaregistry.v1+json, application/json',
      };
    } catch {
      return {
        Accept: 'application/vnd.schemaregistry.v1+json, application/json',
      };
    }
  }
}

export const kafkaServiceFactory = (deps: {
  api: ApiService;
  token: TokenService;
  logger: LoggerService;
  remoteConfig: RemoteConfigService;
  storage: StorageService;
}) =>
  new DefaultKafkaService(
    deps.api,
    deps.token,
    deps.logger,
    deps.remoteConfig,
    deps.storage,
  );
