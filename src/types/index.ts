// Core Services Interfaces
export interface EventBus {
  emit<T = any>(event: string, data?: T): void;
  on<T = any>(event: string, handler: (data: T) => void): void;
  off<T = any>(event: string, handler: (data: T) => void): void;
  once<T = any>(event: string, handler: (data: T) => void): void;
}

export interface DataService {
  get<T = any>(key: string): Promise<T | null>;
  set<T = any>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  getSecure<T = any>(key: string): Promise<T | null>;
  setSecure<T = any>(key: string, value: T): Promise<void>;
}

// Data shapes consumed by built-in SDUI nodes. These describe the runtime data inside
// blueprints (e.g. an array of questions, a list of tasks) — they're not "widget"
// concepts and are kept as part of the public surface so consumers can type-check their
// blueprint authoring helpers.
export interface QuestionnaireConfig {
  questions: Question[];
}

// REDCap-compatible question format (matching RADAR-Questionnaire)

export interface SelectChoice {
  code: string;
  label: string;
}

export interface QuestionRange {
  min: number;
  max: number;
  step?: number;
  labelLeft?: string;
  labelRight?: string;
}

export const QUESTION_TYPES = {
  radio: 'radio',
  checkbox: 'checkbox',
  range: 'range',
  slider: 'slider',
  sliderVertical: 'slider-vertical',
  text: 'text',
  yesno: 'yesno',
  info: 'info',
  descriptive: 'descriptive',
  audio: 'audio',
  timed: 'timed',
  matrixRadio: 'matrix-radio',
  healthkit: 'healthkit',
} as const;

export interface Question {
  field_name?: string;
  field_label?: string;
  field_type?: string;
  form_name?: string;
  section_header?: string;
  select_choices_or_calculations?: SelectChoice[];
  branching_logic?: string;
  evaluated_logic?: string;
  required_field?: string;
  text_validation_type_or_show_slider_number?: string;
  text_validation_min?: string;
  text_validation_max?: string;
  matrix_group_name?: string;
  matrix_ranking?: string;
  field_annotation?: any;
  field_note?: string;
  range?: QuestionRange;
  isAutoNext?: boolean;
  identifier?: string;
  custom_alignment?: string;
  question_number?: string;
}

export interface Answer {
  id: string;
  value: any;
  type: string;
}

export interface QuestionTimestamp {
  startTime: number;
  endTime: number;
}

export interface QuestionnaireResult {
  assessmentName: string;
  answers: Record<string, any>;
  timestamps: Record<string, QuestionTimestamp>;
  startTime: number;
  endTime: number;
}

