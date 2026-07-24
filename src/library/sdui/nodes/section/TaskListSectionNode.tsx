import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useCoreServices } from '../../../../core/CoreServicesContext';
import { EVENTS } from '../../../../core/EventBus';
import type { Task } from '../../../../types';
import { getColorTokens, layout as layoutTokens } from '../../../../theme/theme';
import { TaskCardNode, type TaskCardType } from '../card/TaskCardNode';
import { ToDoStatusNode } from '../card/ToDoStatusNode';
import type { Node } from '../../../contracts/NodeSchema';
import type { NodeProps } from '../../types';

interface FilterShape {
  status?: 'incomplete' | 'complete' | 'all';
  category?: string;
}

const noopRender = () => null;

/**
 * Task list driven by `ScheduleService` (ultimately `protocol.json`), rendered as
 * `TaskCardNode`s — the config-driven counterpart to `SurveyTaskListNode`'s own inline
 * task rendering, kept separate so that node isn't touched. Same `title`/`showSeeAll`/
 * `viewPath` chrome as `CardSectionNode`, themed from `theme.ts`.
 *
 * `protocol.json`'s assessments have no explicit task-type field, so `TaskCardNode`'s
 * `taskType` (questionnaire/speech/physical/medication) is inferred by keyword-matching
 * the task's title (ultimately the assessment's `name`) — same heuristic
 * `SurveyTaskListNode`'s previous inline icon lookup used.
 */
