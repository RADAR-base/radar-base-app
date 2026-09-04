import type {
  ScheduleService,
  ProtocolConfig,
  AssessmentConfig,
  TimeInterval,
  TaskInstance,
  TaskInstanceState,
  Task,
  StorageService,
  LoggerService,
  EventBus,
  AppServerService,
} from '../types';
import { EVENTS } from './EventBus';

const STORAGE_KEYS = {
  PROTOCOL: '@radarbase/schedule_protocol',
  INSTANCES: '@radarbase/schedule_instances',
};

const DEFAULT_COMPLETION_WINDOW_MS = 86_400_000; // 1 day
const DEFAULT_SCHEDULE_YEAR_COVERAGE = 1;
const REFRESH_INTERVAL_MS = 60_000;

export class DefaultScheduleService implements ScheduleService {
  private instances: TaskInstance[] = [];
  private protocol: ProtocolConfig | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(
    private readonly storage: StorageService,
    private readonly logger: LoggerService,
    private readonly bus: EventBus,
    private readonly appServer: AppServerService,
  ) {}

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const [savedProtocol, savedInstances] = await Promise.all([
      this.storage.get<ProtocolConfig>(STORAGE_KEYS.PROTOCOL),
      this.storage.get<TaskInstance[]>(STORAGE_KEYS.INSTANCES),
    ]);

    if (savedProtocol) this.protocol = savedProtocol;
    if (savedInstances) this.instances = savedInstances;

    this.refreshTimer = setInterval(() => this.refreshStates(), REFRESH_INTERVAL_MS);

    await this.refreshStates();
    this.bus.emit(EVENTS.SCHEDULE_UPDATED, { reason: 'initialized' });
    this.logger.log('ScheduleService initialized');
  }

  async loadProtocol(protocol: ProtocolConfig, referenceTimestamp?: number): Promise<void> {
    this.protocol = protocol;
    await this.storage.set(STORAGE_KEYS.PROTOCOL, protocol);

    const refTimestamp = referenceTimestamp ?? setDateTimeToMidnightEpoch(new Date());
    const generated = generateAllInstances(protocol, refTimestamp);
    this.instances = mergeInstances(this.instances, generated);

    await this.persist();
    await this.refreshStates();
    this.bus.emit(EVENTS.SCHEDULE_UPDATED, { reason: 'protocol_loaded' });
  }

  async getTasksForDate(date: Date): Promise<TaskInstance[]> {
    const dayStart = startOfDay(date).getTime();
    const dayEnd = endOfDay(date).getTime();
    return this.instances
      .filter(i => i.timestamp >= dayStart && i.timestamp <= dayEnd)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async getTasksForRange(startDate: Date, endDate: Date): Promise<TaskInstance[]> {
    const rangeStart = startOfDay(startDate).getTime();
    const rangeEnd = endOfDay(endDate).getTime();
    return this.instances
      .filter(i => i.timestamp >= rangeStart && i.timestamp <= rangeEnd)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async getUpcomingTasks(limit = 10): Promise<TaskInstance[]> {
    const now = Date.now();
    return this.instances
      .filter(i => i.timestamp >= now && (i.state === 'pending' || i.state === 'overdue'))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, limit);
  }

  async getPendingCount(): Promise<number> {
    const todayStart = startOfDay(new Date()).getTime();
    const todayEnd = endOfDay(new Date()).getTime();
    return this.instances.filter(
      i => i.timestamp >= todayStart && i.timestamp <= todayEnd
        && (i.state === 'pending' || i.state === 'overdue'),
    ).length;
  }

  async completeTask(instanceId: string): Promise<TaskInstance> {
    const instance = this.instances.find(i => i.instanceId === instanceId);
    if (!instance) throw new Error(`Task instance not found: ${instanceId}`);

    instance.state = 'completed';
    instance.stateChangedAt = new Date().toISOString();

    await this.persist();
    this.bus.emit(EVENTS.TASK_COMPLETED, { instanceId, name: instance.name });
    this.bus.emit(EVENTS.SCHEDULE_UPDATED, { reason: 'task_completed' });

    this.syncTaskState(instance);

    return instance;
  }

  async skipTask(instanceId: string): Promise<TaskInstance> {
    const instance = this.instances.find(i => i.instanceId === instanceId);
    if (!instance) throw new Error(`Task instance not found: ${instanceId}`);

    instance.state = 'skipped';
    instance.stateChangedAt = new Date().toISOString();

    await this.persist();
    this.bus.emit(EVENTS.TASK_SKIPPED, { instanceId, name: instance.name });
    this.bus.emit(EVENTS.SCHEDULE_UPDATED, { reason: 'task_skipped' });

    this.syncTaskState(instance);

    return instance;
  }

  async refreshStates(): Promise<void> {
    const now = Date.now();
    let changed = false;

    for (const instance of this.instances) {
      if (instance.state !== 'pending') continue;

      const expiresAt = instance.timestamp + instance.completionWindow;
      if (now > expiresAt) {
        instance.state = 'expired';
        instance.stateChangedAt = new Date().toISOString();
        changed = true;
      } else if (now > instance.timestamp) {
        instance.state = 'overdue';
        instance.stateChangedAt = new Date().toISOString();
        changed = true;
        this.bus.emit(EVENTS.TASK_OVERDUE, { instanceId: instance.instanceId, name: instance.name });
      }
    }

    if (changed) {
      await this.persist();
      this.bus.emit(EVENTS.SCHEDULE_UPDATED, { reason: 'states_refreshed' });
    }
  }

  toSDUITask(instance: TaskInstance): Task {
    const statusMap: Record<TaskInstanceState, Task['status']> = {
      pending: 'pending',
      completed: 'completed',
      skipped: 'completed',
      overdue: 'overdue',
      expired: 'overdue',
    };
    return {
      id: instance.instanceId,
      title: instance.title,
      description: instance.description,
      dueTime: formatTime(instance.timestamp),
      estimated_minutes: instance.estimatedCompletionTime ?? 0,
      status: statusMap[instance.state],
      timestamp: instance.timestamp,
      completionWindow: instance.completionWindow,
      completed: instance.state === 'completed',
    };
  }

  destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async persist(): Promise<void> {
    await this.storage.set(STORAGE_KEYS.INSTANCES, this.instances);
  }

  private syncTaskState(instance: TaskInstance): void {
    this.appServer.updateTaskState(instance.instanceId, instance.state)
      .then(() => { instance.syncedToServer = true; })
      .catch(() => { instance.syncedToServer = false; });
  }
}

