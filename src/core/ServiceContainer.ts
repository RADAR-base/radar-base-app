/**
 * Pure dependency-injection container — creates and wires all core services.
 *
 * No React, no lifecycle — just a factory that takes overrides and returns the full service bag.
 * This makes the wiring testable and keeps the React provider thin.
 */
import { dataService } from './DataService';
import { eventBus } from './EventBus';
import { apiService } from './ApiService';
import {
  appServerServiceFactory,
  tokenServiceFactory,
  analyticsServiceFactory,
  cacheServiceFactory,
  kafkaServiceFactory,
  configServiceFactory,
  authServiceFactory,
  notificationServiceFactory,
  scheduleServiceFactory,
  questionnaireDataServiceFactory,
  subjectConfigServiceFactory,
  dataPipelineFactory,
  remoteConfigServiceFactory,
  audioRecordServiceFactory,
  healthKitServiceFactory,
} from './index';
import type {
  DataService,
  EventBus,
  ApiService,
  AppServerService,
  LoggerService,
  LocalizationService,
  RemoteConfigService,
  SubjectConfigService,
  StorageService,
  TokenService,
  AnalyticsService,
  CacheService,
  KafkaService,
  ConfigService,
  AuthService,
  NotificationService,
  ScheduleService,
  QuestionnaireDataService,
  DataPipelineService,
  AudioRecordService,
  HealthKitService,
  OAuthConfig,
} from '../types';

// ---------------------------------------------------------------------------
// Service bag — the shape every consumer (context, hooks, tests) operates on.
// ---------------------------------------------------------------------------

export interface ServiceBag {
  data: DataService;
  eventBus: EventBus;
  api: ApiService;
  appServer: AppServerService;
  token: TokenService;
  analytics: AnalyticsService;
  cache: CacheService;
  kafka: KafkaService;
  config: ConfigService;
  auth: AuthService;
  notifications: NotificationService;
  schedule: ScheduleService;
  questionnaireData: QuestionnaireDataService;
  dataPipeline: DataPipelineService;
  subjectConfig: SubjectConfigService;
  audioRecord: AudioRecordService;
  healthKit: HealthKitService;
  remoteConfig: RemoteConfigService;
}

// ---------------------------------------------------------------------------
// Overrides — the seams hosts use to swap implementations.
// ---------------------------------------------------------------------------

export interface ServiceOverrides {
  logger?: LoggerService;
  localization?: LocalizationService;
  remoteConfig?: RemoteConfigService;
  subjectConfig?: SubjectConfigService;
  storage?: StorageService;
  authConfig?: OAuthConfig;
  /** Provide a real audio recorder (e.g. `new ExpoAudioRecordService()`). Without it,
   *  speech questions degrade gracefully — phases and animations work, but nothing is captured. */
  audioRecord?: AudioRecordService;
  /** Provide a HealthKit/Health Connect implementation. Without it, the connect-health
   *  enrolment step is a no-op. */
  healthKit?: HealthKitService;
}

// ---------------------------------------------------------------------------
// No-op defaults — satisfy the dependency graph when no real impl is provided.
// ---------------------------------------------------------------------------

const noopLogger: LoggerService = {
  log: (message: string, meta?: unknown) => console.log(message, meta),
  error: (message: string, meta?: unknown) => {
    console.error(message, meta);
    return Promise.reject(new Error(String(message)));
  },
};

const noopLocalization: LocalizationService = {
  getLanguage: () => ({ value: 'en' }),
};

const noopSubjectConfig: SubjectConfigService = {
  getParticipantLogin: async () => 'anonymous',
  getProjectName: async () => 'default',
  getEnrolmentDate: async () => new Date().toISOString(),
  getParticipantAttributes: async () => ({}),
  clear: async () => {},
};

const noopStorage: StorageService = {
  get: async () => null,
  set: async () => {},
  remove: async () => {},
  observe: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }) as any,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createServices(overrides: ServiceOverrides = {}): ServiceBag {
  const logger = overrides.logger ?? noopLogger;
  const localization = overrides.localization ?? noopLocalization;
  const remoteConfig = overrides.remoteConfig ?? remoteConfigServiceFactory({ logger });
  const storage = overrides.storage ?? noopStorage;

  const token = tokenServiceFactory({
    storage,
    logger,
    bus: eventBus,
    oauthClient: overrides.authConfig?.clientId
      ? {
          clientId: overrides.authConfig.clientId,
          clientSecret: overrides.authConfig.clientSecret,
        }
      : undefined,
  });

  const subjectConfig =
    overrides.subjectConfig ??
    (overrides.authConfig?.endpoint
      ? subjectConfigServiceFactory({
          token,
          storage,
          logger,
          baseUrl: overrides.authConfig.endpoint,
        })
      : noopSubjectConfig);

  const analytics = analyticsServiceFactory({ logger, remoteConfig });
  const cache = cacheServiceFactory({ storage, logger });
  const kafka = kafkaServiceFactory({ api: apiService, token, logger, remoteConfig, storage });
  const dataPipeline = dataPipelineFactory({ cache, kafka, logger, storage, subjectConfig });
  const config = configServiceFactory({
    kafka, analytics, cache, pipeline: dataPipeline,
    remoteConfig, storage, logger, dataService,
  });
  const auth = authServiceFactory({
    token, analytics, logger, config, subjectConfig,
    eventBus, storage, oauthConfig: overrides.authConfig,
  });
  const notifications = notificationServiceFactory({
    storage, logger, remoteConfig, analytics, subjectConfig, eventBus,
  });
  const appServer = appServerServiceFactory({
    api: apiService, storage, subjectConfig, logger, remoteConfig, localization, token,
  });
  const questionnaireData = questionnaireDataServiceFactory({
    storage, logger, eventBus, dataPipeline, appServer, remoteConfig,
  });
  const schedule = scheduleServiceFactory({
    storage, logger, eventBus, appServer, questionnaireData,
  });

  const audioRecord = overrides.audioRecord ?? audioRecordServiceFactory({ logger });
  const healthKit = overrides.healthKit ?? healthKitServiceFactory({ logger });

  // Wire the API layer's auth token provider so authenticated requests work automatically.
  apiService.setAuthTokenProvider(async () => {
    try {
      return await token.getAccessToken();
    } catch {
      return null;
    }
  });

  return {
    data: dataService, eventBus, api: apiService, appServer,
    token, analytics, cache, kafka, config, auth, notifications,
    schedule, questionnaireData, dataPipeline, subjectConfig, audioRecord, healthKit,
    remoteConfig,
  };
}
