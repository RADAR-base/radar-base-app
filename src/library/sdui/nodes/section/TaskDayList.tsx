import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useCoreServices } from '../../../../core/CoreServicesContext';
import { EVENTS } from '../../../../core/EventBus';
import type { TaskView as Task } from '../../../../types';
import { layout as layoutTokens } from '../../../../theme/theme';
import { TaskCardNode, type TaskCardType } from '../card/TaskCardNode';
import { ToDoStatusNode } from '../card/ToDoStatusNode';
import type { Node } from '../../../contracts/NodeSchema';
import type { SDUIContext } from '../../types';

export interface FilterShape {
  status?: 'incomplete' | 'complete' | 'all';
  category?: string;
}

/** A stable empty filter so callers that don't filter don't churn the load callback's deps. */
const NO_FILTER: FilterShape = {};

const noopRender = () => null;

export interface TaskDayListProps {
  context: SDUIContext;
  /** Which calendar day to show tasks for. Identity may change each render — the loader keys off the
   *  day's normalized start-of-day timestamp, so passing a fresh `new Date()` won't reload-loop. */
  date: Date;
  /** `singleCard` shows the first available task; `multiCard` shows the whole day. */
  variant: 'singleCard' | 'multiCard';
  filter?: FilterShape;
  /** Prefix for generated child node ids (React keys / ToDoStatus id). */
  idPrefix: string;
}

/**
 * The task list body shared by `TaskListSectionNode` (today, with section chrome) and `CalendarNode`
 * (a selected day, under the date selector). Pulls the given day's tasks from `ScheduleService`,
 * renders them as `TaskCardNode`s, and falls back to `ToDoStatusNode` when nothing is open.
 *
 * `protocol.json`'s assessments have no explicit task-type field, so `TaskCardNode`'s `taskType`
 * (questionnaire/speech/physical/medication) is inferred by keyword-matching the task's title.
 */
