import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useCoreServices } from '../../../core/CoreServicesContext';
import { EVENTS } from '../../../core/EventBus';
import type { Task } from '../../../types';
import type { NodeProps } from '../types';
import { fontFamily } from '../../../theme/theme';

interface FilterShape {
  status?: 'incomplete' | 'complete' | 'all';
  category?: string;
}

const TASK_ICONS: Record<string, { symbol: string; bg: string }> = {
  default: { symbol: '\u{1F4CB}', bg: '#D6E4F0' },
  mood: { symbol: '\u{1F60A}', bg: '#D6E4F0' },
  blood: { symbol: '❤', bg: '#F0D6D6' },
  pressure: { symbol: '❤', bg: '#F0D6D6' },
  medication: { symbol: '\u{1F48A}', bg: '#D6F0D6' },
  voice: { symbol: '\u{1F3A4}', bg: '#E0D6F0' },
  phq: { symbol: '\u{1F4DD}', bg: '#E0D6F0' },
  menstruation: { symbol: '\u{1F6B6}', bg: '#E8E0F0' },
};

/**
 * Renders task cards from ScheduleService. Falls back to demo data only
 * when no protocol is loaded. Pills are computed from real task metadata:
 *   - Status pill: "Now" (overdue/active) or time until due
 *   - Window pill: completion window formatted as hours/minutes
 *   - Duration pill: estimated completion time
 *   - Repeat pill: derived from task repetition count (if available)
 */
