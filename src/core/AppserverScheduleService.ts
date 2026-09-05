import type {
  Task,
  TaskState,
  ProtocolConfig,
  AssessmentConfig,
  StorageService,
  LoggerService,
  EventBus,
  AppServerService,
  QuestionnaireDataService,
} from '../types';
import { EVENTS } from './EventBus';
import { ScheduleServiceBase } from './ScheduleService';

const FETCH_TIMEOUT_MS = 8_000;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const PROTOCOL_VERSION_KEY = '@radarbase/protocol_version';
const PROTOCOL_CACHE_KEY = '@radarbase/protocol';

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = MAX_RETRY_ATTEMPTS,
  baseDelay = RETRY_BASE_DELAY_MS,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

/**
 * Appserver-driven schedule service — fetches the protocol and schedule from
 * the RADAR appserver and caches locally. The protocol provides the assessment
 * catalog (questionnaire repo URLs, metadata); `QuestionnaireDataService` then
 * fetches the actual questionnaire definitions from GitHub. Falls back to the
 * cached data if the server is unreachable.
 *
 * Extends `ScheduleServiceBase` which provides all common state management
 * (refresh timer, state transitions, storage, UI helpers).
 */
export class AppserverScheduleService extends ScheduleServiceBase {
  private cachedProtocolVersion: string | null = null;
  private assessmentMap = new Map<string, AssessmentConfig>();

  constructor(
    storage: StorageService,
    logger: LoggerService,
    bus: EventBus,
    appServer: AppServerService,
    private readonly questionnaireData: QuestionnaireDataService,
  ) {
    super(storage, logger, bus, appServer);
  }

  async fetchSchedule(): Promise<void> {
    // 1. Fetch protocol (assessment catalog) — drives questionnaire definitions
    await this.fetchProtocol();

    // 2. Fetch task schedule from appserver
    await this.fetchTaskSchedule();

    await this.pruneTrackingSets();
    await this.persist();
    await this.refreshStates();
    this.bus.emit(EVENTS.SCHEDULE_UPDATED, { reason: 'schedule_fetched' });
  }

  // ---------------------------------------------------------------------------
  // Protocol fetch — loads assessment catalog + questionnaire definitions
  // ---------------------------------------------------------------------------

