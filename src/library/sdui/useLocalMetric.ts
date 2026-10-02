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
const LOCAL_METRICS = [
  'task_completed',
  'active_days',
  'current_streak',
  'longest_streak',
  'study_days',
] as const;
export type LocalMetricName = (typeof LOCAL_METRICS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days on the study, counting the enrolment day as day one.
 *
 * Measured between local midnights rather than between the two instants, so the figure ticks over at
 * midnight instead of at whatever time of day the participant happened to enrol — someone who joined
 * at 11pm is on day two the next morning, not the following night.
 *
 * `0` when there is no usable enrolment date, and for one dated in the future: a clock that disagrees
 * with the server is not a reason to show a negative count.
 */
function daysOnStudy(enrolment: string | Date | null | undefined, now: Date): number {
  if (enrolment == null) return 0;
  const start = new Date(enrolment);
  if (Number.isNaN(start.getTime())) return 0;
  start.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  // Both are local midnights, so the difference is a whole number of days even across a DST change —
  // rounding absorbs the 23- or 25-hour day rather than truncating it to the wrong side.
  const elapsed = Math.round((today.getTime() - start.getTime()) / DAY_MS);
  return elapsed < 0 ? 0 : elapsed + 1;
}

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
 *   - `task_completed`  → completed tasks; `target` = those plus everything still completable. Across
 *                         every day, not just today: a participant who clears today still has the week
 *                         ahead, and a wheel reading "3 of 3" on a full schedule overstates how far
 *                         along they are. A task expired unfinished is counted in neither, so the ring
 *                         can always be filled.
 *   - `active_days`     → distinct calendar days the user has completed ≥1 task (a running count, no target).
 *   - `current_streak`  → consecutive active days ending today (a running count, no target).
 *   - `longest_streak`  → the longest such run on record (a running count, no target).
 *   - `study_days`      → whole days since enrolment, the enrolment day counting as day one. Unlike
 *                         `active_days` it counts every day that has passed, whether or not the
 *                         participant did anything on it — "how long I have been in the study", not
 *                         "how often I turned up".
 *
 * Add a metric by extending `LOCAL_METRICS` and returning its `{ value, target }` below.
 */
export function useLocalMetric(metric: string): LocalMetric | null {
  const wantsTasks = metric === 'task_completed';
  const wantsActiveDays = metric === 'active_days';
  const wantsCurrentStreak = metric === 'current_streak';
  const wantsLongestStreak = metric === 'longest_streak';
  const wantsStudyDays = metric === 'study_days';
  /** Any metric read straight off the schedule's day history — all three share one load. */
  const wantsDayHistory = wantsActiveDays || wantsCurrentStreak || wantsLongestStreak;
  const { schedule, subjectConfig, eventBus } = useCoreServices();
  const [taskCounts, setTaskCounts] = useState<{ completed: number; total: number }>({
    completed: 0,
    total: 0,
  });
  const [activeDays, setActiveDays] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [studyDays, setStudyDays] = useState(0);

  const load = useCallback(async () => {
    if (wantsTasks) {
      // Every open task, not just today's — see `getOpenTaskCounts`. Synchronous, so there is nothing
      // to fail: the counts come off the schedule already in memory.
      setTaskCounts(schedule.getOpenTaskCounts());
    } else if (wantsDayHistory) {
      // All three off one pass: they read the same `activeDays` set, and a card showing a streak
      // beside the active-day count that disagreed with it would be the obvious bug.
      setActiveDays(schedule.getActiveDaysCount());
      setCurrentStreak(schedule.getCurrentStreak());
      setLongestStreak(schedule.getLongestStreak());
    } else if (wantsStudyDays) {
      // The one metric that isn't read off the schedule. It can fail — the enrolment date comes from
      // Management Portal, and before that call has landed there is nothing to count from — so a
      // rejection leaves the count at 0 rather than taking down the card that asked for it.
      try {
        setStudyDays(daysOnStudy(await subjectConfig.getEnrolmentDate(), new Date()));
      } catch {
        setStudyDays(0);
      }
    }
  }, [schedule, subjectConfig, wantsTasks, wantsDayHistory, wantsStudyDays]);

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
  // The rest are running counts with no natural denominator, so none carries a `target`.
  if (wantsActiveDays) return { value: activeDays };
  if (wantsCurrentStreak) return { value: currentStreak };
  if (wantsLongestStreak) return { value: longestStreak };
  if (wantsStudyDays) return { value: studyDays };
  return null;
}
