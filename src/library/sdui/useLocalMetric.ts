import { useCallback, useEffect, useState } from 'react';
import { useCoreServices } from '../../core/CoreServicesContext';
import { EVENTS } from '../../core/EventBus';

export interface LocalMetric {
  /** The metric's current value — shown as the stat number and driving any ring/arc fill. */
  value: number;
  /** A natural denominator for the metric (e.g. total tasks today), if it has one. A node uses this
   *  as its fill target when the blueprint doesn't set an explicit `target`. */
  target?: number;
}

/** Metric names computed from data the app already holds (the task schedule, …), not a wearable feed. */
const LOCAL_METRICS = ['task_completed', 'active_days', 'current_streak', 'longest_streak'] as const;
export type LocalMetricName = (typeof LOCAL_METRICS)[number];

/** Whether `metric` names a known local (app-computed) metric. */
export function isLocalMetric(metric: string): metric is LocalMetricName {
  return (LOCAL_METRICS as readonly string[]).includes(metric);
}

/**
 * Resolves a **local metric** — one computed from data the app already has (currently today's task
 * schedule) rather than a wearable feed — so any stat/wheel/arc card can display it by setting
 * `metric: "task_completed"` in its blueprint. Returns `{ value, target }` for a known metric or
 * `null` otherwise, in which case the node keeps its normal (`useDashboardData` / static `value`)
 * resolution. Live-updates with the schedule via `SCHEDULE_UPDATED`.
 *
 * Known metrics:
 *   - `task_completed`  → today's completed-task count; `target` = total tasks scheduled today.
 *   - `active_days`     → distinct calendar days the user has completed ≥1 task (a running count, no target).
 *   - `current_streak`  → consecutive active days ending today (a running count, no target).
 *   - `longest_streak`  → the longest such run on record (a running count, no target).
 *
 * Add a metric by extending `LOCAL_METRICS` and returning its `{ value, target }` below.
 */
export function useLocalMetric(metric: string): LocalMetric | null {
  const wantsTasks = metric === 'task_completed';
  const wantsActiveDays = metric === 'active_days';
  const wantsCurrentStreak = metric === 'current_streak';
  const wantsLongestStreak = metric === 'longest_streak';
  /** Any metric read straight off the schedule's day history — all three share one load. */
  const wantsDayHistory = wantsActiveDays || wantsCurrentStreak || wantsLongestStreak;
  const { schedule, eventBus } = useCoreServices();
  const [taskCounts, setTaskCounts] = useState<{ completed: number; total: number }>({
    completed: 0,
    total: 0,
  });
  const [activeDays, setActiveDays] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);

  const load = useCallback(async () => {
    if (wantsTasks) {
      try {
        const instances = await schedule.getTasksForDate(new Date());
        const tasks = instances.map((i) => schedule.toTaskView(i));
        setTaskCounts({
          completed: tasks.filter((t) => t.status === 'completed').length,
          total: tasks.length,
        });
      } catch {
        setTaskCounts({ completed: 0, total: 0 });
      }
    } else if (wantsDayHistory) {
      // All three off one pass: they read the same `activeDays` set, and a card showing a streak
      // beside the active-day count that disagreed with it would be the obvious bug.
      setActiveDays(schedule.getActiveDaysCount());
      setCurrentStreak(schedule.getCurrentStreak());
      setLongestStreak(schedule.getLongestStreak());
    }
  }, [schedule, wantsTasks, wantsDayHistory]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!wantsTasks && !wantsDayHistory) return;
    const handler = () => load();
    eventBus.on(EVENTS.SCHEDULE_UPDATED, handler);
    return () => eventBus.off(EVENTS.SCHEDULE_UPDATED, handler);
  }, [eventBus, load, wantsTasks, wantsDayHistory]);

  if (wantsTasks) {
    // target is the day's total tasks (min 1 so the fill math never divides by zero).
    return { value: taskCounts.completed, target: Math.max(1, taskCounts.total) };
  }
  // All three are running counts with no natural denominator, so none carries a `target`.
  if (wantsActiveDays) return { value: activeDays };
  if (wantsCurrentStreak) return { value: currentStreak };
  if (wantsLongestStreak) return { value: longestStreak };
  return null;
}