// ---------------------------------------------------------------------------
// Pure helpers — RADAR-Questionnaire compatible schedule generation
// ---------------------------------------------------------------------------

function generateAllInstances(
  protocol: ProtocolConfig,
  defaultRefTimestamp: number,
): TaskInstance[] {
  const instances: TaskInstance[] = [];
  let indexOffset = 0;

  for (const assessment of protocol.protocols) {
    const tasks = buildTasksForAssessment(assessment, indexOffset, defaultRefTimestamp);
    instances.push(...tasks);
    indexOffset += tasks.length;
  }

  return instances;
}

/**
 * Mirrors RADAR-Questionnaire `ScheduleGeneratorService.buildTasksForSingleAssessment`.
 *
 * 1. Compute refTime from assessment's referenceTimestamp or use the default (enrollment midnight).
 * 2. Compute endTime by advancing refTime by SCHEDULE_YEAR_COVERAGE years.
 * 3. Outer loop: while refTime <= endTime, advance by repeatProtocol.
 * 4. Inner loop: for each offset in repeatQuestionnaire.unitsFromZero, create a task at
 *    `advanceRepeat(refTime, { unit: repeatQ.unit, amount: offset })`.
 * 5. Filter: only keep tasks where timestamp + completionWindow > today.
 */
function buildTasksForAssessment(
  assessment: AssessmentConfig,
  indexOffset: number,
  defaultRefTimestamp: number,
): TaskInstance[] {
  const tasks: TaskInstance[] = [];
  const today = setDateTimeToMidnightEpoch(new Date());

  const { repeatProtocol: repeatP, repeatQuestionnaire: repeatQ, completionWindow: completionWindowInterval } = assessment.protocol;

  const completionWindow = completionWindowInterval
    ? timeIntervalToMillis(completionWindowInterval)
    : DEFAULT_COMPLETION_WINDOW_MS;

  let refTime = assessment.protocol.referenceTimestamp
    ? setDateTimeToMidnightEpoch(new Date(assessment.protocol.referenceTimestamp))
    : defaultRefTimestamp;

  const endTime = advanceRepeat(refTime, { unit: 'year', amount: DEFAULT_SCHEDULE_YEAR_COVERAGE });

  const title = assessment.name;
  const description = chooseText(assessment.startText) || chooseText(assessment.warn) || '';

  while (refTime <= endTime) {
    for (const amount of repeatQ.unitsFromZero) {
      const taskTime = advanceRepeat(refTime, { unit: repeatQ.unit, amount });

      tasks.push({
        instanceId: `${assessment.name}_${taskTime}`,
        name: assessment.name,
        title,
        description,
        timestamp: taskTime,
        completionWindow,
        estimatedCompletionTime: assessment.estimatedCompletionTime,
        state: 'pending',
        stateChangedAt: new Date().toISOString(),
        showInCalendar: assessment.showInCalendar ?? true,
        isDemo: assessment.isDemo ?? false,
        order: assessment.order ?? (indexOffset + tasks.length),
        warning: chooseText(assessment.warn),
        syncedToServer: false,
      });
    }

    if (!repeatP) break;
    refTime = advanceRepeat(refTime, repeatP);
  }

  // Only keep tasks whose window hasn't fully elapsed
  return tasks.filter(t => t.timestamp + t.completionWindow > today);
}

