import { AppState, type NativeEventSubscription } from 'react-native';
import type {
  ScheduleService,
  Task,
  TaskState,
  TaskView,
  StorageService,
  LoggerService,
  EventBus,
  AppServerService,
} from '../types';
import { EVENTS } from './EventBus';

export const STORAGE_KEYS = {
  INSTANCES: '@radarbase/schedule_instances',
  OPENED: '@radarbase/schedule_opened_tasks',
  ACTIVE_DAYS: '@radarbase/schedule_active_days',
  NOTIFIED_READY: '@radarbase/schedule_notified_ready',
};

const REFRESH_INTERVAL_MS = 60_000;
const REFETCH_INTERVAL_MS = 15 * 60_000; // 15 minutes

/**
 * Abstract schedule service — owns task state management, storage, refresh timer,
 * and UI helpers. Subclasses implement `fetchSchedule()` to define how the schedule
 * is obtained (appserver, local generation, etc.).
 *
 * Modelled after RADAR-Questionnaire's `ScheduleService` abstract class.
 */
export abstract class ScheduleServiceBase implements ScheduleService {
  protected tasks: Task[] = [];
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private refetchTimer: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: NativeEventSubscription | null = null;
  private lastAppState: string = AppState.currentState;
  private initialized = false;
  private openedTaskIds = new Set<string>();
  private activeDays = new Set<string>();
  private notifiedReadyIds = new Set<string>();

