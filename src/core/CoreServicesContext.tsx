import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
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
} from './index';
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
  DataPipelineService,
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
  dataPipeline: DataPipelineService;
  subjectConfig: SubjectConfigService;
  /** True once the schedule service has initialized (or been skipped for unauthenticated users). */
  scheduleReady: boolean;
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

  return <CoreServicesProviderInner overrides={overrides}>{children}</CoreServicesProviderInner>;
}

function CoreServicesProviderInner({
  children,
  overrides = {},
}: CoreServicesProviderProps) {
  const [scheduleReady, setScheduleReady] = useState(false);

  // Create all services exactly once via useRef so they survive re-renders
  // (e.g. when scheduleReady flips from false → true).
  const stableRef = useRef<Omit<CoreServices, 'scheduleReady'> | null>(null);
  if (!stableRef.current) {
    const logger = overrides.logger || noopLogger;
    const localization = overrides.localization || noopLocalization;
    const rc = overrides.remoteConfig || remoteConfigServiceFactory({ logger });
    const storage = overrides.storage || noopStorage;

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

    const analytics = analyticsServiceFactory({ logger, remoteConfig: rc });
    const cache = cacheServiceFactory({ storage, logger });
    const kafka = kafkaServiceFactory({ api: apiService, token, logger, remoteConfig: rc, storage });
    const dataPipeline = dataPipelineFactory({ cache, kafka, logger, storage, subjectConfig });
    const config = configServiceFactory({
      kafka, analytics, cache, pipeline: dataPipeline,
      remoteConfig: rc, storage, logger, dataService,
    });
    const auth = authServiceFactory({
      token, analytics, logger, config, subjectConfig,
      eventBus, storage, oauthConfig: overrides.authConfig,
    });
    const notifications = notificationServiceFactory({
      storage, logger, remoteConfig: rc, analytics, subjectConfig, eventBus,
    });
    const appServer = appServerServiceFactory({
      api: apiService, storage, subjectConfig, logger, remoteConfig: rc, localization, token,
    });
    const questionnaireData = questionnaireDataServiceFactory({
      storage, logger, eventBus, dataPipeline, appServer, remoteConfig: rc,
    });
    const schedule = scheduleServiceFactory({
      storage, logger, eventBus, appServer, questionnaireData,
    });

    apiService.setAuthTokenProvider(async () => {
      try {
        const t = await token.getAccessToken();
        return t;
      } catch {
        return null;
      }
    });

    stableRef.current = {
      data: dataService, eventBus, api: apiService, appServer,
      token, analytics, cache, kafka, config, auth, notifications,
      schedule, questionnaireData, dataPipeline, subjectConfig,
    };
  }

  const services: CoreServices = { ...stableRef.current, scheduleReady };

  // Fire-and-forget config init on mount (Kafka init + cache flush for returning users)
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    stableRef.current!.config.init().catch(() => {});
  }, []);

  return (
    <CoreServicesContext.Provider value={services}>
      <ScheduleInitManager services={services} onReady={() => setScheduleReady(true)} />
      {children}
    </CoreServicesContext.Provider>
  );
}

/** Internal component that initializes the schedule service when the user is authenticated
 *  and tears it down on sign-out. Keeps schedule lifecycle out of the host app. */
function ScheduleInitManager({ services, onReady }: { services: CoreServices; onReady: () => void }) {
  const { auth, schedule } = services;
  const bus = services.eventBus;
  const initedRef = useRef(false);

  const initSchedule = useCallback(async () => {
    if (initedRef.current) return;
    const isAuth = await auth.isAuthenticated();
    if (!isAuth) {
      onReady();
      return;
    }
    initedRef.current = true;
    await schedule.init();
    await schedule.fetchSchedule();
    onReady();
  }, [auth, schedule, onReady]);

  useEffect(() => {
    initSchedule().catch(() => {
      onReady();
    });

    const handler = (data: { status: string }) => {
      if (data.status === 'authenticated' && !initedRef.current) {
        initSchedule().catch(() => {});
      } else if (data.status === 'unauthenticated' && initedRef.current) {
        initedRef.current = false;
        schedule.destroy();
        onReady();
      }
    };
    bus.on('auth.state_changed', handler);
    return () => {
      bus.off('auth.state_changed', handler);
      schedule.destroy();
    };
  }, [initSchedule, schedule, bus, onReady]);

  return null;
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
export const useDataPipeline = () => useCoreServices().dataPipeline;
export const useSubjectConfigService = () => useCoreServices().subjectConfig;

/** Returns true once the schedule service has initialized (or been skipped for unauthenticated users).
 *  Schedule lifecycle is managed internally by CoreServicesProvider. */
export function useScheduleInit(): boolean {
  return useCoreServices().scheduleReady;
}
