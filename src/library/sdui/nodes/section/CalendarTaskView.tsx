import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';

import { useCoreServices } from '../../../../core/CoreServicesContext';
import { EVENTS } from '../../../../core/EventBus';
import type { TaskView as Task } from '../../../../types';
import {
  getColorTokens,
  resolveBackground,
  taskStatusColors,
  readableTextColor,
  calendarRailColor,
  CALENDAR_DEFAULT_ACCENT,
  calendarRail,
  textStyle,
} from '../../../../theme/theme';
import TimeMorning from '../../../../theme/icons/timemorning.svg';
import TimeAfternoon from '../../../../theme/icons/timeafternoon.svg';
import TimeEvening from '../../../../theme/icons/timeevening.svg';
import StateDoneIcon from '../../../../theme/icons/statedone.svg';
import StateMissedIcon from '../../../../theme/icons/statemissed.svg';
import { CalendarTaskCard, type CalendarTaskState } from '../card/CalendarTaskCard';
import { NoTasksEmptyState } from './NoTasksEmptyState';
import { inferTaskType, isExpired } from './TaskDayList';
import type { SDUIContext } from '../../types';

type Slot = 'Morning' | 'Afternoon' | 'Evening';
const SLOT_ORDER: Slot[] = ['Morning', 'Afternoon', 'Evening'];
const SLOT_ICON: Record<Slot, ComponentType<SvgProps>> = {
  Morning: TimeMorning,
  Afternoon: TimeAfternoon,
  Evening: TimeEvening,
};
const STATE_ICON = { done: StateDoneIcon, missed: StateMissedIcon };
const GREY = calendarRail.grey;
const NODE = calendarRail.nodeSize;
const LINE_WIDTH = calendarRail.lineWidth;
const DAY_MS = 24 * 60 * 60 * 1000;

/** One rail row: a slot header, or a card. Each carries the colour of the line through it. */
type Entry = { key: string; railColor: string } & (
  | { kind: 'header'; slot: Slot }
  | { kind: 'card'; task: Task; state: CalendarTaskState; minutes: number }
);

export interface CalendarTaskViewProps {
  context: SDUIContext;
  /** Which calendar day to show. Keyed by its start-of-day, so a fresh `new Date()` won't reload-loop. */
  date: Date;
}

/**
 * The calendar day view: every task for the day, done and expired included, grouped into
 * Morning / Afternoon / Evening beside a timeline. The rail is navy where tasks are reachable and grey
 * where they're not yet available.
 */
