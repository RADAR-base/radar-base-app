import React, { createContext, useContext, ReactNode } from 'react';
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
} from './index';

let remoteConfigModule: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  remoteConfigModule = require('@react-native-firebase/remote-config');
} catch {
  remoteConfigModule = null;
}
const remoteConfig: any = remoteConfigModule?.default || remoteConfigModule || (() => ({
  fetchAndActivate: async () => {},
  getValue: (_k: string) => ({ asString: () => '' })
}));
import type {
  DataService,
  EventBus,
  ApiService,
  AppServerService as IAppServerService,
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
  OAuthConfig,
} from '../types';

// Enhanced no-op implementations to satisfy dependencies; apps can override via a higher-level provider if needed
const noopLogger: LoggerService = { 
  log: (message: string, meta?: unknown) => console.log(message, meta), 
  error: (message: string, meta?: unknown) => {
    console.error(message, meta);
    // Do not throw in noop logger to avoid crashing UI in web/demo
    return Promise.reject(new Error(String(message)));
  }
};

const noopLocalization: LocalizationService = { getLanguage: () => ({ value: 'en' }) };

// Real RemoteConfigService backed by RN Firebase remote-config
const firebaseRemoteConfigService: RemoteConfigService = {
  forceFetch: async () => {
    try {
      if (typeof (remoteConfig as any) === 'function') {
        await (remoteConfig as any)().fetchAndActivate();
      }
    } catch {}
    return {
      getOrDefault: (k: string, d: string) => {
        try {
          if (typeof (remoteConfig as any) === 'function') {
            const val = (remoteConfig as any)().getValue(k);
            const str = val.asString();
            return str !== '' ? (str as unknown as string) : d;
          }
          return d;
        } catch {
          return d;
        }
      }
    } as any;
  }
} as any;

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
  observe: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }) as any,
};

const noopToken: TokenService = {
  refresh: async () => ({ access_token: 'mock_token' }),
  register: async () => {},
  configureOAuthClient: async () => {},
  getRefreshParams: (token: string) => ({ refresh_token: token }),
  getURI: async () => 'http://localhost',
  setURI: async (uri: string) => uri,
  setTokenEndpoint: async () => {},
  getTokenEndpoint: async () => 'http://localhost/oauth/token',
  getAccessToken: async () => 'mock_token',
  clearTokens: async () => {},
};

interface CoreServices {
  // Original services
  data: DataService;
  eventBus: EventBus;
  api: ApiService;
  appServer: IAppServerService;

  // New services migrated from RADAR-Questionnaire
  token: TokenService;
  analytics: AnalyticsService;
  cache: CacheService;
  kafka: KafkaService;
  config: ConfigService;
  auth: AuthService;
  notifications: NotificationService;
  schedule: ScheduleService;
  questionnaireData: QuestionnaireDataService;
}

const CoreServicesContext = createContext<CoreServices | null>(null);

/**
 * Optional overrides for the core service singletons. Hosts pass these into
 * `CoreServicesProvider` (or `SDUIShell`'s `serviceOverrides` prop) to swap defaults —
 * most commonly to plug in a real `StorageService` for token persistence.
 */
export interface CoreServiceOverrides {
  logger?: LoggerService;
  localization?: LocalizationService;
  remoteConfig?: RemoteConfigService;
  subjectConfig?: SubjectConfigService;
  storage?: StorageService;
  authConfig?: OAuthConfig;
}

interface CoreServicesProviderProps {
  children: ReactNode;
  overrides?: CoreServiceOverrides;
}