export function TaskDayList({ context, date, variant, filter = NO_FILTER, idPrefix }: TaskDayListProps) {
  const { schedule, eventBus } = useCoreServices();

  // Normalize to a start-of-day timestamp so the loader's deps are a stable primitive even when the
  // caller passes a fresh Date object on every render (e.g. `TaskListSectionNode`'s `new Date()`).
  const dayStamp = useMemo(() => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [date]);

  const [tasks, setTasks] = useState<Task[]>([]);
  // Unfiltered day tasks, kept alongside the (possibly `filter`-narrowed) `tasks` used for rendering —
  // completion stats need the whole day, not just what's displayed.
  const [allTasks, setAllTasks] = useState<Task[]>([]);

  const loadTasks = useCallback(async () => {
    try {
      const instances = await schedule.getTasksForDate(new Date(dayStamp));
      // `toTaskView` sets `isNew` (true until the user opens the task) — see `markTaskOpened`.
      const sduiTasks = instances.map((i) => schedule.toTaskView(i));
      setAllTasks(sduiTasks);
      setTasks(filterTasks(sduiTasks, filter));
    } catch {
      setAllTasks([]);
      setTasks([]);
    }
  }, [schedule, dayStamp, filter]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const handler = () => {
      loadTasks();
    };
    eventBus.on(EVENTS.SCHEDULE_UPDATED, handler);
    return () => eventBus.off(EVENTS.SCHEDULE_UPDATED, handler);
  }, [eventBus, loadTasks]);

  // `isExpired`/`visibleTasks` below read `Date.now()` at render time, but nothing re-renders this
  // component purely because time passed — without this, an expired task only disappears once
  // something else triggers a re-render. Ticking every 15s forces a fresh evaluation so cards drop
  // off close to when they actually expire.
  const [, tick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(interval);
  }, []);

  const handleTaskPress = (taskId: string) => {
    const current = tasks.find((t) => t.id === taskId);
    if (!current || current.status === 'completed') return;

    // Opening a task clears its "New Task" pill for good (persisted in `ScheduleService`). Fire-and-
    // forget: the service emits SCHEDULE_UPDATED, which reloads the list with `isNew` now false.
    void schedule.markTaskOpened(current.id);

    // Open the task instructions page — it slides in from the right (handled by the shell's
    // TaskInstructionsHost). The task is actually started/completed from "Lets Start" there.
    eventBus.emit(EVENTS.OPEN_TASK_INSTRUCTIONS, {
      taskId: current.id,
      assessmentName: current.assessmentName,
      taskName: current.title,
      description: current.description,
      taskType: inferTaskType(current.title),
      duration: current.estimated_minutes > 0 ? `${current.estimated_minutes} min` : undefined,
      expirationTime: formatExpiration(current),
      questionNumber: current.nQuestions ? `x${current.nQuestions}` : undefined,
    });
  };

  // Counts driving both the visible list and `ToDoStatusNode`'s state — computed off `allTasks` (the
  // whole day), not the possibly `filter`-narrowed `tasks`.
  const completedCount = allTasks.filter((t) => t.status === 'completed').length;

  const now = Date.now();
  const isAvailableNow = (t: Task) =>
    t.status !== 'completed' && !isExpired(t) && (t.timestamp == null || t.timestamp <= now);
  // A not-yet-due task — still open, just not actionable yet. Shown greyed-out in `multiCard`.
  const isUpcoming = (t: Task) =>
    t.status !== 'completed' && !isExpired(t) && t.timestamp != null && t.timestamp > now;

  // `multiCard` shows the whole day: everything still open — available now *and* upcoming — with
  // upcoming tasks greyed out (by `TaskCardNode`) and sorted by start time. `singleCard` shows the
  // first *available* task (earliest first). When nothing is open, both fall back to `ToDoStatusNode`.
  const openTasks = tasks
    .filter((t) => (variant === 'multiCard' ? isAvailableNow(t) || isUpcoming(t) : isAvailableNow(t)))
    .slice()
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  const visibleTasks = variant === 'singleCard' ? openTasks.slice(0, 1) : openTasks;

  if (visibleTasks.length === 0) {
    return (
      <ToDoStatusNode
        node={{ id: `${idPrefix}-status`, type: 'ToDoStatusNode', completed: completedCount, total: allTasks.length }}
        context={context}
        render={noopRender}
      />
    );
  }

  return (
    <View style={styles.list}>
      {visibleTasks.map((task) => {
        const available = isAvailableNow(task);
        const taskNode: Node = {
          id: `tasklist-${task.id}`,
          type: 'TaskCardNode',
          taskType: inferTaskType(task.title),
          taskName: task.title,
          // Only *available* tasks that haven't been opened yet get the "New Task!" pill — a
          // not-yet-due (greyed-out) task can't be opened, so flagging it "new" would be misleading.
          available,
          newTask: available && task.isNew === true,
          time: formatDueTime(task),
          duration: task.estimated_minutes > 0 ? `${task.estimated_minutes} min` : undefined,
          expirationTime: formatExpiration(task),
          iconUrl: task.iconUrl,
        };

        return (
          <Pressable
            key={task.id}
            accessibilityRole="button"
            // Upcoming (not-yet-available) tasks aren't actionable, so they don't open.
            disabled={!available}
            onPress={() => handleTaskPress(task.id)}
            style={({ pressed }) => (pressed ? styles.taskPressed : null)}
          >
            <TaskCardNode node={taskNode} context={context} render={noopRender} />
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A task is "missed"/expired once its completion window has fully elapsed — distinct from
 * `status === 'overdue'`, which just means past due time but still completable. Exported so
 * `CalendarTaskView` derives the "missed" state from the exact same rule.
 */
export function isExpired(task: Task): boolean {
  if (task.status === 'completed') return false;
  if (task.timestamp == null || task.completionWindow == null) return false;
  return Date.now() > task.timestamp + task.completionWindow;
}

/**
 * Keyword-matches the task title (ultimately the assessment's `name` from `protocol.json`) to a
 * `TaskCardNode` badge category, since `protocol.json` has no explicit task-type field.
 */
export function inferTaskType(title: string): TaskCardType {
  const lower = title.toLowerCase();
  if (/medication|medicine|pill|drug|dose/.test(lower)) return 'medication';
  if (/speech|voice|record/.test(lower)) return 'speech';
  if (/physical|walk|exercise|activity|steps|fitness/.test(lower)) return 'physical';
  return 'questionnaire';
}

/** Remaining time until the task's completion window closes, formatted like "12H 00M". */
function formatExpiration(task: Task): string | undefined {
  if (!task.timestamp || !task.completionWindow) return undefined;
  const msRemaining = task.timestamp + task.completionWindow - Date.now();
  return formatDuration(Math.max(msRemaining, 0));
}

/** Format a duration in ms to a human-readable string like "12H 00M" or "2D". */
function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin}M`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}D`;
  }
  return `${hours}H ${String(mins).padStart(2, '0')}M`;
}

/** Format a raw epoch-ms timestamp as a zero-padded 24-hour "HH:MM" (e.g. "09:00", "14:30"). */
function formatTimestamp(ms: number): string {
  const date = new Date(ms);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Format the due time for the card's `time` field as a 24-hour "HH:MM" (e.g. "09:00"). */
function formatDueTime(task: Task): string {
  if (task.dueTime) {
    // Normalize "H:MM", "HH:MM" or "H:MM AM/PM" to a 24-hour "HH:MM".
    const m = task.dueTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (m) {
      let hour = parseInt(m[1], 10);
      const min = m[2];
      const ampm = m[3]?.toUpperCase();
      if (ampm === 'PM' && hour < 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;
      return `${String(hour).padStart(2, '0')}:${min}`;
    }
    return task.dueTime;
  }
  if (task.timestamp) {
    return formatTimestamp(task.timestamp);
  }
  return '--:--';
}

function filterTasks(all: Task[], filter: FilterShape): Task[] {
  let filtered = all;
  if (filter.status === 'incomplete') {
    filtered = filtered.filter((t) => t.status === 'pending' || t.status === 'overdue');
  } else if (filter.status === 'complete') {
    filtered = filtered.filter((t) => t.status === 'completed');
  }
  if (filter.category) {
    filtered = filtered.filter(
      (t) =>
        t.id.toLowerCase().includes(filter.category!.toLowerCase()) ||
        t.title.toLowerCase().includes(filter.category!.toLowerCase()),
    );
  }
  return filtered;
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
    gap: layoutTokens.gap,
  },
  // Press feedback: a subtle scale-down. We deliberately avoid the default opacity dim — the card
  // casts an Android `elevation` shadow, and fading a shadowed view's opacity renders badly on
  // Android. A scale transform is elevation-safe and reads the same on both platforms.
  taskPressed: {
    transform: [{ scale: 0.98 }],
  },
});
