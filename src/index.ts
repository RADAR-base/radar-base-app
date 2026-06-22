// Core services
export {
  CoreServicesProvider,
  useCoreServices,
  useDataService,
  useEventBus,
  useApiService,
  useAppServerService,
  useTokenService,
  useAnalyticsService,
  useCacheService,
  useKafkaService,
  useConfigService,
  useAuthService,
  useNotificationService,
} from './core/CoreServicesContext';
export { useAuth } from './core/useAuth';
export type { UseAuthResult } from './core/useAuth';
export type { CoreServiceOverrides } from './core/CoreServicesContext';
export { dataService } from './core/DataService';
export { apiService } from './core/ApiService';
export { eventBus } from './core/EventBus';
export { appServerServiceFactory } from './core/AppServerService';
export { AppserverScheduleService } from './core/AppserverScheduleService';

// SDUI engine — the primary public surface
export {
  SDUIShell,
  NodeRegistry,
  NodeRenderer,
  NodeErrorBoundary,
  ManifestLoader,
  BlueprintLoader,
  parseManifest,
  parseBlueprint,
  createBundledBlueprintSource,
  createActionDispatcher,
  interpolate,
  interpolateDeep,
  BarChart,
  Sparkline,
  useDashboardData,
  registerBuiltInNodes,
  ActionNode,
  AlertBannerNode,
  CalendarNode,
  CardNode,
  ConnectDevicesMenuNode,
  InboxItemListCoordinatorNode,
  InboxItemListNode,
  QuestionnaireNode,
  RelativeActivityTodayNode,
  SectionNode,
  SurveyTaskListNode,
  TextNode,
  ViewNode,
  VitalsChartNode,
} from './library/sdui';
export type {
  SDUIShellProps,
  NodeComponent,
  NodeProps,
  SDUIContext,
  TemplateContext,
  ActionPayload,
  ManifestSource,
  BlueprintSource,
  ChartProps,
  ResolvedSeries,
  DashboardDataState,
} from './library/sdui';

// SDUI contracts
export { ManifestSchema, BlueprintSchema, NodeSchema } from './library/contracts';
export type {
  AppManifest,
  ThemeManifest,
  HeaderManifest,
  TabManifest,
  WidgetRegistryEntry,
  AlertRule,
  ScreenBlueprint,
  Node,
} from './library/contracts';

// Shared data shapes consumed by built-in nodes (blueprint authoring helpers).
export type {
  EventBus,
  DataService,
  QuestionnaireConfig,
  Question,
  TaskListConfig,
  Task,
  DashboardWidgetConfig,
  DashboardSeriesConfig,
  DashboardRangeConfig,
  DashboardDataSourceConfig,
  DataExportConfig,
} from './types';
export type {
  AppServerService,
  TokenService,
  TokenPair,
  RemoteConfigService,
  SubjectConfigService,
  LocalizationService,
  LoggerService,
  StorageService,
  ObservableLike,
  AuthService,
  AuthStatus,
  OAuthConfig,
  AnalyticsService,
  CacheService,
  KafkaService,
  ConfigService,
  NotificationService,
} from './types';

// Architecture-aligned namespace entry points
export * as LibrarySDUI from './library/sdui';
export * as LibraryServices from './core';
export type * as LibraryContracts from './library/contracts';
