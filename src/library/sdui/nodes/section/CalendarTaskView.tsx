import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';

import { useCoreServices } from '../../../../core/CoreServicesContext';
import { EVENTS } from '../../../../core/EventBus';
import type { TaskView as Task } from '../../../../types';
import { fontFamily, tracking, getColorTokens, resolveBackground } from '../../../../theme/theme';
import TimeMorning from '../../../../theme/icons/timemorning.svg';
import TimeAfternoon from '../../../../theme/icons/timeafternoon.svg';
import TimeEvening from '../../../../theme/icons/timeevening.svg';
import CheckIcon from '../../../../theme/icons/check.svg';
import MissedIcon from '../../../../theme/icons/missed.svg';
import { CalendarTaskCard, type CalendarTaskState } from '../card/CalendarTaskCard';
import { inferTaskType, isExpired } from './TaskDayList';
import type { SDUIContext } from '../../types';

type Slot = 'Morning' | 'Afternoon' | 'Evening';
const SLOT_ORDER: Slot[] = ['Morning', 'Afternoon', 'Evening'];
const SLOT_ICON: Record<Slot, ComponentType<SvgProps>> = {
  Morning: TimeMorning,
  Afternoon: TimeAfternoon,
  Evening: TimeEvening,
};

/** Rail circle fill for the two "terminal" states; `available`/`notReady` circles are open rings
 *  filled with the page background so the connecting line doesn't show through them. */
const DONE_CIRCLE = '#9CB167'; // green/200 — medium enough for a white check
const MISSED_CIRCLE = '#B5DFF2'; // sky/100 — matches the missed card
const GREY = '#A8A9B2'; // neutral/600 — the not-ready rail color

export interface CalendarTaskViewProps {
  context: SDUIContext;
  /** Which calendar day to show. Identity may change per render — the loader keys off the day's
   *  normalized start-of-day timestamp, so a fresh `new Date()` won't reload-loop. */
  date: Date;
}

/**
 * The calendar day view: the full list of a day's tasks down the right, a time-of-day timeline down
 * the left. Unlike `TaskDayList` (home), this keeps **every** card for the day — completed and expired
 * included — grouped into Morning / Afternoon / Evening (only non-empty slots show). Each task's state
 * (available / done / missed / notReady) drives both its card and its rail circle; the connecting bar
 * is the theme navy where tasks are reachable and grey where they're not yet available.
 */
