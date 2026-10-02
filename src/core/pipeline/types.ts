/**
 * Schema types matching RADAR-Questionnaire's SchemaType enum.
 * Each type routes to a specific Kafka topic and converter.
 */
export enum SchemaType {
  ASSESSMENT = 'assessment',
  COMPLETION_LOG = 'completion_log',
  TIMEZONE = 'timezone',
  APP_EVENT = 'app_event',
  HEALTHKIT = 'healthkit',
}

/** Kafka record key — identifies the source of data. */
export interface KeyExport {
  userId: string;
  sourceId: string;
  projectId: string;
}

/** Schema metadata returned by the schema registry. */
export interface SchemaMetadata {
  id: number;
  version: number;
  schema: string;
}

/**
 * Converter interface — each SchemaType has a converter that:
 * 1. Transforms raw producer data into a Kafka-ready value (`processData`)
 * 2. Resolves the correct Kafka topic (`getKafkaTopic`)
 */
export interface Converter {
  processData(payload: any): any;
  getKafkaTopic(payload: any, topics: string[]): string;
}
