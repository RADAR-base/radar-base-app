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
  useScheduleService,
  useQuestionnaireDataService,
} from './core/CoreServicesContext';
export { useAuth } from './core/useAuth';
export type { UseAuthResult } from './core/useAuth';
export type { CoreServiceOverrides } from './core/CoreServicesContext';
export { dataService } from './core/DataService';
export { apiService } from './core/ApiService';
export { eventBus } from './core/EventBus';
export { appServerServiceFactory } from './core/AppServerService';
export { AppserverScheduleService } from './core/AppserverScheduleService';
export { scheduleServiceFactory } from './core/ScheduleService';
export { questionnaireDataServiceFactory } from './core/QuestionnaireDataService';

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
  StatCardNode,
  TaskCardNode,
  ToDoStatusNode,
  DataWheelCardNode,
  CardSectionNode,
  TaskListSectionNode,
  ConnectDevicesMenuNode,
  HeaderNode,
  InboxItemListCoordinatorNode,
  InboxItemListNode,
  NavbarNode,
  QuestionnaireNode,
  RelativeActivityTodayNode,
  SectionNode,
  SurveyTaskListNode,
  TextNode,
  ViewNode,
  VitalsChartNode,
  RadioInput,
  CheckboxInput,
  RangeInput,
  SliderInput,
  TextQuestionInput,
  InfoScreen,
  QuestionRenderer,
  evaluateBranchingLogic,
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
  StatCardType,
  StatCardSize,
  TaskCardType,
  DataWheelSize,
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
  SelectChoice,
  QuestionRange,
  Answer,
  QuestionTimestamp,
  QuestionnaireResult,
  TaskListConfig,
  Task,
  DashboardWidgetConfig,
  DashboardSeriesConfig,
  DashboardRangeConfig,
  DashboardDataSourceConfig,
  DataExportConfig,
} from './types';
export { QUESTION_TYPES } from './types';
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
  ScheduleService,
  QuestionnaireDataService,
  ProtocolConfig,
  AssessmentConfig,
  AssessmentProtocol,
  TimeInterval,
  RepeatQuestionnaire,
  MultiLanguageText,
  QuestionnaireMetadata,
  TaskInstance,
  TaskInstanceState,
} from './types';

// Architecture-aligned namespace entry points
export * as LibrarySDUI from './library/sdui';
export * as LibraryServices from './core';
export type * as LibraryContracts from './library/contracts';