/** Merge newly generated instances with existing ones, preserving completed/skipped state. */
function mergeInstances(existing: TaskInstance[], generated: TaskInstance[]): TaskInstance[] {
  const existingMap = new Map(existing.map(i => [i.instanceId, i]));

  for (const inst of generated) {
    const prev = existingMap.get(inst.instanceId);
    if (prev && (prev.state === 'completed' || prev.state === 'skipped')) {
      continue;
    }
    existingMap.set(inst.instanceId, inst);
  }

  return Array.from(existingMap.values());
}

/**
 * Advance a timestamp by an interval — mirrors RADAR-Questionnaire's `advanceRepeat`.
 * Handles: min, hour, day, week, month, year.
 */
function advanceRepeat(timestamp: number, interval: TimeInterval): number {
  const date = new Date(timestamp);
  const result = new Date(timestamp);
  switch (interval.unit) {
    case 'min':
      return result.setMinutes(date.getMinutes() + (interval.amount ?? 0));
    case 'hour':
      return result.setHours(date.getHours() + (interval.amount ?? 0));
    case 'day':
      return result.setDate(date.getDate() + (interval.amount ?? 0));
    case 'week':
      return result.setDate(date.getDate() + (interval.amount ?? 0) * 7);
    case 'month':
      return result.setMonth(date.getMonth() + (interval.amount ?? 0));
    case 'year':
      return result.setFullYear(date.getFullYear() + (interval.amount ?? 0));
    default:
      return result.setFullYear(date.getFullYear() + DEFAULT_SCHEDULE_YEAR_COVERAGE);
  }
}

/** Convert a TimeInterval to milliseconds (approximate, matching RADAR-Questionnaire). */
function timeIntervalToMillis(interval: TimeInterval): number {
  const MILLIS: Record<string, number> = {
    min: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_678_400_000,  // 31 days
    year: 31_536_000_000,  // 365 days
  };
  const unit = interval.unit && interval.unit in MILLIS ? interval.unit : 'day';
  const amount = interval.amount ?? 1;
  return amount * MILLIS[unit];
}

function setDateTimeToMidnightEpoch(date: Date): number {
  return new Date(date).setHours(0, 0, 0, 0);
}

/** Pick the English text from a MultiLanguageText, or first available. */
function chooseText(text?: Record<string, string>): string | undefined {
  if (!text) return undefined;
  if (text.en) return text.en;
  const values = Object.values(text).filter(Boolean);
  return values[0] || undefined;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const scheduleServiceFactory = (deps: {
  storage: StorageService;
  logger: LoggerService;
  eventBus: EventBus;
  appServer: AppServerService;
}) => new DefaultScheduleService(
  deps.storage,
  deps.logger,
  deps.eventBus,
  deps.appServer,
);
