/**
 * Data converters — transform raw producer payloads into Kafka-ready values.
 *
 * Ported from RADAR-Questionnaire's converter services:
 *   - AssessmentConverterService
 *   - TimezoneConverterService
 *   - AppEventConverterService
 *   - CompletionLogConverterService
 *   - HealthkitConverterService
 *
 * Each converter extracts the relevant fields and structures them for the
 * corresponding Kafka topic's Avro schema.
 */
import type { Converter } from './types';
import { SchemaType } from './types';

// Default topic prefix for HealthKit data (matches RADAR-Questionnaire)
const HEALTHKIT_TOPIC_PREFIX = 'active_apple_healthkit_';

function getSeconds(ms: number): number {
  return ms / 1000;
}

// ---------------------------------------------------------------------------
// Assessment converter — questionnaire answers → questionnaire_response topic
// ---------------------------------------------------------------------------

class AssessmentConverter implements Converter {
  private readonly GENERAL_TOPIC = 'questionnaire_response';

  processData(payload: any): any {
    const task = payload.task;
    if (!task) return {};
    const data = payload.data;
    const metadata = payload.metadata || {};
    const computedEventName = metadata.computedEventName || metadata.renderedEventName;
    const name = computedEventName || task.name;

    return {
      name,
      version: metadata.version || 'version',
      answers: this.processAnswers(data.answers, data.timestamps),
      time: data.time || data.startTime,
      timeCompleted: data.timeCompleted || data.endTime,
      timeNotification: task.timestamp ? getSeconds(task.timestamp) : 0,
    };
  }

  private processAnswers(
    answers: Record<string, any>,
    timestamps: Record<string, { startTime: number; endTime: number }>,
  ): any[] {
    return Object.entries(answers).map(([key, value]) => ({
      questionId: key,
      value: String(value),
      startTime: timestamps[key]?.startTime,
      endTime: timestamps[key]?.endTime,
    }));
  }

  getKafkaTopic(_payload: any, topics: string[]): string {
    if (topics.length && !topics.includes(this.GENERAL_TOPIC)) {
      return topics[0];
    }
    return this.GENERAL_TOPIC;
  }
}

// ---------------------------------------------------------------------------
// Timezone converter — captures the device timezone at submission time
// ---------------------------------------------------------------------------

class TimezoneConverter implements Converter {
  processData(_payload: any): any {
    const now = new Date();
    return {
      time: now.getTime() / 1000,
      timeCompleted: now.getTime() / 1000,
      offset: now.getTimezoneOffset() * -60, // minutes → seconds, invert sign
    };
  }

  getKafkaTopic(_payload: any, _topics: string[]): string {
    return 'questionnaire_timezone';
  }
}

// ---------------------------------------------------------------------------
// App event converter — app lifecycle events (open, questionnaire start, etc.)
// ---------------------------------------------------------------------------

class AppEventConverter implements Converter {
  processData(payload: any): any {
    return {
      time: Date.now() / 1000,
      eventType: payload.eventType || 'UNKNOWN',
      questionnaireName: payload.questionnaireName || '',
    };
  }

  getKafkaTopic(_payload: any, _topics: string[]): string {
    return 'questionnaire_app_event';
  }
}

// ---------------------------------------------------------------------------
// Completion log converter — tracks questionnaire completion percentage
// ---------------------------------------------------------------------------

class CompletionLogConverter implements Converter {
  processData(payload: any): any {
    return {
      time: Date.now() / 1000,
      timeCompleted: payload.timeCompleted || Date.now() / 1000,
      name: payload.name || '',
      completionPercentage: payload.completionPercentage ?? 1.0,
    };
  }

  getKafkaTopic(_payload: any, _topics: string[]): string {
    return 'questionnaire_completion_log';
  }
}

// ---------------------------------------------------------------------------
// HealthKit converter — Apple HealthKit / Health Connect data
// ---------------------------------------------------------------------------

class HealthKitConverter implements Converter {
  processData(payload: any): any {
    // HealthKit data is already structured by the health provider plugin;
    // pass through as-is.
    return payload;
  }

  getKafkaTopic(payload: any, _topics: string[]): string {
    const dataType = payload.dataType || payload.type || 'steps';
    return `${HEALTHKIT_TOPIC_PREFIX}${dataType}`;
  }
}

// ---------------------------------------------------------------------------
// Converter factory — routes SchemaType to the correct converter
// ---------------------------------------------------------------------------

export class ConverterFactory {
  private readonly assessment = new AssessmentConverter();
  private readonly timezone = new TimezoneConverter();
  private readonly appEvent = new AppEventConverter();
  private readonly completionLog = new CompletionLogConverter();
  private readonly healthKit = new HealthKitConverter();

  getConverter(type: string): Converter {
    const normalized = type.toLowerCase();

    // HealthKit types may include a suffix (e.g. 'healthkit_steps')
    if (normalized.includes(SchemaType.HEALTHKIT)) return this.healthKit;

    switch (normalized) {
      case SchemaType.ASSESSMENT:
        return this.assessment;
      case SchemaType.TIMEZONE:
        return this.timezone;
      case SchemaType.APP_EVENT:
        return this.appEvent;
      case SchemaType.COMPLETION_LOG:
        return this.completionLog;
      default:
        return this.assessment;
    }
  }
}