export function CoreServicesProvider({
  children,
  overrides = {},
}: CoreServicesProviderProps) {
  // If already inside a CoreServicesProvider, reuse the parent context
  // instead of creating duplicate service instances (avoids double-init issues).
  const parentContext = useContext(CoreServicesContext);
  if (parentContext) {
    return <>{children}</>;
  }

  // Use provided overrides or fall back to no-op implementations
  const logger = overrides.logger || noopLogger;
  const localization = overrides.localization || noopLocalization;
  const remoteConfig = overrides.remoteConfig || firebaseRemoteConfigService;
  const storage = overrides.storage || noopStorage;

  // Create token service — pass OAuth client so cold-start refresh has client_id
  // before any appserver call (RN fetch also needs a string body; see TokenService).
  const token = tokenServiceFactory({
    storage,
    logger,
    oauthClient: overrides.authConfig?.clientId
      ? {
          clientId: overrides.authConfig.clientId,
          clientSecret: overrides.authConfig.clientSecret,
        }
      : undefined,
  });

  // Subject identity: prefer an explicit override; otherwise resolve from Management Portal
  // using the OAuth base URL (`GET …/managementportal/api/subjects/{login}`).
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

  // Create analytics service
  const analytics = analyticsServiceFactory({
    logger,
    remoteConfig,
  });

  // Create cache service
  const cache = cacheServiceFactory({
    storage,
    logger,
  });

  // Create kafka service
  const kafka = kafkaServiceFactory({
    cache,
    api: apiService,
    token,
    logger,
    remoteConfig,
    storage,
  });

  // Create config service (orchestrates other services)
  const config = configServiceFactory({
    kafka,
    analytics,
    cache,
    token,
    remoteConfig,
    storage,
    logger,
    dataService,
  });

  // Create auth service
  const auth = authServiceFactory({
    token,
    analytics,
    logger,
    config,
    subjectConfig,
    eventBus: eventBus,
    storage,
    oauthConfig: overrides.authConfig,
  });

  // Create notification service
  const notifications = notificationServiceFactory({
    storage,
    logger,
    remoteConfig,
    analytics,
  });

  // Create app server service
  const appServer = appServerServiceFactory({
    api: apiService,
    storage,
    subjectConfig,
    logger,
    remoteConfig,
    localization,
    token,
  });

  // Create questionnaire data service
  const questionnaireData = questionnaireDataServiceFactory({
    storage,
    logger,
    eventBus: eventBus,
  });

  // Create schedule service (depends on questionnaireData for protocol-driven definition loading)
  const schedule = scheduleServiceFactory({
    storage,
    logger,
    eventBus: eventBus,
    appServer,
    questionnaireData,
  });

  // Inject auth token provider into ApiService
  apiService.setAuthTokenProvider(async () => {
    try {
      const t = await token.getAccessToken();
      return t;
    } catch {
      return null;
    }
  });

  const services: CoreServices = {
    // Original services
    data: dataService,
    eventBus: eventBus,
    api: apiService,
    appServer,
    
    // New services
    token,
    analytics,
    cache,
    kafka,
    config,
    auth,
    notifications,
    schedule,
    questionnaireData,
  };

  return (
    <CoreServicesContext.Provider value={services}>
      {children}
    </CoreServicesContext.Provider>
  );
}

export const useCoreServices = (): CoreServices => {
  const context = useContext(CoreServicesContext);
  if (!context) {
    throw new Error('useCoreServices must be used within a CoreServicesProvider');
  }
  return context;
};

// Individual service hooks for convenience
export const useDataService = () => useCoreServices().data;
export const useEventBus = () => useCoreServices().eventBus;
export const useApiService = () => useCoreServices().api;
export const useAppServerService = () => useCoreServices().appServer;
export const useTokenService = () => useCoreServices().token;
export const useAnalyticsService = () => useCoreServices().analytics;
export const useCacheService = () => useCoreServices().cache;
export const useKafkaService = () => useCoreServices().kafka;
export const useConfigService = () => useCoreServices().config;
export const useAuthService = () => useCoreServices().auth;
export const useNotificationService = () => useCoreServices().notifications;
export const useScheduleService = () => useCoreServices().schedule;
export const useQuestionnaireDataService = () => useCoreServices().questionnaireData;