export function TaskListSectionNode({ node, context }: NodeProps) {
  const { schedule, eventBus } = useCoreServices();
  const title = typeof node.title === 'string' ? node.title : undefined;
  const showSeeAll = node.showSeeAll === true;
  const viewPath = typeof node.viewPath === 'string' ? node.viewPath : undefined;
  const variant = node.variant === 'multiCard' ? 'multiCard' : 'singleCard';
  const filter = useMemo<FilterShape>(
    () => (isRecord(node.filter) ? (node.filter as FilterShape) : {}),
    [node.filter],
  );

  const [tasks, setTasks] = useState<Task[]>([]);
  // Unfiltered today's tasks, kept alongside the (possibly `filter`-narrowed) `tasks`
  // used for rendering — completion stats need the whole day, not just what's displayed.
  const [allTasks, setAllTasks] = useState<Task[]>([]);

  const loadTasks = useCallback(async () => {
    try {
      const instances = await schedule.getTasksForDate(new Date());
      const sduiTasks = instances.map((i) => schedule.toSDUITask(i));
      setAllTasks(sduiTasks);
      setTasks(filterTasks(sduiTasks, filter, variant));
    } catch {
      setAllTasks([]);
      setTasks([]);
    }
  }, [schedule, filter, variant]);

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

  // `isExpired`/`visibleTasks` below read `Date.now()` at render time, but nothing
  // re-renders this component purely because time passed — without this, an expired
  // task only disappears once something else happens to trigger a re-render (a press,
  // or `ScheduleService`'s own 60s `refreshStates()` poll). Ticking a dummy counter every
  // 15s forces a fresh evaluation so cards drop off close to the moment they actually
  // expire, not whenever the next unrelated update happens to land.
  const [, tick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(interval);
  }, []);

  const handleTaskPress = async (taskId: string) => {
    const current = tasks.find((t) => t.id === taskId);
    if (!current || current.status === 'completed') return;

    try {
      await schedule.completeTask(taskId);
    } catch {
      setTasks((cur) =>
        cur.map((t) =>
          t.id === taskId ? { ...t, status: 'completed' as Task['status'], completed: true } : t,
        ),
      );
      context.eventBus?.emit('task-updated', { taskId });
    }
  };

  const tokens = getColorTokens(context.colorScheme ?? 'light');

  // Counts driving both the visible list and `ToDoStatusNode`'s state — computed off
  // `allTasks` (the whole day), not the possibly `filter`-narrowed `tasks`, so an
  // `incomplete`-only filter doesn't skew what `ToDoStatusNode` reports as completed/total.
  const completedCount = allTasks.filter((t) => t.status === 'completed').length;
  const expiredCount = allTasks.filter(isExpired).length;

  const now = Date.now();
  const isAvailableNow = (t: Task) =>
    t.status !== 'completed' && !isExpired(t) && (t.timestamp == null || t.timestamp <= now);

  // Only tasks that are actionable *right now* — not completed, not expired, and already
  // due — show in the list. A task whose `timestamp` is still in the future (not yet
  // available to complete) stays hidden until it's actually due. When nothing is
  // currently available (whether because everything's done, missed, or simply not due
  // yet), the section shows `ToDoStatusNode` instead of an empty list — deliberately not
  // gated on the *whole day* being concluded, since a task repeating every few minutes
  // would then never trigger it (there's always a future instance sitting in `allTasks`).
  const visibleTasks = tasks.filter(isAvailableNow);

  // Debug visibility into the counts driving the above. Re-logs on every render,
  // including the 15s tick, so you can watch counts shift in real time.
  const availableCount = allTasks.filter(isAvailableNow).length;
  const upcomingCount = allTasks.filter(
    (t) => t.status !== 'completed' && !isExpired(t) && t.timestamp != null && t.timestamp > now,
  ).length;
  console.log(
    `[TaskListSectionNode ${new Date(now).toLocaleTimeString()}] available=${availableCount} expired=${expiredCount} upcoming=${upcomingCount} (completed=${completedCount}, total=${allTasks.length})`,
  );

  return (
    <View style={styles.container}>
      {title && (
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: tokens.text.primary }]}>{title}</Text>
          {showSeeAll && viewPath && (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => context.dispatch({ type: 'OpenCustomView', viewUrl: viewPath })}
            >
              <View style={[styles.seeAllPill, { borderColor: tokens.card.stats.description }]}>
                <Text style={[styles.seeAllText, { color: tokens.text.primary }]}>See All</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      )}

      {visibleTasks.length === 0 ? (
        <ToDoStatusNode
          node={{ id: `${node.id}-status`, type: 'ToDoStatusNode', completed: completedCount, total: allTasks.length }}
          context={context}
          render={noopRender}
        />
      ) : (
        <View style={styles.list}>
          {visibleTasks.map((task) => {
            const taskNode: Node = {
              id: `tasklist-${task.id}`,
              type: 'TaskCardNode',
              taskType: inferTaskType(task.title),
              taskName: task.title,
              time: formatDueTime(task),
              duration: task.estimated_minutes > 0 ? `${task.estimated_minutes} min` : undefined,
              expirationTime: formatExpiration(task),
              // The reminder pill reflects the protocol's own configured reminder
              // (`assessment.protocol.reminders`, an offset after the due time) rather than
              // task status — only shown when that protocol actually configures one.
              reminder: task.reminderTimestamp != null,
              reminderTime: task.reminderTimestamp != null ? formatTimestamp(task.reminderTimestamp) : undefined,
            };

            return (
              <TouchableOpacity key={task.id} accessibilityRole="button" onPress={() => handleTaskPress(task.id)}>
                <TaskCardNode node={taskNode} context={context} render={noopRender} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

/**
 * A task is "missed"/expired once its completion window (`protocol.json`'s
 * `protocol.completionWindow`, carried onto `Task.completionWindow`) has fully elapsed —
 * distinct from `status === 'overdue'`, which just means past due time but still
 * completable. `Task.status` collapses both into `'overdue'`, so this is computed
 * directly off the raw timestamp/window instead.
 */
function isExpired(task: Task): boolean {
  if (task.status === 'completed') return false;
  if (task.timestamp == null || task.completionWindow == null) return false;
  return Date.now() > task.timestamp + task.completionWindow;
}

/**
 * Keyword-matches the task title (ultimately the assessment's `name` from
 * `protocol.json`) to a `TaskCardNode` badge category, since `protocol.json` has no
 * explicit task-type field.
 */
function inferTaskType(title: string): TaskCardType {
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

/**
 * Format a raw epoch-ms timestamp for display (e.g. "9:00 AM") — used for `reminderTimestamp`.
 * Builds the AM/PM suffix manually (rather than relying on `toLocaleTimeString`'s locale
 * default, which omits AM/PM entirely on 24-hour-locale devices) to match `formatDueTime`.
 */
function formatTimestamp(ms: number): string {
  const date = new Date(ms);
  const hour = date.getHours();
  const min = String(date.getMinutes()).padStart(2, '0');
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

/** Format the due time for the card's `time` field (e.g. "9:00 AM"). */
function formatDueTime(task: Task): string {
  if (task.dueTime) {
    const parts = task.dueTime.split(':');
    if (parts.length >= 2) {
      const hour = parseInt(parts[0], 10);
      if (!isNaN(hour) && !task.dueTime.includes('AM') && !task.dueTime.includes('PM')) {
        const min = parts[1].replace(/\D/g, '');
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const h = hour % 12 || 12;
        return `${h}:${min} ${ampm}`;
      }
    }
    return task.dueTime;
  }
  if (task.timestamp) {
    return formatTimestamp(task.timestamp);
  }
  return '--:--';
}

function filterTasks(all: Task[], filter: FilterShape, variant: 'singleCard' | 'multiCard'): Task[] {
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
  return variant === 'singleCard' ? filtered.slice(0, 1) : filtered;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: layoutTokens.gap,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  title: {
    fontSize: layoutTokens.headingFontSize,
    lineHeight: layoutTokens.headingFontSize,
    fontWeight: '700',
    letterSpacing: layoutTokens.letterSpacing,
  },
  seeAllPill: {
    height: 18,
    borderWidth: 1,
    borderRadius: layoutTokens.radiusPill,
    paddingHorizontal: layoutTokens.pillPaddingHorizontal,
    paddingVertical: layoutTokens.pillPaddingVertical,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seeAllText: {
    fontSize: layoutTokens.captionFontSize,
    lineHeight: layoutTokens.captionFontSize,
    letterSpacing: layoutTokens.letterSpacing,
  },
  list: {
    width: '100%',
    gap: layoutTokens.gap,
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
    borderRadius: layoutTokens.radiusCard,
  },
  emptyText: {
    fontSize: 13,
  },
});
