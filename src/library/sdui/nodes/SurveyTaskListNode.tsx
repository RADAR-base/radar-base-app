import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Task } from '../../../types';
import type { NodeProps } from '../types';

interface FilterShape {
  status?: 'incomplete' | 'complete' | 'all';
  category?: string;
}

/**
 * Renders an ePRO / questionnaire task list. Two variants per spec:
 *   - `singleCard` — a single card preview (the engine takes the first matching task).
 *   - `multiCard`  — a vertical list of all matching tasks.
 *
 * The `filter` prop narrows which tasks are shown. Real task data should come from a
 * future `TaskScheduleService`; for the MVP demo we synthesize a small set so the
 * blueprint renders something visible end-to-end.
 */
export function SurveyTaskListNode({ node, context }: NodeProps) {
  const variant = node.variant === 'multiCard' ? 'multiCard' : 'singleCard';
  const filter = useMemo<FilterShape>(
    () => (isRecord(node.filter) ? (node.filter as FilterShape) : {}),
    [node.filter],
  );
  const title = typeof node.title === 'string' ? node.title : 'Tasks';
  const description = typeof node.description === 'string' ? node.description : undefined;

  const initialTasks = useMemo(
    () => filterTasks(getDemoTasks(), filter, variant),
    [filter, variant],
  );
  const [tasks, setTasks] = useState<Task[]>(initialTasks);

  const toggleTask = (taskId: string) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: (task.status === 'completed' ? 'pending' : 'completed') as Task['status'],
            }
          : task,
      ),
    );
    context.eventBus?.emit('task-updated', { taskId });
  };

  const theme = context.theme;
  const surface = theme.surfaceColor ?? '#FFFFFF';
  const text = theme.textColor ?? '#000';
  const textSecondary = theme.textSecondaryColor ?? '#6D6D80';
  const primary = theme.primaryColor;
  const radius = theme.button?.borderRadius ?? 8;

  return (
    <View style={[styles.container, { backgroundColor: surface, borderRadius: radius }]}>
      <Text style={[styles.title, { color: text }]}>{title}</Text>
      {description && <Text style={[styles.description, { color: textSecondary }]}>{description}</Text>}

      {tasks.map((task) => {
        const palette = STATUS_PALETTES[task.status];
        return (
          <TouchableOpacity
            key={task.id}
            accessibilityRole="button"
            onPress={() => toggleTask(task.id)}
            style={[styles.taskItem, { backgroundColor: palette.bg, borderColor: palette.border }]}
          >
            <View style={styles.taskHeader}>
              <Text
                style={[
                  styles.taskTitle,
                  { color: text },
                  task.status === 'completed' && styles.taskTitleCompleted,
                ]}
              >
                {task.title}
              </Text>
              <Text style={[styles.taskTime, { color: textSecondary }]}>{task.dueTime}</Text>
            </View>
            <Text style={[styles.taskDescription, { color: textSecondary }]}>{task.description}</Text>
            <View style={styles.taskFooter}>
              <Text style={[styles.taskEstimate, { color: primary }]}>Est. {task.estimated_minutes} min</Text>
              <View style={[styles.taskStatus, { backgroundColor: palette.chipBg }]}>
                <Text style={[styles.taskStatusText, { color: palette.chipText }]}>
                  {STATUS_ICONS[task.status]} {STATUS_LABELS[task.status]}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}

      {tasks.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: textSecondary }]}>No tasks available</Text>
        </View>
      )}
    </View>
  );
}

function filterTasks(all: Task[], filter: FilterShape, variant: 'singleCard' | 'multiCard'): Task[] {
  let filtered = all;
  if (filter.status === 'incomplete') {
    filtered = filtered.filter((t) => t.status === 'pending' || t.status === 'overdue');
  } else if (filter.status === 'complete') {
    filtered = filtered.filter((t) => t.status === 'completed');
  }
  if (filter.category) {
    filtered = filtered.filter((t) => t.id.toLowerCase().includes(filter.category!.toLowerCase()));
  }
  return variant === 'singleCard' ? filtered.slice(0, 1) : filtered;
}

function getDemoTasks(): Task[] {
  return [
    {
      id: 'daily-mood-check',
      title: 'Daily Mood Check',
      description: 'How are you feeling today?',
      dueTime: '10:00',
      estimated_minutes: 2,
      status: 'pending',
    },
    {
      id: 'research-blood-pressure',
      title: 'Record Blood Pressure',
      description: 'Take your morning reading.',
      dueTime: '09:00',
      estimated_minutes: 3,
      status: 'pending',
    },
    {
      id: 'research-medication-log',
      title: 'Log Medications',
      description: 'Record what you took today.',
      dueTime: '20:00',
      estimated_minutes: 1,
      status: 'completed',
    },
  ];
}

const STATUS_PALETTES: Record<Task['status'], { bg: string; border: string; chipBg: string; chipText: string }> = {
  pending: { bg: '#f0f0f0', border: '#eee', chipBg: '#fff3cd', chipText: '#856404' },
  completed: { bg: '#e0f0e0', border: '#c3e6cb', chipBg: '#d4edda', chipText: '#155724' },
  overdue: { bg: '#f8d7da', border: '#f5c6cb', chipBg: '#f8d7da', chipText: '#721c24' },
};
const STATUS_ICONS: Record<Task['status'], string> = { pending: '⏱️', completed: '✅', overdue: '🔴' };
const STATUS_LABELS: Record<Task['status'], string> = {
  pending: 'Pending',
  completed: 'Completed',
  overdue: 'Overdue',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const styles = StyleSheet.create({
  container: {
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  description: { fontSize: 12, marginBottom: 10 },
  taskItem: { padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1 },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  taskTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  taskTitleCompleted: { textDecorationLine: 'line-through', opacity: 0.6 },
  taskTime: { fontSize: 12, fontWeight: '600', marginLeft: 8 },
  taskDescription: { fontSize: 13, marginBottom: 8 },
  taskFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taskEstimate: { fontSize: 12, fontWeight: '600' },
  taskStatus: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12 },
  taskStatusText: { fontSize: 11, fontWeight: '600' },
  emptyState: { padding: 16, alignItems: 'center' },
  emptyText: { fontSize: 13, fontStyle: 'italic' },
});