export function CalendarTaskView({ context, date }: CalendarTaskViewProps) {
  const { schedule, eventBus } = useCoreServices();
  const dayStamp = useMemo(() => new Date(date).setHours(0, 0, 0, 0), [date]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const loadTasks = useCallback(async () => {
    try {
      const instances = await schedule.getTasksForDate(new Date(dayStamp));
      setTasks(instances.map(i => schedule.toTaskView(i)));
    } catch {
      setTasks([]);
    }
  }, [schedule, dayStamp]);

  useEffect(() => {
    loadTasks();
    eventBus.on(EVENTS.SCHEDULE_UPDATED, loadTasks);
    return () => eventBus.off(EVENTS.SCHEDULE_UPDATED, loadTasks);
  }, [eventBus, loadTasks]);

  // Re-render every 15s so states move on with the clock (available → missed, notReady → available).
  const [, tick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => tick(n => n + 1), 15_000);
    return () => clearInterval(interval);
  }, []);

  const scheme = context.colorScheme ?? 'light';
  const tokens = getColorTokens(scheme, context.theme.brandColors);
  // The rail's "reached" colour matches the selected day in the picker above.
  const accent = context.theme.brandColors?.accent ?? CALENDAR_DEFAULT_ACCENT;
  const navy = calendarRailColor(tokens.header.headerBackground, accent);
  const pageBg = resolveBackground(context.theme, scheme);
  // The rail colour is unreadable on a dark page, so the slot labels fall back when needed.
  const slotLabel = readableTextColor(pageBg, { preferred: navy });

  if (tasks.length === 0) {
    // A plain line: the home list's "all caught up" card speaks for today, not any day paged to.
    return (
      <NoTasksEmptyState context={context} body="Looks like you have no tasks for this day." />
    );
  }

  const handlePress = (task: Task) => {
    if (task.status === 'completed') return;
    void schedule.markTaskOpened(task.id);
    eventBus.emit(EVENTS.OPEN_TASK_INSTRUCTIONS, {
      taskId: task.id,
      assessmentName: task.assessmentName,
      taskName: task.title,
      description: task.description,
      taskType: inferTaskType(task.title, task.taskType),
      startText: task.startText,
      endText: task.endText,
      duration: durationOf(task),
      expirationTime: formatExpiration(task),
      questionNumber: task.nQuestions ? `x${task.nQuestions}` : undefined,
      taskTimestamp: task.timestamp,
    });
  };

  // One flat list of rows, so the rail runs unbroken through headers and cards.
  const railColor = (state: CalendarTaskState) => (state === 'notReady' ? GREY : navy);
  const rows = tasks
    .map(task => ({ task, state: deriveState(task, dayStamp), minutes: dayMinutes(task) }))
    .sort((a, b) => a.minutes - b.minutes);
  const entries: Entry[] = SLOT_ORDER.flatMap(slot => {
    const items = rows.filter(r => slotOf(r.minutes) === slot);
    if (items.length === 0) return [];
    return [
      { key: `h-${slot}`, kind: 'header' as const, slot, railColor: railColor(items[0].state) },
      ...items.map(r => ({
        key: `c-${r.task.id}`,
        kind: 'card' as const,
        ...r,
        railColor: railColor(r.state),
      })),
    ];
  });

  return (
    <View style={styles.container}>
      {entries.map((entry, i) => {
        const line = { backgroundColor: entry.railColor };
        return (
          <View style={styles.railRow} key={entry.key}>
            <View style={styles.railCol}>
              {i > 0 && <View style={[styles.line, styles.lineTop, line]} />}
              {i < entries.length - 1 && <View style={[styles.line, styles.lineBottom, line]} />}
              <View style={styles.node}>
                {entry.kind === 'header' ? (
                  <SlotIcon slot={entry.slot} color={entry.railColor} />
                ) : (
                  <StateCircle state={entry.state} navy={navy} pageBg={pageBg} />
                )}
              </View>
            </View>

            {entry.kind === 'header' ? (
              <View style={styles.headerContent}>
                <Text style={[styles.headerLabel, { color: slotLabel }]}>{entry.slot}</Text>
              </View>
            ) : (
              <View style={styles.cardContent}>
                <Pressable
                  accessibilityRole="button"
                  disabled={entry.state !== 'available'}
                  onPress={() => handlePress(entry.task)}
                  style={({ pressed }) => (pressed ? styles.cardPressed : null)}
                >
                  <CalendarTaskCard
                    context={context}
                    state={entry.state}
                    taskType={inferTaskType(entry.task.title, entry.task.taskType)}
                    taskName={entry.task.title}
                    time={formatClock(entry.task, entry.minutes, entry.state === 'done')}
                    duration={durationOf(entry.task)}
                    expirationTime={formatExpiration(entry.task)}
                    newTask={entry.state === 'available' && entry.task.isNew === true}
                    iconUrl={entry.task.iconUrl}
                  />
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** The icon's circle is `currentColor`, so it greys out with the rail before the slot is reached. */
function SlotIcon({ slot, color }: { slot: Slot; color: string }) {
  const Icon = SLOT_ICON[slot];
  return <Icon width={30} height={30} color={color} />;
}

function StateCircle(props: { state: CalendarTaskState; navy: string; pageBg: string }) {
  const { state, navy, pageBg } = props;
  if (state === 'done' || state === 'missed') {
    const Icon = STATE_ICON[state];
    const c = taskStatusColors[state];
    return (
      <View style={[styles.circle, { backgroundColor: c.circle }]}>
        <Icon width={18} height={18} color={c.icon} />
      </View>
    );
  }
  // An open ring filled with the page colour, which hides the line behind it.
  const borderColor = state === 'available' ? navy : GREY;
  return <View style={[styles.circle, styles.ring, { backgroundColor: pageBg, borderColor }]} />;
}

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

function dayMinutes(task: Task): number {
  if (task.timestamp != null) return minutesOf(new Date(task.timestamp));
  const m = task.dueTime?.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return 0;
  const ampm = m[3]?.toUpperCase();
  let hour = Number(m[1]);
  if (ampm) hour = (hour % 12) + (ampm === 'PM' ? 12 : 0);
  return hour * 60 + Number(m[2]);
}

function slotOf(minutes: number): Slot {
  return minutes < 12 * 60 ? 'Morning' : minutes < 17 * 60 ? 'Afternoon' : 'Evening';
}

const durationOf = (task: Task) =>
  task.estimated_minutes > 0 ? `${task.estimated_minutes} min` : undefined;

/** "9:00", no leading zero. A done card shows when it was finished, if that was recorded. */
function formatClock(task: Task, minutes: number, done: boolean): string {
  const total =
    done && task.timeCompleted != null ? minutesOf(new Date(task.timeCompleted)) : minutes;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Completed wins; then the task's own completion window, which can run past midnight. Only a task
 * without a window falls back to "a past day is missed".
 */
function deriveState(task: Task, dayStart: number): CalendarTaskState {
  if (task.status === 'completed') return 'done';
  const now = Date.now();
  if (isExpired(task)) return 'missed';
  if ((task.timestamp == null || task.completionWindow == null) && dayStart + DAY_MS <= now) {
    return 'missed';
  }
  if (dayStart > now || (task.timestamp != null && task.timestamp > now)) return 'notReady';
  return 'available';
}

/** Time left in the "24H 00M" shape the home list uses. */
function formatExpiration(task: Task): string | undefined {
  if (!task.timestamp || !task.completionWindow) return undefined;
  const totalMin = Math.round(
    Math.max(task.timestamp + task.completionWindow - Date.now(), 0) / 60_000,
  );
  if (totalMin < 60) return `${totalMin}M`;
  const hours = Math.floor(totalMin / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}D`;
  return `${hours}H ${String(totalMin % 60).padStart(2, '0')}M`;
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  // No gap between rows so the rail is unbroken; card spacing comes from `cardContent`'s padding.
  railRow: { flexDirection: 'row', alignItems: 'stretch', columnGap: 16 },
  railCol: { width: NODE, alignItems: 'center', justifyContent: 'center' },
  // Two halves meeting at the node, so a row's top and bottom can differ in colour.
  line: { position: 'absolute', left: (NODE - LINE_WIDTH) / 2, height: '50%', width: LINE_WIDTH },
  lineTop: { top: 0 },
  lineBottom: { bottom: 0 },
  node: { width: NODE, height: NODE, zIndex: 1, alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ring: { borderWidth: LINE_WIDTH - 2 },
  headerContent: { flex: 1, justifyContent: 'center', paddingVertical: 6 },
  headerLabel: { ...textStyle(14, 18, 'light'), fontWeight: '300' },
  cardContent: { flex: 1, minWidth: 0, justifyContent: 'center', paddingVertical: 8 },
  cardPressed: { transform: [{ scale: 0.98 }] },
});
