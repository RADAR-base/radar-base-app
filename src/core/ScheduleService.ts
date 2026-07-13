import type {
  ScheduleService,
  ProtocolConfig,
  AssessmentConfig,
  TimeInterval,
  TaskInstance,
  TaskInstanceState,
  Task,
  Reminder,
  Reminders,
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
// How far ahead to generate task instances. Was 1 *year* — for a handful of daily/weekly
// protocols that's 300+ persisted instances after just one load, regenerated (and
// re-merged, see `mergeInstances`) on every app start. A rolling 2-week window is plenty
// for "today" + "upcoming" without the unbounded growth that was blowing past browser
// localStorage's quota (`QuotaExceededError`) after repeated reloads/protocol edits.
const DEFAULT_SCHEDULE_DAYS_COVERAGE = 14;
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

    // Diagnostic: confirms whether storage restore actually found anything, and how many
    // were already completed/skipped — if `restoredCompleted` is 0 right after a reload
    // where you'd completed tasks, the write in `persist()` didn't make it to storage.
    const restoredCompleted = (savedInstances ?? []).filter(
      (i) => i.state === 'completed' || i.state === 'skipped',
    ).length;
    console.log(
      `[ScheduleService] init: restored ${savedInstances?.length ?? 0} instance(s) (${restoredCompleted} completed/skipped), protocol=${savedProtocol ? 'found' : 'none'}`,
    );

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
    const before = this.instances.filter((i) => i.state === 'completed' || i.state === 'skipped').length;
    this.instances = mergeInstances(this.instances, generated);
    const after = this.instances.filter((i) => i.state === 'completed' || i.state === 'skipped').length;
    // Diagnostic: `after` should be >= `before` — if it drops, `mergeInstances` failed to
    // match up `instanceId`s against the freshly generated instances (e.g. because
    // `refTimestamp` came out different this run, producing different instanceIds).
    console.log(
      `[ScheduleService] loadProtocol: refTimestamp=${new Date(refTimestamp).toISOString()} generated=${generated.length} completed/skipped before=${before} after=${after}`,
    );

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
      reminderTimestamp: instance.reminderTimestamp,
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
    try {
      await this.storage.set(STORAGE_KEYS.INSTANCES, this.instances);
      // Diagnostic: confirms the write itself didn't throw. Doesn't prove the browser
      // actually committed it to disk (e.g. IndexedDB/localStorage quota or a web
      // AsyncStorage shim issue could still silently no-op), but rules out this code path
      // never running at all.
      console.log(`[ScheduleService] persist: wrote ${this.instances.length} instance(s)`);
    } catch (err) {
      console.log('[ScheduleService] persist FAILED:', err);
      throw err;
    }
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

  const { repeatProtocol: repeatP, repeatQuestionnaire: repeatQ, completionWindow: completionWindowInterval, reminders } = assessment.protocol;

  const completionWindow = completionWindowInterval
    ? timeIntervalToMillis(completionWindowInterval)
    : DEFAULT_COMPLETION_WINDOW_MS;
  const reminderOffsetMs = reminderOffsetMillis(reminders);

  let refTime = assessment.protocol.referenceTimestamp
    ? setDateTimeToMidnightEpoch(new Date(assessment.protocol.referenceTimestamp))
    : defaultRefTimestamp;

  const endTime = advanceRepeat(refTime, { unit: 'day', amount: DEFAULT_SCHEDULE_DAYS_COVERAGE });

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
        reminderTimestamp: reminderOffsetMs != null ? taskTime - reminderOffsetMs : undefined,
      });
    }

    if (!repeatP) break;
    refTime = advanceRepeat(refTime, repeatP);
  }

  // Only keep tasks whose window hasn't fully elapsed
  return tasks.filter(t => t.timestamp + t.completionWindow > today);
}

/** Merge newly generated instances with existing ones, preserving completed/skipped state. */
// How long to keep an `existing` instance around after it drops out of the freshly
// `generated` set (e.g. protocol.json changed, or it's aged past the generation window).
// Bounds storage growth — without this, every instance ever generated across every past
// `loadProtocol()` call stuck around forever, which is what silently grew to 300+
// persisted instances and blew past localStorage's quota on web.
const STALE_INSTANCE_RETENTION_MS = 2 * 86_400_000; // 2 days

function mergeInstances(existing: TaskInstance[], generated: TaskInstance[]): TaskInstance[] {
  const generatedIds = new Set(generated.map((i) => i.instanceId));
  const cutoff = Date.now() - STALE_INSTANCE_RETENTION_MS;

  const existingMap = new Map(
    existing
      .filter((inst) => generatedIds.has(inst.instanceId) || inst.timestamp >= cutoff)
      .map((i) => [i.instanceId, i]),
  );

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
      // Defensive fallback for an unrecognized interval unit — unrelated to how far ahead
      // the schedule generates (see `DEFAULT_SCHEDULE_DAYS_COVERAGE`), just a sane no-op-ish
      // advance so a malformed `TimeInterval` doesn't loop forever.
      return result.setFullYear(date.getFullYear() + 1);
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

/**
 * How far before the task's due time (`timestamp`) its reminder fires, in ms — e.g.
 * `{ unit: "hour", amount: 2 }` → 2 hours before. `assessment.protocol.reminders` is
 * either a single `Reminders` object (itself a `TimeInterval` — `protocol.json`'s actual
 * shape today) or a `Reminder[]` (each with its own `offset: TimeInterval`), in which
 * case the first entry's offset is used. `undefined` when no reminder is configured.
 */
function reminderOffsetMillis(reminders: Reminder[] | Reminders | undefined): number | undefined {
  if (!reminders) return undefined;
  const offset = Array.isArray(reminders) ? reminders[0]?.offset : reminders;
  return offset ? timeIntervalToMillis(offset) : undefined;
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