export interface TaskListConfig {
  tasks: Task[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  dueTime: string;
  estimated_minutes: number;
  status: 'pending' | 'completed' | 'overdue';
  // Optional fields for scheduled tasks
  timestamp?: number; // epoch ms start time
  completionWindow?: number; // ms window length
  completed?: boolean;
  /** Epoch ms of the protocol-configured reminder, if any — see `TaskInstance.reminderTimestamp`. */
  reminderTimestamp?: number;
}

export interface DataExportConfig {
  export_formats: string[];
  data_types: string[];
  privacy_level: string;
}

export interface ApiService {
  setBaseUrl(url: string): void;
  setHeaders(headers: Record<string, string>): void;
  setAuthTokenProvider(provider: () => Promise<string | null>): void;
  get<T = any>(path: string, options?: RequestInit): Promise<T>;
  post<T = any>(path: string, body: unknown, options?: RequestInit): Promise<T>;
}

// Generic dashboard data shape — drives nodes like `GraphDataNode`. Each series renders
// one chart; its values can be supplied inline (`values`), pulled from a configurable API
// endpoint (`responseField` + `dataSource`), or synthesized as a placeholder for previews.

export interface DashboardSeriesConfig {
  id: string;
  label: string;
  chartType: 'bar' | 'sparkline';
  /** Override the chart color. Defaults to the consumer node's accent / theme primary. */
  color?: string;
  /** Optional unit string appended to the most recent value (e.g. "bpm", "kg"). */
  unit?: string;
  /** Inline values. Takes precedence over `responseField`. */
  values?: number[];
  /** Maps a row from the API response into this series. Requires `dataSource` on the parent config. */
  responseField?: {
    /** Value of the metric-identifying field on a response row (e.g. "heart_rate"). */
    metric: string;
    /** Field name on the row to read as the numeric value. Defaults to `dataSource.valueField`. */
    field?: string;
  };
}

export interface DashboardRangeConfig {
  id: string;
  /** Display label on the range pill (e.g. "7d", "Last month"). */
  label: string;
  /** How many of the most recent values to show. Series values are sliced to this length. */
  bucketCount: number;
}

export interface DashboardDataSourceConfig {
  /** Path (joined to `ApiService` base URL) or absolute URL. */
  endpoint: string;
  method?: 'GET' | 'POST';
  /** Optional request body when `method === 'POST'`. */
  body?: unknown;
  /** Field on each response row that identifies the metric. Defaults to `"metric"`. */
  metricField?: string;
  /** Field on each response row holding the numeric value. Defaults to `"value"`. */
  valueField?: string;
  /** Auto-refresh interval in milliseconds. Omit for fetch-once-on-mount. */
  refreshIntervalMs?: number;
}

export interface DashboardWidgetConfig {
  series: DashboardSeriesConfig[];
  dataSource?: DashboardDataSourceConfig;
  ranges?: DashboardRangeConfig[];
  defaultRangeId?: string;
  /** Render synthesized data when neither `values` nor a usable API response is available. */
  placeholder?: 'random' | 'none';
}

// OAuth configuration
export interface OAuthConfig {
  clientId: string;
  clientSecret?: string;
  endpoint: string;
  scopes: string;
  audience: string;
  redirectUri: string;
  authPath?: string;
  tokenPath?: string;
}

export type AuthStatus = 'unknown' | 'unauthenticated' | 'authenticating' | 'authenticated';

// Scheduling and questionnaire abstractions
export type AssessmentType = 'SCHEDULED' | 'AD_HOC';
export type TaskState = 'COMPLETED' | 'PENDING' | 'SKIPPED';

export interface Assessment {
  questions: Array<{ id: string; text?: string }>;
  requiresInClinicCompletion?: boolean;
  warn?: string | Record<string, string>;
}

export interface QuestionnaireService {
  getAssessmentForTask(type: AssessmentType, task: Task): Promise<Assessment | null>;
}

// App Server related service abstractions
export interface TokenPair { access_token: string; refresh_token?: string }
export interface TokenService {
  refresh(): Promise<TokenPair>;
  register(refreshParams: { refresh_token: string; access_token?: string }): Promise<void>;
  getRefreshParams(refreshToken: string): { refresh_token: string };
  getURI(): Promise<string>;
  setURI(uri: string): Promise<string>;
  setTokenEndpoint(endpoint: string): Promise<void>;
  getTokenEndpoint(): Promise<string>;
  getAccessToken(): Promise<string | null>;
  clearTokens(): Promise<void>;
}

export interface RemoteConfig {
  getOrDefault(key: string, defaultValue: string): string;
}
export interface RemoteConfigService {
  forceFetch(): Promise<RemoteConfig>;
}

export interface SubjectConfigService {
  getParticipantLogin(): Promise<string>;
  getProjectName(): Promise<string>;
  getEnrolmentDate(): Promise<string | Date>;
  getParticipantAttributes(): Promise<Record<string, unknown>>;
}

export interface LocalizationService {
  getLanguage(): { value: string };
}

export interface LoggerService {
  log(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): never | Promise<never>;
}

export interface ObservableLike<T> {
  subscribe(handler: (value: T) => void): { unsubscribe(): void };
}
export interface StorageService {
  get<T = any>(key: string): Promise<T | null>;
  set<T = any>(key: string, value: T): Promise<void>;
  observe<T = any>(key: string): ObservableLike<T>;
}

export interface AppServerService {
  init(): Promise<any>;
  getProject(projectId: string): Promise<any>;
  addProjectIfMissing(projectId: string): Promise<any>;
  addProjectToServer(projectId: string): Promise<any>;
  getSubject(projectId: string, subjectId: string): Promise<any>;
  addSubjectIfMissing(subjectId: string, projectId: string, enrolmentDate: string | Date, attributes: Record<string, unknown>, fcmToken?: string | null): Promise<any>;
  addSubjectToServer(subjectId: string, projectId: string, enrolmentDate: string | Date, fcmToken?: string | null, attributes?: Record<string, unknown>): Promise<any>;
  fetchFromGithub(githubUrl: string): Promise<any>;
  getSchedule(): Promise<any>;
  getScheduleForDates(startTime: Date, endTime: Date): Promise<any>;
  generateSchedule(): Promise<any>;
  pullAllPublishedNotifications(subject: { projectId: string; subjectId: string }): Promise<any>;
  deleteNotification(subject: { projectId: string; subjectId: string }, notification: { id: string | number }): Promise<any>;
  updateTaskState(taskId: string | number, state: string): Promise<any>;
  updateNotificationState(subject: { projectId: string; subjectId: string }, notificationId: string | number, state: string): Promise<any>;
  addNotification(notification: { notificationDto: any }, subjectId: string, projectId: string): Promise<any>;
  getFCMToken(): Promise<string | null>;
  updateAppServerURL(): Promise<string>;
  getAppServerURL(): string | null;
}

// New Service Interfaces for RADAR Migration

export interface AuthService {
  getAuthorizationUrl(): Promise<string>;
  handleAuthCallback(code: string, state: string): Promise<void>;
  authenticate(credentials: any): Promise<TokenPair>;
  completeAuthentication(refreshToken: string, baseUrl: string, tokenEndpoint: string, accessToken?: string): Promise<TokenPair>;
  reset(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
}

export interface AnalyticsService {
  init(): Promise<void>;
  logEvent(eventName: string, parameters?: Record<string, any>): Promise<void>;
  setUserProperties(properties: Record<string, any>): Promise<void>;
  setUserId(userId: string): Promise<void>;
  logScreen(screenName: string, screenClass?: string): Promise<void>;
  logDataSent(dataType: string, recordCount: number, success: boolean): Promise<void>;
  logConfigChange(configKey: string, oldValue: any, newValue: any): Promise<void>;
  logError(errorType: string, errorMessage: string, errorContext?: Record<string, any>): Promise<void>;
  logAuthenticationEvent(eventType: 'login' | 'logout' | 'token_refresh', success: boolean): Promise<void>;
}

export interface NotificationService {
  init(): Promise<void>;
  publish(actionType: NotificationActionType, limit?: number): Promise<any>;
  publishAllNotifications(user: Subject, limit?: number): Promise<any>;
  publishTestNotification(user: Subject): Promise<any>;
  publishCustomNotification(user: Subject, timestamp: number, title: string, text: string): Promise<any>;
  cancelAllNotifications(user: Subject): Promise<any>;
  cancelSingleNotification(user: Subject, notificationId: string | number): Promise<any>;
}

export enum NotificationActionType {
  SCHEDULE_ALL = 'SCHEDULE_ALL',
  TEST = 'TEST',
  CANCEL_ALL = 'CANCEL_ALL',
  CANCEL_SINGLE = 'CANCEL_SINGLE',
  SEND_ERROR = 'SEND_ERROR'
}

export interface Subject {
  subjectId: string;
  projectId: string;
}

export interface CacheService {
  init(): Promise<void>;
  getCache(): Promise<Record<string, any>>;
  getCacheSize(): Promise<number>;
  storeInCache(type: string, value: any, cacheValue: any): Promise<void>;
  removeFromCache(key: string): Promise<void>;
  removeFromCacheMultiple(keys: string[]): Promise<void>;
  setCache(cache: Record<string, any>): Promise<void>;
  clearCache(): Promise<void>;
}

export interface KafkaService {
  init(): Promise<any>;
  sendAllFromCache(): Promise<{ successKeys: string[]; failedKeys: string[] }>;
  prepareKafkaObjectAndStore(type: string, value: any): Promise<void>;
  resetProgress(): void;
  isCacheCurrentlySending(): boolean;
  eventCallback$: ObservableLike<number>;
  getTopics(): Promise<string[]>;
}

export interface SchemaService {
  init(): void;
  getKafkaObjectKey(): Promise<any>;
  validateSchema(data: any, schema: any): boolean;
}

export interface ConfigService {
  init(): Promise<any>;
  getAll(): Promise<Record<string, any>>;
  get(key: string): Promise<any>;
  sendCachedData(): Promise<{ successKeys: string[]; failedKeys: string[] }>;
  getKafkaService(): KafkaService;
  sendConfigChangeEvent(type: string, previous?: any, current?: any, error?: any, data?: any): void;
}

// ---------------------------------------------------------------------------
// Schedule & Protocol (RADAR-Questionnaire compatible)
// ---------------------------------------------------------------------------

export interface MultiLanguageText {
  [lang: string]: string;
}

export interface TimeInterval {
  unit?: string;
  amount?: number;
}

export interface RepeatQuestionnaire {
  unit: string;
  unitsFromZero: number[];
}

export interface Reminder {
  offset: TimeInterval;
  notification?: ProtocolNotification;
}

export interface Reminders extends TimeInterval {
  repeat?: number;
}

export interface ProtocolNotification {
  title?: MultiLanguageText;
  text?: MultiLanguageText;
  vibrate?: boolean;
  sound?: boolean;
}

/** Schedule definition within an assessment (`protocol` field in each assessment entry). */
export interface AssessmentProtocol {
  notification?: ProtocolNotification;
  repeatProtocol: TimeInterval;
  repeatQuestionnaire: RepeatQuestionnaire;
  reminders?: Reminder[] | Reminders;
  completionWindow?: TimeInterval;
  referenceTimestamp?: string;
}

export interface QuestionnaireMetadata {
  repository?: string;
  name: string;
  avsc?: string;
  type?: string;
  format?: string;
}

/** A single assessment entry in the top-level `protocols` array. */
export interface AssessmentConfig {
  name: string;
  questionnaire?: QuestionnaireMetadata;
  estimatedCompletionTime?: number;
  protocol: AssessmentProtocol;
  startText?: MultiLanguageText;
  endText?: MultiLanguageText;
  warn?: MultiLanguageText;
  showIntroduction?: boolean;
  isDemo?: boolean;
  showInCalendar?: boolean;
  order?: number;
  requiresInClinicCompletion?: boolean;
}

/** Top-level protocol.json format (RADAR-Questionnaire compatible). */
export interface ProtocolConfig {
  version: string;
  schemaVersion?: string;
  name: string;
  healthIssues?: string[];
  protocols: AssessmentConfig[];
}

export type TaskInstanceState = 'pending' | 'completed' | 'skipped' | 'overdue' | 'expired';

export interface TaskInstance {
  /** Unique: `${name}_${timestamp}` */
  instanceId: string;
  /** Assessment name from protocol */
  name: string;
  /** Display title */
  title: string;
  /** Display description (from assessment startText or warn) */
  description: string;
  /** Epoch ms of the scheduled start time */
  timestamp: number;
  /** Completion window in ms */
  completionWindow: number;
  estimatedCompletionTime?: number;
  state: TaskInstanceState;
  /** ISO timestamp of last state change */
  stateChangedAt: string;
  showInCalendar: boolean;
  isDemo: boolean;
  order: number;
  warning?: string;
  syncedToServer: boolean;
  /**
   * Epoch ms the assessment's own `protocol.reminders` puts before `timestamp` (e.g.
   * `{ unit: "hour", amount: 2 }` → 2 hours before the task is due). `undefined` when the
   * assessment has no `reminders` configured. Computed once at generation time in
   * `ScheduleService.buildTasksForAssessment` — see `reminderOffsetMillis`.
   */
  reminderTimestamp?: number;
}

export interface ScheduleService {
  init(): Promise<void>;
  loadProtocol(protocol: ProtocolConfig, referenceTimestamp?: number): Promise<void>;
  getTasksForDate(date: Date): Promise<TaskInstance[]>;
  getTasksForRange(startDate: Date, endDate: Date): Promise<TaskInstance[]>;
  getUpcomingTasks(limit?: number): Promise<TaskInstance[]>;
  getPendingCount(): Promise<number>;
  completeTask(instanceId: string): Promise<TaskInstance>;
  skipTask(instanceId: string): Promise<TaskInstance>;
  refreshStates(): Promise<void>;
  toSDUITask(instance: TaskInstance): Task;
  destroy(): void;
}

export interface QuestionnaireDataService {
  /** Load questionnaire definitions for all assessments in a protocol. */
  loadDefinitions(protocol: ProtocolConfig, language?: string): Promise<void>;
  /** Register locally bundled questionnaire definitions. */
  registerBundled(assessmentName: string, questions: Question[]): void;
  /** Get questions for a specific assessment by name. */
  getQuestions(assessmentName: string): Promise<Question[]>;
  /** Submit completed questionnaire result. */
  submitResult(result: QuestionnaireResult): Promise<void>;
}
