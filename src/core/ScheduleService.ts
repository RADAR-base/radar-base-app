import { AppState, type NativeEventSubscription } from 'react-native';
import type {
  DayVerdict,
  StreakDay,
  StreakRisk,
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

/** Days on the streak strip: today and the five before it. See `getStreakWeek`. */
export const STREAK_WINDOW_DAYS = 6;

export const STORAGE_KEYS = {
  INSTANCES: '@radarbase/schedule_instances',
  OPENED: '@radarbase/schedule_opened_tasks',
  ACTIVE_DAYS: '@radarbase/schedule_active_days',
  DAY_VERDICTS: '@radarbase/schedule_day_verdicts',
  STREAK_PROMPT: '@radarbase/schedule_streak_prompt_day',
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
  /**
   * What each past day came to, by day key — the streak's only memory.
   *
   * Recorded as days settle rather than derived on demand, because it cannot be derived later:
   * `mergeWithServer` replaces the task list with exactly what the server returned, so a task the
   * server stops sending is gone from `this.tasks` and with it any record of what was *scheduled*
   * that day. A verdict, once written, is permanent.
   */
  private dayVerdicts = new Map<string, DayVerdict>();
  /** The day the streak prompt was last shown, so it can be shown once a day — see `claimStreakPrompt`. */
  private streakPromptDay: string | null = null;
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

    const [
      savedTasks,
      savedOpened,
      savedActiveDays,
      savedNotifiedReady,
      savedVerdicts,
      savedPromptDay,
    ] =
      await Promise.all([
        this.storage.get<Task[]>(STORAGE_KEYS.INSTANCES),
        this.storage.get<string[]>(STORAGE_KEYS.OPENED),
        this.storage.get<string[]>(STORAGE_KEYS.ACTIVE_DAYS),
        this.storage.get<string[]>(STORAGE_KEYS.NOTIFIED_READY),
        this.storage.get<Record<string, DayVerdict>>(STORAGE_KEYS.DAY_VERDICTS),
        this.storage.get<string>(STORAGE_KEYS.STREAK_PROMPT),
      ]);

    if (savedTasks) this.tasks = savedTasks;
    if (savedOpened) this.openedTaskIds = new Set(savedOpened);
    if (savedActiveDays) this.activeDays = new Set(savedActiveDays);
    if (savedNotifiedReady) this.notifiedReadyIds = new Set(savedNotifiedReady);
    if (savedVerdicts) this.dayVerdicts = new Map(Object.entries(savedVerdicts));
    if (savedPromptDay) this.streakPromptDay = savedPromptDay;

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
    // Reset all state so the next init() starts fresh (e.g. after sign-out + re-login).
    this.initialized = false;
    this.tasks = [];
    this.openedTaskIds.clear();
    this.activeDays.clear();
    this.dayVerdicts.clear();
    this.streakPromptDay = null;
    this.notifiedReadyIds.clear();
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
      .filter(t => {
        if (t.state !== 'pending' && t.state !== 'overdue') return false;
        const expiresAt = t.timestamp + t.completionWindow;
        // Include future tasks and currently-active tasks (not yet expired)
        return expiresAt > now;
      })
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, limit);
  }

  async getPendingCount(): Promise<number> {
    const now = Date.now();
    return this.tasks.filter(t => {
      const expiresAt = t.timestamp + t.completionWindow;
      return t.timestamp <= now && expiresAt > now
        && (t.state === 'pending' || t.state === 'overdue');
    }).length;
  }

  getActiveDaysCount(): number {
    return this.activeDays.size;
  }

  /**
   * Completed against everything still worth doing — whatever day it falls on.
   *
   * The day-scoped count answers "what is left today", which goes quiet the moment today is clear
   * even when the week ahead is full. This answers "what is left at all": every task whose window is
   * still open, plus the ones already done, so the ring fills as the participant works through them.
   *
   * Tasks whose window has closed unfinished are left out of both numbers. Counting them would mean
   * a ring that can never fill, which reads as the participant being permanently behind on work they
   * can no longer do anything about.
   */
  getOpenTaskCounts(): { completed: number; total: number } {
    const now = Date.now();
    let completed = 0;
    let open = 0;
    for (const task of this.tasks) {
      if (task.state === 'completed') completed += 1;
      else if (!isTerminal(task.state) && task.timestamp + task.completionWindow > now) open += 1;
    }
    return { completed, total: completed + open };
  }

  // ---------------------------------------------------------------------------
  // Streaks
  // ---------------------------------------------------------------------------

  /**
   * How one day's tasks count toward the streak, or `null` while the day could still go either way.
   *
   * **Complete** when every task scheduled for it has been completed. **Missed** once every one of
   * them has reached a terminal state or run out of time, with at least one not completed. Otherwise
   * *pending*: someone who still has time to act has not missed anything yet.
   *
   * A day nothing was scheduled on has no tasks and so no status — it is not a day anyone lost.
   */
  private streakStatusForTasks(tasks: Task[]): DayVerdict | null {
    if (tasks.length === 0) return null;
    if (tasks.every(t => t.state === 'completed')) return 'complete';
    const now = Date.now();
    const settled = tasks.every(
      t => isTerminal(t.state) || t.timestamp + t.completionWindow <= now,
    );
    return settled ? 'missed' : null;
  }

  /** Every task scheduled for the local day starting at `dayStart`. */
  private tasksForDay(dayStart: number): Task[] {
    return this.tasks.filter(t => startOfDay(new Date(t.timestamp)).getTime() === dayStart);
  }

  /**
   * Record a status for every day that is **over** and has reached one, and return whether anything
   * changed.
   *
   * Only days already past get written down, for two reasons that both used to inflate the streak:
   *
   *  - A day still to come was judged like any other. A task dated tomorrow that arrived already
   *    completed settled *tomorrow* as complete, and the streak counted a day that had not happened.
   *  - A day was settled against whatever tasks had arrived *so far*. A sync that delivered part of a
   *    day, cleared by the participant, wrote `complete` permanently — and the rest of that day,
   *    arriving later and expiring unanswered, could never take it back.
   *
   * Waiting until the day is over costs nothing, because today is not read from here at all: it is
   * computed live by `streakStatusForDay`, so completing the day's last task still moves the counter
   * at once.
   *
   * Runs on every schedule change. A recorded status is revised in exactly one direction — `complete`
   * down to `missed`, when a day settled on a partial view of itself is later seen to hold a task that
   * was never finished. Nothing promotes a day back up: a day whose tasks stop being sent has gone
   * quiet, not been completed, and that is what keeps the streak stable as the server's task window
   * rolls forward and old tasks drop out of it.
   */
  private async settleDays(): Promise<boolean> {
    const todayStart = startOfDay(new Date()).getTime();
    const byDay = new Map<string, Task[]>();
    for (const task of this.tasks) {
      const key = dayKey(new Date(task.timestamp));
      const list = byDay.get(key);
      if (list) list.push(task);
      else byDay.set(key, [task]);
    }

    let changed = false;
    for (const [key, tasks] of byDay) {
      // Today and anything after it: not this method's business — see the note above.
      const date = dayKeyToDate(key);
      if (!date || date.getTime() >= todayStart) continue;

      const status = this.streakStatusForTasks(tasks);
      if (!status) continue;

      const recorded = this.dayVerdicts.get(key);
      if (recorded === status) continue;
      // A day recorded `complete` whose tasks now show one of them was never finished was settled on
      // a partial view of it — the server had not sent the rest yet. Correcting that is the one
      // revision allowed, and only ever downwards: `complete` is the claim the missing evidence could
      // make falsely, so seeing an unfinished task is grounds to withdraw it. The reverse is not true.
      // A `missed` day going quiet means the server stopped sending its tasks, not that they were
      // done, so nothing may promote a day back up.
      if (recorded !== undefined && !(recorded === 'complete' && status === 'missed')) continue;

      this.dayVerdicts.set(key, status);
      changed = true;
    }

    if (changed) {
      await this.storage.set(
        STORAGE_KEYS.DAY_VERDICTS,
        Object.fromEntries(this.dayVerdicts),
      );
    }
    return changed;
  }

  /**
   * One day's streak status: recorded for a day that is over, computed live for today.
   *
   * The single place that decides, so the strip and the count can't disagree about what today is.
   * Today is deliberately not read from `dayVerdicts` even when an entry exists — an install that
   * settled today under the previous rule has one, and the live answer is the better of the two.
   */
  private streakStatusForDay(dayStart: number): DayVerdict | null {
    const todayStart = startOfDay(new Date()).getTime();
    if (dayStart === todayStart) return this.streakStatusForTasks(this.tasksForDay(dayStart));
    // Nothing after today is ever judged, whatever an older install may have written down.
    if (dayStart > todayStart) return null;
    return this.dayVerdicts.get(dayKey(new Date(dayStart))) ?? null;
  }

  /**
   * How a day with no status reads: `pending` when it has passed and still holds work, else `open`.
   *
   * The distinction the schedule itself doesn't make. A task whose completion window outlives its day
   * leaves that day unjudged — correctly, since nothing has been missed while it can still be done —
   * but "you have something from Tuesday to finish" and "Thursday hasn't happened" are not the same
   * message, and drawn as one empty ring they become the same message.
   *
   * Only the days between: today is never `pending` (its tasks are simply today's work), and neither
   * is a day still to come.
   */
  private unsettledState(dayStart: number): 'pending' | 'open' {
    const todayStart = startOfDay(new Date()).getTime();
    if (dayStart >= todayStart) return 'open';
    const now = Date.now();
    const hasWorkLeft = this.tasksForDay(dayStart).some(
      t => !isTerminal(t.state) && t.timestamp + t.completionWindow > now,
    );
    return hasWorkLeft ? 'pending' : 'open';
  }

  /**
   * Days already past that still hold tasks the participant can finish, oldest first.
   *
   * What the strip marks `pending`, as a list — so the card can say how much is outstanding and the
   * prompt can offer to do something about it.
   */
  getUnfinishedDays(): StreakDay[] {
    const todayStart = startOfDay(new Date()).getTime();
    const days = new Set<number>();
    for (const task of this.tasks) {
      const dayStart = startOfDay(new Date(task.timestamp)).getTime();
      if (dayStart >= todayStart) continue;
      days.add(dayStart);
    }
    return [...days]
      .filter(d => this.unsettledState(d) === 'pending' && !this.dayVerdicts.has(dayKey(new Date(d))))
      .sort((a, b) => a - b)
      .map(d => ({ key: dayKey(new Date(d)), timestamp: d, state: 'pending' as const }));
  }

  /**
   * Judged days, oldest first. Days with no tasks — and days still pending — simply aren't in it.
   *
   * Today comes from `streakStatusForDay` rather than storage, so the streak moves the moment the
   * day's last task is completed; days after today are dropped, which is what retires any future
   * status an older install recorded before `settleDays` stopped writing them.
   */
  private judgedDays(): { date: Date; verdict: DayVerdict }[] {
    const todayStart = startOfDay(new Date()).getTime();
    const days = [...this.dayVerdicts.entries()]
      .map(([key, verdict]) => ({ date: dayKeyToDate(key), verdict }))
      .filter((d): d is { date: Date; verdict: DayVerdict } => d.date !== null)
      .filter(d => d.date.getTime() < todayStart);

    const today = this.streakStatusForDay(todayStart);
    if (today) days.push({ date: new Date(todayStart), verdict: today });

    return days.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Consecutive complete days, counting back from the most recent.
   *
   * One missed day is forgiven: it does not count toward the streak, but it does not end it either.
   * Two missed days in a row do. A day with no tasks scheduled is not judged at all and is simply
   * passed over, so a study that only schedules on weekdays doesn't reset every Saturday.
   */
  getCurrentStreak(): number {
    const days = this.judgedDays();
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i -= 1) {
      if (days[i].verdict === 'complete') {
        streak += 1;
        continue;
      }
      // A missed day, forgiven — unless the day judged before it was missed too.
      if (i > 0 && days[i - 1].verdict === 'missed') break;
      if (i === 0) break;
    }
    return streak;
  }

  /** The longest such run on record, under the same one-miss-forgiven rule. */
  getLongestStreak(): number {
    const days = this.judgedDays();
    let longest = 0;
    let run = 0;
    for (let i = 0; i < days.length; i += 1) {
      if (days[i].verdict === 'complete') {
        run += 1;
        if (run > longest) longest = run;
        continue;
      }
      // Two missed in a row ends the run; a single one is carried through without counting.
      if (i + 1 < days.length && days[i + 1].verdict === 'missed') run = 0;
      else if (i + 1 >= days.length) run = 0;
    }
    return longest;
  }

  /**
   * The last {@link STREAK_WINDOW_DAYS} days ending on `reference` — what the streak card's strip
   * draws, oldest first, so today is the rightmost cell.
   *
   * A trailing window rather than the calendar week it started as. A Mon→Sun week spends most of its
   * cells on days that have not happened: on a Tuesday, five of the seven are empty rings and only
   * one is history, so a streak earned over the previous weekend showed in the card's number with
   * nothing underneath to account for it. Ending at today means every cell is a day that has been and
   * gone, and the strip covers the same stretch the number is counting.
   *
   * The cost is that the weekday letters no longer start at M, so the caller has to take each one
   * from its own day's date rather than from a fixed row.
   *
   * Days with no status come back `open` rather than being left out, so the strip always has a full
   * row: a day nothing was scheduled on is not a day the participant lost.
   */
  getStreakWeek(reference: Date = new Date()): StreakDay[] {
    const start = new Date(reference);
    start.setHours(0, 0, 0, 0);
    // Back up so the window *ends* on the reference day rather than starting on it.
    start.setDate(start.getDate() - (STREAK_WINDOW_DAYS - 1));

    return Array.from({ length: STREAK_WINDOW_DAYS }, (_, i) => {
      // Stepping the date field rather than adding 24h keeps the walk correct across a DST change,
      // where one of these days is 23 or 25 hours long.
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const key = dayKey(date);
      // Through `streakStatusForDay`, not the stored map, so today's circle fills the moment its
      // last task is completed rather than at midnight — and so a day still to come always draws
      // as open.
      return {
        key,
        timestamp: date.getTime(),
        state: this.streakStatusForDay(date.getTime()) ?? this.unsettledState(date.getTime()),
      };
    });
  }

  /**
   * Whether a streak is one missed day from being lost — what the "Don't lose your streak" prompt asks.
   *
   * True when the most recently judged day was missed and there is a streak left to save. Today being
   * already complete clears it: there is nothing to warn about once the day's tasks are done.
   */
  getStreakRisk(): StreakRisk {
    const days = this.judgedDays();
    const last = days[days.length - 1];
    const todayStart = startOfDay(new Date()).getTime();
    const streak = this.getCurrentStreak();
    // Today live, for the same reason `judgedDays` reads it live: the prompt has to stop as soon as
    // the day's last task is done, not at midnight.
    const missedRisk =
      streak > 0 &&
      last != null &&
      last.verdict === 'missed' &&
      this.streakStatusForDay(todayStart) !== 'complete';
    const unfinishedDays = this.getUnfinishedDays().length;
    // Outstanding work is worth raising whether or not a streak is riding on it — there is something
    // to do about it either way, which is exactly what a missed day lacks.
    return {
      atRisk: missedRisk || unfinishedDays > 0,
      streak,
      missedDay: missedRisk && last ? dayKey(last.date) : null,
      unfinishedDays,
    };
  }

  /**
   * Take today's one showing of the streak prompt: true the first time it is asked on a given day,
   * false every time after.
   *
   * A claim rather than a question plus a setter, so a caller can't check and forget to record it —
   * and so two screens asking at once can't both decide to show it. The day is spent on being shown,
   * not on being acted upon: someone who dismisses the prompt has already been told.
   */
  async claimStreakPrompt(): Promise<boolean> {
    const key = dayKey(new Date());
    if (this.streakPromptDay === key) return false;
    this.streakPromptDay = key;
    await this.storage.set(STORAGE_KEYS.STREAK_PROMPT, key);
    return true;
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

    const today = dayKey(new Date());
    if (!this.activeDays.has(today)) {
      this.activeDays.add(today);
      await this.storage.set(STORAGE_KEYS.ACTIVE_DAYS, [...this.activeDays]);
    }

    // Before the event: a card reading the streak off `SCHEDULE_UPDATED` must see the day already
    // settled, or completing the day's last task leaves the counter a beat behind.
    await this.settleDays();

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

      // Skip terminal states — only pending/overdue can transition
      if (task.state === 'completed' || task.state === 'skipped' || task.state === 'expired') continue;

      if (now > expiresAt) {
        task.state = 'expired';
        task.stateChangedAt = new Date().toISOString();
        changed = true;
      } else if (task.state === 'pending' && now > task.timestamp) {
        task.state = 'overdue';
        task.stateChangedAt = new Date().toISOString();
        changed = true;
        this.bus.emit(EVENTS.TASK_OVERDUE, { taskId: task.id, name: task.name });
      }
    }

    if (readyChanged) {
      await this.storage.set(STORAGE_KEYS.NOTIFIED_READY, [...this.notifiedReadyIds]);
    }

    // After the state pass, not before: a task that just expired is what settles its day as missed.
    const settled = await this.settleDays();

    if (changed || settled) {
      if (changed) await this.persist();
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
      taskType: task.taskType,
      timeCompleted: task.timeCompleted,
      iconUrl: task.icon,
      startText: task.startText,
      endText: task.endText,
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

/**
 * States a task can no longer move out of.
 *
 * `skipped` counts as terminal but *not* as completed, so a skipped task marks its day missed. That
 * is a policy choice rather than a fact about the data: a study that treats skipping as a legitimate
 * answer should add it to the completed side of `settleDays` instead.
 */
function isTerminal(state: TaskState): boolean {
  return state === 'completed' || state === 'skipped' || state === 'expired';
}

/**
 * The key a day is recorded under in `activeDays`.
 *
 * Local calendar fields, not a UTC timestamp: a participant who completes a task at 11pm has been
 * active *that* day as they experienced it, and a day-boundary drawn in UTC would file it under
 * tomorrow for anyone east of Greenwich.
 *
 * Deliberately the format already on disk — `2026-9-27`, no zero padding — so keys written by every
 * previous version still match. It is the reason the streak walk compares parsed dates rather than
 * strings: as text, `2026-9-1` sorts after `2026-10-1`.
 */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** A day key back to local midnight, or `null` if the stored string isn't one. */
function dayKeyToDate(key: string): Date | null {
  const parts = key.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null;
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  // `new Date(2027, 1, 29)` rolls over to 1 March rather than failing, so a key naming a day that
  // doesn't exist comes back as a real date a day or two off. Checking the fields survived the trip
  // is what catches that — and unlike re-serialising the key and comparing strings, it still accepts
  // a zero-padded variant, which no version of this app writes but which costs nothing to tolerate.
  const intact =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return intact ? date : null;
}

function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