export function SurveyTaskListNode({ node, context }: NodeProps) {
  const { schedule, eventBus } = useCoreServices();
  const variant = node.variant === 'multiCard' ? 'multiCard' : 'singleCard';
  const filter = useMemo<FilterShape>(
    () => (isRecord(node.filter) ? (node.filter as FilterShape) : {}),
    [node.filter],
  );
  const description = typeof node.description === 'string' ? node.description : undefined;

  const [tasks, setTasks] = useState<Task[]>([]);

  const loadTasks = useCallback(async () => {
    try {
      const instances = await schedule.getTasksForDate(new Date());
      const sduiTasks = instances.map(i => schedule.toSDUITask(i));
      setTasks(filterTasks(sduiTasks, filter, variant));
    } catch {
      setTasks([]);
    }
  }, [schedule, filter, variant]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => {
    const handler = () => { loadTasks(); };
    eventBus.on(EVENTS.SCHEDULE_UPDATED, handler);
    return () => eventBus.off(EVENTS.SCHEDULE_UPDATED, handler);
  }, [eventBus, loadTasks]);

  const handleTaskPress = async (taskId: string) => {
    const current = tasks.find(t => t.id === taskId);
    if (!current || current.status === 'completed') return;

    try {
      await schedule.completeTask(taskId);
    } catch {
      // Fallback: toggle locally when ScheduleService fails
      setTasks(cur =>
        cur.map(t =>
          t.id === taskId
            ? { ...t, status: 'completed' as Task['status'], completed: true }
            : t,
        ),
      );
      context.eventBus?.emit('task-updated', { taskId });
    }
  };

  const theme = context.theme;
  const surface = theme.surfaceColor ?? '#FFFFFF';
  const text = theme.textColor ?? '#1C3549';
  const textSecondary = theme.textSecondaryColor ?? '#8E8E93';
  const secondary = theme.secondaryColor ?? '#8FA764';
  const radius = theme.button?.borderRadius ?? 12;
  const pillBg = '#E8F0E0';

  return (
    <View>
      {description && <Text style={[styles.description, { color: textSecondary }]}>{description}</Text>}

      {tasks.length > 0 && (
        <View style={[styles.listContainer, { backgroundColor: surface, borderRadius: radius }]}>
          {tasks.map((task, index) => {
            const iconData = getTaskIcon(task.title);
            const isLast = index === tasks.length - 1;
            const pills = buildPills(task);

            return (
              <TouchableOpacity
                key={task.id}
                accessibilityRole="button"
                onPress={() => handleTaskPress(task.id)}
                style={[
                  styles.taskItem,
                  !isLast && styles.taskItemBorder,
                ]}
              >
                {/* Icon circle */}
                <View style={[styles.iconCircle, { backgroundColor: iconData.bg }]}>
                  <Text style={styles.iconText}>{iconData.symbol}</Text>
                </View>

                {/* Content */}
                <View style={styles.taskContent}>
                  <Text
                    style={[
                      styles.taskTitle,
                      { color: text },
                      task.status === 'completed' && styles.taskTitleCompleted,
                    ]}
                    numberOfLines={1}
                  >
                    {task.title}
                  </Text>
                  {/* Metadata pills — computed from task data */}
                  <View style={styles.pillRow}>
                    {pills.map((pill, i) => (
                      <View key={i} style={[styles.pill, { backgroundColor: pillBg }]}>
                        <Text style={[styles.pillText, { color: secondary }]}>{pill}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Time badge */}
                <View style={[styles.timeBadge, { backgroundColor: pillBg }]}>
                  <View style={styles.timeBadgeInner}>
                    <View style={[styles.calendarIcon, { borderColor: secondary }]}>
                      <View style={[styles.calendarIconLine, { backgroundColor: secondary }]} />
                    </View>
                    <Text style={[styles.timeBadgeText, { color: secondary }]}>
                      {formatDueTime(task)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {tasks.length === 0 && (
        <View style={[styles.emptyState, { backgroundColor: surface, borderRadius: radius }]}>
          <Text style={[styles.emptyText, { color: textSecondary }]}>
            No tasks scheduled for today
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Build metadata pills from actual task data.
 */
function buildPills(task: Task): string[] {
  const pills: string[] = [];
  const now = Date.now();

  // Status pill: "Now" if overdue/active, otherwise time until due
  if (task.timestamp) {
    if (task.status === 'overdue' || now >= task.timestamp) {
      pills.push('Now');
    } else {
      const msUntil = task.timestamp - now;
      pills.push(formatDuration(msUntil));
    }
  } else {
    pills.push(task.status === 'completed' ? 'Done' : 'Now');
  }

  // Completion window pill
  if (task.completionWindow) {
    pills.push(formatDuration(task.completionWindow));
  }

  // Estimated duration pill
  if (task.estimated_minutes > 0) {
    pills.push(`${task.estimated_minutes} min`);
  }

  return pills;
}

/**
 * Format a duration in ms to a human-readable string like "12H 00M" or "2D".
 */
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
 * Format the due time for the time badge. Uses the task's dueTime string
 * (already formatted by ScheduleService) or falls back to timestamp.
 */
function formatDueTime(task: Task): string {
  if (task.dueTime) {
    // dueTime from ScheduleService is already locale-formatted (e.g. "10:00 AM")
    // If it's in 24h format "HH:MM", convert to 12h
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
    const d = new Date(task.timestamp);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return '--:--';
}

/**
 * Match task title/id to an icon. Checks the title first (from protocol name),
 * then falls back to the instanceId.
 */
function getTaskIcon(text: string): { symbol: string; bg: string } {
  const lower = text.toLowerCase();
  if (lower.includes('mood')) return TASK_ICONS.mood;
  if (lower.includes('blood') || lower.includes('pressure')) return TASK_ICONS.pressure;
  if (lower.includes('medication') || lower.includes('med') || lower.includes('log med')) return TASK_ICONS.medication;
  if (lower.includes('voice') || lower.includes('calibration')) return TASK_ICONS.voice;
  if (lower.includes('phq') || lower.includes('questionnaire')) return TASK_ICONS.phq;
  if (lower.includes('menstruation') || lower.includes('adhd')) return TASK_ICONS.menstruation;
  return TASK_ICONS.default;
}

function filterTasks(all: Task[], filter: FilterShape, variant: 'singleCard' | 'multiCard'): Task[] {
  let filtered = all;
  if (filter.status === 'incomplete') {
    filtered = filtered.filter((t) => t.status === 'pending' || t.status === 'overdue');
  } else if (filter.status === 'complete') {
    filtered = filtered.filter((t) => t.status === 'completed');
  }
  if (filter.category) {
    filtered = filtered.filter((t) =>
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
  description: { fontSize: 13, marginBottom: 10, fontFamily: fontFamily.regular, includeFontPadding: false },
  listContainer: {
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  taskItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EBF0',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 18,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
    includeFontPadding: false,
    fontWeight: '600',
    marginBottom: 6,
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  pill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pillText: {
    fontSize: 9,
    fontFamily: fontFamily.semiBold,
    includeFontPadding: false,
    fontWeight: '600',
  },
  timeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    marginLeft: 8,
  },
  timeBadgeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  calendarIcon: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderRadius: 2,
  },
  calendarIconLine: {
    height: 1,
    marginTop: 2,
  },
  timeBadgeText: {
    fontSize: 10,
    fontFamily: fontFamily.bold,
    includeFontPadding: false,
    fontWeight: '700',
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
  },
});