export function CalendarTaskView({ context, date }: CalendarTaskViewProps) {
  const { schedule, eventBus } = useCoreServices();

  const dayStamp = useMemo(() => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [date]);

  const [tasks, setTasks] = useState<Task[]>([]);

  const loadTasks = useCallback(async () => {
    try {
      const instances = await schedule.getTasksForDate(new Date(dayStamp));
      setTasks(instances.map((i) => schedule.toTaskView(i)));
    } catch {
      setTasks([]);
    }
  }, [schedule, dayStamp]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const handler = () => loadTasks();
    eventBus.on(EVENTS.SCHEDULE_UPDATED, handler);
    return () => eventBus.off(EVENTS.SCHEDULE_UPDATED, handler);
  }, [eventBus, loadTasks]);

  // Re-evaluate state (available -> missed, notReady -> available) as wall-clock time passes; nothing
  // else re-renders this purely because time moved. Same 15s cadence as `TaskDayList`.
  const [, tick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(interval);
  }, []);

  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);
  const navy = tokens.background.secondary;
  const pageBg = resolveBackground(context.theme, context.colorScheme ?? 'light');

  const handlePress = (task: Task) => {
    if (task.status === 'completed') return;
    void schedule.markTaskOpened(task.id);
    eventBus.emit(EVENTS.OPEN_TASK_INSTRUCTIONS, {
      taskId: task.id,
      assessmentName: task.assessmentName,
      taskName: task.title,
      description: task.description,
      taskType: inferTaskType(task.title),
      duration: task.estimated_minutes > 0 ? `${task.estimated_minutes} min` : undefined,
      expirationTime: formatExpiration(task),
      questionNumber: task.nQuestions ? `x${task.nQuestions}` : undefined,
    });
  };

  // Group into non-empty time-of-day slots, tasks sorted by their time within each.
  const groups = SLOT_ORDER.map((slot) => ({
    slot,
    items: tasks.filter((t) => slotFor(t) === slot).sort((a, b) => dayMinutes(a) - dayMinutes(b)),
  })).filter((g) => g.items.length > 0);

  // No tasks for this day: render nothing (just the calendar selector above it). The calendar view
  // deliberately doesn't use the home list's ToDoStatus empty-state card.
  if (tasks.length === 0) {
    return null;
  }

  // Flatten to a single ordered list of rail rows (a header, then its cards) so the timeline line runs
  // continuously through headers and cards. Each row carries the color of the line passing through it.
  type Entry =
    | { key: string; kind: 'header'; slot: Slot; railColor: string }
    | { key: string; kind: 'card'; task: Task; state: CalendarTaskState; railColor: string };

  const entries: Entry[] = [];
  for (const group of groups) {
    const firstState = deriveState(group.items[0], dayStamp);
    entries.push({
      key: `h-${group.slot}`,
      kind: 'header',
      slot: group.slot,
      railColor: firstState === 'notReady' ? GREY : navy,
    });
    for (const task of group.items) {
      const state = deriveState(task, dayStamp);
      entries.push({
        key: `c-${task.id}`,
        kind: 'card',
        task,
        state,
        railColor: state === 'notReady' ? GREY : navy,
      });
    }
  }

  return (
    <View style={styles.container}>
      {entries.map((entry, i) => {
        const showTop = i > 0;
        const showBottom = i < entries.length - 1;
        return (
          <View style={styles.railRow} key={entry.key}>
            <View style={styles.railCol}>
              {showTop && <View style={[styles.lineTop, { backgroundColor: entry.railColor }]} />}
              {showBottom && (
                <View style={[styles.lineBottom, { backgroundColor: entry.railColor }]} />
              )}
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
                <Text style={[styles.headerLabel, { color: navy }]}>{entry.slot}</Text>
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
                    taskType={inferTaskType(entry.task.title)}
                    taskName={entry.task.title}
                    time={formatClock(entry.task)}
                    duration={
                      entry.task.estimated_minutes > 0
                        ? `${entry.task.estimated_minutes} min`
                        : undefined
                    }
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

function SlotIcon({ slot, color }: { slot: Slot; color: string }) {
  const Icon = SLOT_ICON[slot];
  // The time-of-day icons' circle is `currentColor`, so `color` greys them out for a not-yet-available
  // slot (matching the grey rail), or paints them theme-navy when the slot is reached.
  return <Icon width={30} height={30} color={color} />;
}

function StateCircle({
  state,
  navy,
  pageBg,
}: {
  state: CalendarTaskState;
  navy: string;
  pageBg: string;
}) {
  if (state === 'done') {
    return (
      <View style={[styles.circle, { backgroundColor: DONE_CIRCLE }]}>
        <CheckIcon width={30} height={30} color="#FFFFFF" />
      </View>
    );
  }
  if (state === 'missed') {
    return (
      <View style={[styles.circle, { backgroundColor: MISSED_CIRCLE }]}>
        <MissedIcon width={16} height={16} color={navy} />
      </View>
    );
  }
  // available / notReady: an open ring filled with the page background (hides the line behind it).
  const border = state === 'available' ? navy : GREY;
  return <View style={[styles.circle, styles.ring, { backgroundColor: pageBg, borderColor: border }]} />;
}

/** Local formatters — the calendar clock reads "9:00" (no leading zero), distinct from `TaskDayList`'s
 *  zero-padded 24-hour form. Expiry uses the same "24H 00M" shape as the home list. */
function dayMinutes(task: Task): number {
  if (task.timestamp != null) {
    const d = new Date(task.timestamp);
    return d.getHours() * 60 + d.getMinutes();
  }
  const m = task.dueTime?.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (m) {
    let hour = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ampm = m[3]?.toUpperCase();
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return hour * 60 + min;
  }
  return 0;
}

function slotFor(task: Task): Slot {
  const hour = Math.floor(dayMinutes(task) / 60);
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

function formatClock(task: Task): string {
  const total = dayMinutes(task);
  const hour = Math.floor(total / 60);
  const min = total % 60;
  return `${hour}:${String(min).padStart(2, '0')}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The card state for a task on the day starting at `dayStart`. Completed always wins. Otherwise the
 * *day* decides first: a day that's already fully elapsed makes every unfinished task **missed**
 * (covers previous days even when a task carries no completion window of its own), and a day still in
 * the future makes everything **not-ready**. Only for *today* do we fall back to the task's own timing.
 */
function deriveState(task: Task, dayStart: number): CalendarTaskState {
  if (task.status === 'completed') return 'done';
  const now = Date.now();
  if (dayStart + DAY_MS <= now) return 'missed';
  if (dayStart > now) return 'notReady';
  if (isExpired(task)) return 'missed';
  if (task.timestamp != null && task.timestamp > now) return 'notReady';
  return 'available';
}

function formatExpiration(task: Task): string | undefined {
  if (!task.timestamp || !task.completionWindow) return undefined;
  const msRemaining = task.timestamp + task.completionWindow - Date.now();
  const totalMin = Math.round(Math.max(msRemaining, 0) / 60_000);
  if (totalMin < 60) return `${totalMin}M`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)}D`;
  return `${hours}H ${String(mins).padStart(2, '0')}M`;
}

const NODE = 30;
const LINE_WIDTH = 6;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  // No vertical gap between rows — the rail line must run unbroken through them. Card spacing comes
  // from `cardContent`'s vertical padding instead, which the (stretched) rail column spans.
  railRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    columnGap: 16,
  },
  railCol: {
    width: NODE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Two half-segments meeting at the node's vertical center, so a row's top and bottom can differ in
  // color (the navy→grey frontier) and the first/last row can drop the outer half.
  // Centered under the node (`left` = half the leftover width) and square-ended so a row's bottom
  // segment butts seamlessly against the next row's top segment.
  lineTop: {
    position: 'absolute',
    top: 0,
    left: (NODE - LINE_WIDTH) / 2,
    height: '50%',
    width: LINE_WIDTH,
  },
  lineBottom: {
    position: 'absolute',
    bottom: 0,
    left: (NODE - LINE_WIDTH) / 2,
    height: '50%',
    width: LINE_WIDTH,
  },
  node: {
    width: NODE,
    height: NODE,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ring: {
    // Match the connecting line's thickness so the open ring reads as part of the same rail.
    borderWidth: LINE_WIDTH-2,
  },
  headerContent: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 6,
  },
  headerLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamily.light,
    fontWeight: '300',
    letterSpacing: tracking.light,
    includeFontPadding: false,
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
  },
});