  constructor(
    protected readonly storage: StorageService,
    protected readonly logger: LoggerService,
    protected readonly bus: EventBus,
    protected readonly appServer: AppServerService,
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const [savedTasks, savedOpened, savedActiveDays, savedNotifiedReady] =
      await Promise.all([
        this.storage.get<Task[]>(STORAGE_KEYS.INSTANCES),
        this.storage.get<string[]>(STORAGE_KEYS.OPENED),
        this.storage.get<string[]>(STORAGE_KEYS.ACTIVE_DAYS),
        this.storage.get<string[]>(STORAGE_KEYS.NOTIFIED_READY),
      ]);

    if (savedTasks) this.tasks = savedTasks;
    if (savedOpened) this.openedTaskIds = new Set(savedOpened);
    if (savedActiveDays) this.activeDays = new Set(savedActiveDays);
    if (savedNotifiedReady) this.notifiedReadyIds = new Set(savedNotifiedReady);

    const restoredCompleted = (savedTasks ?? []).filter(
      (t) => t.state === 'completed' || t.state === 'skipped',
    ).length;
    console.log(
      `[ScheduleService] init: restored ${savedTasks?.length ?? 0} task(s) (${restoredCompleted} completed/skipped)`,
    );

    this.refreshTimer = setInterval(() => this.refreshStates(), REFRESH_INTERVAL_MS);
    this.refetchTimer = setInterval(() => this.fetchSchedule(), REFETCH_INTERVAL_MS);

    // Re-fetch schedule when app returns to foreground
    this.appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (this.lastAppState.match(/inactive|background/) && nextState === 'active') {
        this.fetchSchedule();
      }
      this.lastAppState = nextState;
    });

    await this.refreshStates();
    this.bus.emit(EVENTS.SCHEDULE_UPDATED, { reason: 'initialized' });
    this.logger.log('ScheduleService initialized');
  }

  /** Subclasses implement this to fetch/generate the schedule. */
  abstract fetchSchedule(): Promise<void>;

  destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.refetchTimer) {
      clearInterval(this.refetchTimer);
      this.refetchTimer = null;
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Queries — all operate on the local cache
  // ---------------------------------------------------------------------------

  async getTasksForDate(date: Date): Promise<Task[]> {
    const dayStart = startOfDay(date).getTime();
    const dayEnd = endOfDay(date).getTime();
    return this.tasks
      .filter(t => t.timestamp >= dayStart && t.timestamp <= dayEnd)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async getTasksForRange(startDate: Date, endDate: Date): Promise<Task[]> {
    const rangeStart = startOfDay(startDate).getTime();
    const rangeEnd = endOfDay(endDate).getTime();
    return this.tasks
      .filter(t => t.timestamp >= rangeStart && t.timestamp <= rangeEnd)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async getUpcomingTasks(limit = 10): Promise<Task[]> {
    const now = Date.now();
    return this.tasks
      .filter(t => t.timestamp >= now && (t.state === 'pending' || t.state === 'overdue'))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, limit);
  }

  async getPendingCount(): Promise<number> {
    const todayStart = startOfDay(new Date()).getTime();
    const todayEnd = endOfDay(new Date()).getTime();
    return this.tasks.filter(
      t => t.timestamp >= todayStart && t.timestamp <= todayEnd
        && (t.state === 'pending' || t.state === 'overdue'),
    ).length;
  }

  getActiveDaysCount(): number {
    return this.activeDays.size;
  }

  // ---------------------------------------------------------------------------
  // Task state mutations
  // ---------------------------------------------------------------------------

  /** A task can only be started once its timestamp has passed and its completion window is still open. */
  isTaskStartable(task: Task): boolean {
    const now = Date.now();
    return task.timestamp <= now && !this.isTaskExpired(task);
  }

  /** A task is expired when its completion window has elapsed or it's already completed. */
  isTaskExpired(task: Task): boolean {
    return task.timestamp + task.completionWindow < Date.now() || task.completed;
  }

  async completeTask(taskId: string): Promise<Task> {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.state === 'expired') throw new Error(`Task expired: ${taskId}`);
    if (task.timestamp > Date.now()) throw new Error(`Task not yet available: ${taskId}`);

    task.state = 'completed';
    task.completed = true;
    task.timeCompleted = Date.now();
    task.stateChangedAt = new Date().toISOString();

    const now = new Date();
    const dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    if (!this.activeDays.has(dayKey)) {
      this.activeDays.add(dayKey);
      await this.storage.set(STORAGE_KEYS.ACTIVE_DAYS, [...this.activeDays]);
    }

    await this.persist();
    this.bus.emit(EVENTS.TASK_COMPLETED, { taskId, name: task.name });
    this.bus.emit(EVENTS.SCHEDULE_UPDATED, { reason: 'task_completed' });

    this.syncTaskState(task);

    return task;
  }

  async skipTask(taskId: string): Promise<Task> {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.state === 'expired') throw new Error(`Task expired: ${taskId}`);

    task.state = 'skipped';
    task.stateChangedAt = new Date().toISOString();

    await this.persist();
    this.bus.emit(EVENTS.TASK_SKIPPED, { taskId, name: task.name });
    this.bus.emit(EVENTS.SCHEDULE_UPDATED, { reason: 'task_skipped' });

    this.syncTaskState(task);

    return task;
  }

  // ---------------------------------------------------------------------------
  // State refresh — 60s timer for pending -> overdue -> expired transitions
  // ---------------------------------------------------------------------------

  async refreshStates(): Promise<void> {
    const now = Date.now();
    let changed = false;
    let readyChanged = false;

    for (const task of this.tasks) {
      const expiresAt = task.timestamp + task.completionWindow;

      if (
        task.state !== 'completed' &&
        task.state !== 'skipped' &&
        now >= task.timestamp &&
        now < expiresAt &&
        !this.notifiedReadyIds.has(task.id)
      ) {
        this.notifiedReadyIds.add(task.id);
        readyChanged = true;
        this.bus.emit(EVENTS.TASK_READY, {
          taskId: task.id,
          name: task.name,
          title: task.title,
          timestamp: task.timestamp,
        });
      }

      if (task.state !== 'pending') continue;

      if (now > expiresAt) {
        task.state = 'expired';
        task.stateChangedAt = new Date().toISOString();
        changed = true;
      } else if (now > task.timestamp) {
        task.state = 'overdue';
        task.stateChangedAt = new Date().toISOString();
        changed = true;
        this.bus.emit(EVENTS.TASK_OVERDUE, { taskId: task.id, name: task.name });
      }
    }

    if (readyChanged) {
      await this.storage.set(STORAGE_KEYS.NOTIFIED_READY, [...this.notifiedReadyIds]);
    }

    if (changed) {
      await this.persist();
      this.bus.emit(EVENTS.SCHEDULE_UPDATED, { reason: 'states_refreshed' });
    }
  }

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------

  toTaskView(task: Task): TaskView {
    const statusMap: Record<TaskState, TaskView['status']> = {
      pending: 'pending',
      completed: 'completed',
      skipped: 'completed',
      overdue: 'overdue',
      expired: 'overdue',
    };
    return {
      id: task.id,
      assessmentName: task.name,
      title: task.title,
      description: task.description,
      dueTime: formatTime(task.timestamp),
      estimated_minutes: task.estimatedCompletionTime ?? 0,
      nQuestions: task.nQuestions,
      status: statusMap[task.state],
      timestamp: task.timestamp,
      completionWindow: task.completionWindow,
      completed: task.completed,
      reminderTimestamp: task.reminderTimestamp,
      isNew: !this.openedTaskIds.has(task.id),
      iconUrl: task.icon,
    };
  }

  async markTaskOpened(taskId: string): Promise<void> {
    if (this.openedTaskIds.has(taskId)) return;
    this.openedTaskIds.add(taskId);
    await this.storage.set(STORAGE_KEYS.OPENED, [...this.openedTaskIds]);
    this.bus.emit(EVENTS.SCHEDULE_UPDATED, { reason: 'task-opened' });
  }

  // ---------------------------------------------------------------------------
  // Protected helpers — available to subclasses
  // ---------------------------------------------------------------------------

  protected async persist(): Promise<void> {
    try {
      await this.storage.set(STORAGE_KEYS.INSTANCES, this.tasks);
      console.log(`[ScheduleService] persist: wrote ${this.tasks.length} task(s)`);
    } catch (err) {
      console.log('[ScheduleService] persist FAILED:', err);
      throw err;
    }
  }

  protected syncTaskState(task: Task): void {
    this.appServer.updateTaskState(task.id, task.state.toUpperCase())
      .then(() => { task.reportedCompletion = true; })
      .catch(() => { task.reportedCompletion = false; });
  }

  /** Prune the opened/notified tracking sets to only include live task ids. */
  protected async pruneTrackingSets(): Promise<void> {
    const liveIds = new Set(this.tasks.map(t => t.id));
    const prunedOpened = [...this.openedTaskIds].filter(id => liveIds.has(id));
    if (prunedOpened.length !== this.openedTaskIds.size) {
      this.openedTaskIds = new Set(prunedOpened);
      await this.storage.set(STORAGE_KEYS.OPENED, prunedOpened);
    }
    const prunedReady = [...this.notifiedReadyIds].filter(id => liveIds.has(id));
    if (prunedReady.length !== this.notifiedReadyIds.size) {
      this.notifiedReadyIds = new Set(prunedReady);
      await this.storage.set(STORAGE_KEYS.NOTIFIED_READY, prunedReady);
    }
  }
}

// ---------------------------------------------------------------------------
// Date/time helpers
// ---------------------------------------------------------------------------

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