  private async fetchProtocol(): Promise<void> {
    try {
      const protocol: ProtocolConfig = await retryWithBackoff(() => {
        const fetchProtocol = this.appServer.getProtocol();
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Protocol fetch timed out')), FETCH_TIMEOUT_MS),
        );
        return Promise.race([fetchProtocol, timeout]);
      });

      // Skip questionnaire re-fetch if protocol version hasn't changed
      if (!this.cachedProtocolVersion) {
        this.cachedProtocolVersion = await this.storage.get<string>(PROTOCOL_VERSION_KEY);
      }
      const versionChanged = protocol.version !== this.cachedProtocolVersion;

      // Build assessment lookup map
      this.assessmentMap.clear();
      for (const assessment of protocol.protocols ?? []) {
        if (assessment.name) this.assessmentMap.set(assessment.name, assessment);
      }

      if (versionChanged) {
        await this.questionnaireData.loadDefinitions(protocol);
        this.cachedProtocolVersion = protocol.version;
        await this.storage.set(PROTOCOL_VERSION_KEY, protocol.version);
        await this.storage.set(PROTOCOL_CACHE_KEY, protocol);
        this.logger.log(`Protocol updated to version ${protocol.version}, loaded ${this.assessmentMap.size} assessments`);
      } else {
        this.logger.log(`Protocol version ${protocol.version} unchanged, skipping definition fetch`);
      }
    } catch (e) {
      this.logger.log('Failed to fetch protocol after retries, using cache: ' + e);
      // Restore assessment map from cached protocol
      const cached = await this.storage.get<ProtocolConfig>(PROTOCOL_CACHE_KEY);
      if (cached?.protocols) {
        this.assessmentMap.clear();
        for (const assessment of cached.protocols) {
          if (assessment.name) this.assessmentMap.set(assessment.name, assessment);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Schedule fetch — loads task instances and enriches with assessment metadata
  // ---------------------------------------------------------------------------

  private async fetchTaskSchedule(): Promise<void> {
    try {
      const fetched = await retryWithBackoff(() => {
        const fetchFromServer = this.appServer.getSchedule()
          .then((tasks: any[]) => (tasks || []).map((t) => mapServerTask(t, this.assessmentMap)));
        const timeout = new Promise<Task[]>((_, reject) =>
          setTimeout(() => reject(new Error('Schedule fetch timed out')), FETCH_TIMEOUT_MS),
        );
        return Promise.race([fetchFromServer, timeout]);
      });
      // TODO: remove once server-side duplicate issue is fixed
      const deduped = deduplicateTasks(fetched);
      this.tasks = mergeWithServer(this.tasks, deduped);
      console.log(
        `[AppserverScheduleService] fetchSchedule: ${fetched.length} task(s) fetched`,
      );
    } catch (e) {
      this.logger.log('Failed to fetch schedule from appserver after retries, using cache: ' + e);
    }
  }
}

// ---------------------------------------------------------------------------
// Server task mapping
// ---------------------------------------------------------------------------

function mapServerTask(task: any, assessments: Map<string, AssessmentConfig>): Task {
  const timestamp = task.timestamp || 0;
  const completionWindow = task.completionWindow || 86_400_000;
  const name = task.name || '';
  const assessment = assessments.get(name);

  let state: TaskState = 'pending';
  if (task.completed || task.state === 'COMPLETED') {
    state = 'completed';
  }

  return {
    id: String(task.id ?? `${name}_${timestamp}`),
    name,
    title: name,
    description: task.description || '',
    timestamp,
    completionWindow,
    estimatedCompletionTime: assessment?.estimatedCompletionTime ?? task.estimatedCompletionTime,
    nQuestions: assessment?.nQuestions ?? task.nQuestions,
    state,
    completed: state === 'completed',
    reportedCompletion: state === 'completed',
    timeCompleted: task.timeCompleted,
    stateChangedAt: new Date().toISOString(),
    showInCalendar: assessment?.showInCalendar ?? task.showInCalendar ?? true,
    isDemo: assessment?.isDemo ?? task.isDemo ?? false,
    order: assessment?.order ?? task.order ?? 0,
    warning: task.warning,
    icon: assessment?.icon ?? task.icon,
    reminderTimestamp: task.reminderTimestamp,
    requiresInClinicCompletion: task.requiresInClinicCompletion ?? false,
    notifications: task.notifications || [],
  };
}

/**
 * Merge server-fetched tasks with locally cached tasks.
 * Server is authoritative, but locally completed/skipped tasks are preserved
 * if the server hasn't caught up yet (async sync race).
 */
/** Workaround: server sometimes returns duplicate entries for the same task. Remove once fixed. */
function deduplicateTasks(tasks: Task[]): Task[] {
  const seen = new Set<string>();
  return tasks.filter(t => {
    const key = `${t.name}:${t.timestamp}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeWithServer(existing: Task[], fetched: Task[]): Task[] {
  const existingMap = new Map(existing.map(t => [t.id, t]));

  return fetched.map(serverTask => {
    const local = existingMap.get(serverTask.id);
    if (
      local &&
      (local.state === 'completed' || local.state === 'skipped') &&
      serverTask.state === 'pending'
    ) {
      return local;
    }
    return serverTask;
  });
}

// ---------------------------------------------------------------------------
// Factory — default schedule service is appserver-driven
// ---------------------------------------------------------------------------

export const scheduleServiceFactory = (deps: {
  storage: StorageService;
  logger: LoggerService;
  eventBus: EventBus;
  appServer: AppServerService;
  questionnaireData: QuestionnaireDataService;
}) => new AppserverScheduleService(
  deps.storage,
  deps.logger,
  deps.eventBus,
  deps.appServer,
  deps.questionnaireData,
);
