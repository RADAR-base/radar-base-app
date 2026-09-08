/**
 * DataPipeline — the single entry point for all data producers.
 *
 * Producers call `pipeline.submit(type, payload)` and the pipeline handles:
 *   1. Converting raw data via the appropriate converter
 *   2. Resolving the Kafka topic
 *   3. Generating a dedup cache key (content hash)
 *   4. Caching locally via CacheService (offline-first)
 *   5. Flushing to Kafka via KafkaService (batched, with progress)
 *
 * Endpoints match the RADAR-base platform:
 *   - Kafka REST proxy:  {baseUrl}/topics/{topic}
 *   - Schema registry:   {baseUrl}/schema/subjects/{topic}-value/versions/latest
 */
import { ConverterFactory } from './converters';
import type {
  CacheService,
  KafkaService,
  LoggerService,
  ObservableLike,
  DataPipelineService,
  SubjectConfigService,
} from '../../types';

export type { DataPipelineService } from '../../types';
export { SchemaType } from './types';

// Simple observable for progress events
class ProgressObservable implements ObservableLike<number> {
  private handlers: Array<(value: number) => void> = [];

  next(value: number): void {
    this.handlers.forEach(h => h(value));
  }

  subscribe(handler: (value: number) => void): { unsubscribe(): void } {
    this.handlers.push(handler);
    return {
      unsubscribe: () => {
        this.handlers = this.handlers.filter(h => h !== handler);
      },
    };
  }
}

/**
 * Simple string hash (djb2) for cache key deduplication.
 * Same data always maps to the same key, preventing duplicate entries.
 */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

const BATCH_SIZE = 10;
const LAST_UPLOAD_DATE_KEY = 'LAST_UPLOAD_DATE';
const SOURCE_ID_KEY = '@radarbase/source_id';

export class DefaultDataPipeline implements DataPipelineService {
  private readonly converters = new ConverterFactory();
  private readonly progressSubject = new ProgressObservable();
  public readonly progress$: ObservableLike<number> = this.progressSubject;

  private flushing = false;

  constructor(
    private readonly cache: CacheService,
    private readonly kafka: KafkaService,
    private readonly logger: LoggerService,
    private readonly storage: import('../../types').StorageService,
    private readonly subjectConfig: SubjectConfigService,
  ) {}

  async submit(type: string, payload: any): Promise<void> {
    const converter = this.converters.getConverter(type);
    const kafkaValue = converter.processData(payload);
    const topic = converter.getKafkaTopic(payload, []);
    const key = this.generateKey(type, kafkaValue);

    await this.cache.store(key, { type, topic, data: kafkaValue });
    this.logger.log(`Pipeline: cached ${type} → ${topic}`);
  }

  async submitMultiple(type: string, payloads: any[]): Promise<void> {
    for (const payload of payloads) {
      await this.submit(type, payload);
    }
  }

  async submitAndFlush(
    type: string,
    payload: any,
  ): Promise<{ successKeys: string[]; failedKeys: string[] }> {
    await this.submit(type, payload);
    return this.flush();
  }

  async flush(): Promise<{ successKeys: string[]; failedKeys: string[] }> {
    if (this.flushing) {
      this.logger.log('Flush already in progress');
      return { successKeys: [], failedKeys: [] };
    }

    this.flushing = true;
    this.progressSubject.next(0);
    const successKeys: string[] = [];
    const failedKeys: string[] = [];

    try {
      const entries = await this.cache.getAll();
      const keys = Object.keys(entries);
      const total = keys.length;

      if (total === 0) {
        this.logger.log('Nothing to flush');
        return { successKeys: [], failedKeys: [] };
      }

      // Process in batches
      for (let i = 0; i < keys.length; i += BATCH_SIZE) {
        const batchKeys = keys.slice(i, i + BATCH_SIZE);

        const batchPromises = batchKeys.map(async key => {
          const entry = entries[key];
          try {
            // Fetch key + value schemas for Avro-compatible record format
            const [keySchema, valueSchema] = await Promise.all([
              this.kafka.getSchema(entry.topic, 'key'),
              this.kafka.getSchema(entry.topic, 'value'),
            ]);
            const observationKey = await this.getObservationKey();
            const record = this.buildKafkaRecord(observationKey, entry, keySchema.id, valueSchema.id);
            if (!record.records.length) {
              successKeys.push(key);
              return;
            }
            await this.kafka.send(entry.topic, record);
            successKeys.push(key);
          } catch (e) {
            failedKeys.push(key);
            this.logger.log(`Flush failed for ${key}: ${e}`);
          }
        });

        await Promise.all(batchPromises);
        this.progressSubject.next((i + batchKeys.length) / total);
      }

      // Remove successes from cache
      if (successKeys.length) {
        await this.cache.removeMultiple(successKeys);
      }

      this.progressSubject.next(1);
      await this.storage.set(LAST_UPLOAD_DATE_KEY, new Date().toISOString());
      this.logger.log(
        `Flush complete — sent: ${successKeys.length}, failed: ${failedKeys.length}`,
      );

      return { successKeys, failedKeys };
    } finally {
      this.flushing = false;
    }
  }

  isFlushing(): boolean {
    return this.flushing;
  }

  resetProgress(): void {
    this.progressSubject.next(0);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private generateKey(type: string, data: any): string {
    const hash = hashString(type + JSON.stringify(data));
    return `${type.toLowerCase()}:${hash}`;
  }

  /** Build the ObservationKey from subject config + a stable source ID. */
  private async getObservationKey(): Promise<{
    projectId: { string: string } | null;
    userId: string;
    sourceId: string;
  }> {
    const [userId, projectId, sourceId] = await Promise.all([
      this.subjectConfig.getParticipantLogin(),
      this.subjectConfig.getProjectName(),
      this.getSourceId(),
    ]);
    return {
      projectId: projectId ? { string: projectId } : null,
      userId,
      sourceId,
    };
  }

  /** Get or generate a stable source ID for this device/app instance. */
  private async getSourceId(): Promise<string> {
    const stored = await this.storage.get<string>(SOURCE_ID_KEY);
    if (stored) return stored;
    const id = generateUUID();
    await this.storage.set(SOURCE_ID_KEY, id);
    return id;
  }

  private buildKafkaRecord(
    observationKey: { projectId: { string: string } | null; userId: string; sourceId: string },
    entry: any,
    keySchemaId: number,
    valueSchemaId: number,
  ): { key_schema_id: number; value_schema_id: number; records: any[] } {
    return {
      key_schema_id: keySchemaId,
      value_schema_id: valueSchemaId,
      records: [
        {
          key: observationKey,
          value: entry.data,
        },
      ],
    };
  }
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const dataPipelineFactory = (deps: {
  cache: CacheService;
  kafka: KafkaService;
  logger: LoggerService;
  storage: import('../../types').StorageService;
  subjectConfig: SubjectConfigService;
}) => new DefaultDataPipeline(deps.cache, deps.kafka, deps.logger, deps.storage, deps.subjectConfig);
