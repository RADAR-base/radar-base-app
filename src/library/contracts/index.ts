// SDUI schemas (runtime values + types)
export {
  ManifestSchema,
  ThemeSchema,
  HeaderSchema,
  TabConfigSchema,
  WidgetRegistryEntrySchema,
  AlertRuleSchema,
  AlertActionSchema,
  AlertsSchema,
} from './ManifestSchema';
export type {
  AppManifest,
  ThemeManifest,
  HeaderManifest,
  TabManifest,
  WidgetRegistryEntry,
  AlertRule,
} from './ManifestSchema';

export { BlueprintSchema } from './BlueprintSchema';
export type { ScreenBlueprint } from './BlueprintSchema';

export { NodeSchema } from './NodeSchema';
export type { Node, NodeShape } from './NodeSchema';

// Cross-cutting data shapes consumed by built-in SDUI nodes.
export type {
  EventBus,
  DataService,
  QuestionnaireConfig,
  Question,
  TaskListConfig,
  Task,
  TaskView,
  DashboardWidgetConfig,
  DashboardSeriesConfig,
  DashboardRangeConfig,
  DashboardDataSourceConfig,
  DataExportConfig,
  AppServerService,
  TokenService,
  RemoteConfigService,
  SubjectConfigService,
  LocalizationService,
  LoggerService,
  StorageService,
} from '../../types';
