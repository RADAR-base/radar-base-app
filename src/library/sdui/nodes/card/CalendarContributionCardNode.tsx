import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useCoreServices } from '../../../../core/CoreServicesContext';
import { EVENTS } from '../../../../core/EventBus';
import type { ScheduleService, Task } from '../../../../types';
import InfoIcon from '../../../../theme/icons/infofilled.svg';
import {
  cardShadow,
  fontFamily,
  getColorTokens,
  layout as layoutTokens,
  readableTextColor,
  resolveBackground,
  tracking,
  withAlpha,
} from '../../../../theme/theme';
import { CloseIcon } from '../../ConfirmModal';
import { ModalShell } from '../../ModalShell';
import type { NodeProps } from '../../types';
import { inferTaskType } from '../section/TaskDayList';
import { deviceColor, parseDevices, type StudyDevice } from './deviceTypes';
import { TYPE_COLORS } from './taskTypes';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const CELL_GAP = 4;

// Ring proportions from the Figma wheel (33.7pt), as fractions of the wheel's size.
const OUTER_RADIUS = 0.4375;
const OUTER_STROKE = 0.125;
const INNER_RADIUS = 0.2652;
const INNER_STROKE = 0.1125;
const DAY_FONT = 0.24;
/** Keeps the outer ring off the edge of its box, where its anti-aliased rim would be cut flat. */
const RING_MARGIN = 1;
/** The wheel's size in the day's detail dialog. */
const DETAIL_WHEEL = 132;
/** Space left between neighbouring slices, on top of their round caps. */
const SLICE_GAP_DEG = 4;
/** The device ring's segments (Figma 4393:2963): slots around the ring, shared out between devices. */
const DEVICE_SEGMENTS = 18;
/** Share of a slot left empty between neighbouring segments. */
const SEGMENT_GAP = 0.12;
/** A segment's corner radius, as a share of its width. */
const SEGMENT_ROUND = 0.4;
/** Stand-ins for a study that lists no devices, and how full each example slice is. */
const EXAMPLE_DEVICES: StudyDevice[] = [
  { name: 'Phone', kind: 'phone' },
  { name: 'Watch', kind: 'watch' },
];
const EXAMPLE_FILLS = [1, 0.55, 0.8, 0.4];
/** The dialog's description grey (Figma); dark mode softens the text colour instead. */
const INFO_MUTED_LIGHT = '#686868';

/** One slice of a ring: its colour and how much of the slice it fills (0..1). */
interface Slice {
  color: string;
  fill: number;
}

interface DayContribution {
  tasks: Slice[];
  completed: number;
  devices: Slice[];
}

/**
 * A month of contribution (Figma 4309:4595). Each day is a wheel: the outer ring has one slice per
 * scheduled task, coloured by type once completed; the inner ring has one slice per device in
 * `devices`, coloured by the kind of device and filled by how much data it collected.
 *
 * `devices` takes names (`"Apple Watch"`, kind inferred) or `{ "name": …, "type": "ring" }`.
 */
export function CalendarContributionCardNode({ node, context }: NodeProps) {
  const { schedule, eventBus } = useCoreServices();
  const mode = context.colorScheme ?? 'light';
  const allTokens = getColorTokens(mode, context.theme.brandColors);
  const tokens = allTokens.card.contribution;

  const label = typeof node.label === 'string' ? node.label : 'Your Contribution';
  const devices = useMemo(() => parseDevices(node.devices), [node.devices]);
  const placeholder = node.placeholder === 'random';

  const [month] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  // Monday-first, so Sunday's 0 becomes 6.
  const leadingBlanks = (month.getDay() + 6) % 7;

  const [tasksByDay, setTasksByDay] = useState<Map<number, Task[]>>(new Map());
  const load = useCallback(async () => {
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 1, 0, 0, 0, -1);
    const tasks = await schedule.getTasksForRange(month, end);
    const byDay = new Map<number, Task[]>();
    for (const task of tasks) {
      const day = new Date(task.timestamp).getDate();
      byDay.set(day, [...(byDay.get(day) ?? []), task]);
    }
    setTasksByDay(byDay);
  }, [schedule, month]);

  useEffect(() => {
    const reload = () => void load();
    reload();
    eventBus.on(EVENTS.SCHEDULE_UPDATED, reload);
    eventBus.on(EVENTS.TASK_COMPLETED, reload);
    return () => {
      eventBus.off(EVENTS.SCHEDULE_UPDATED, reload);
      eventBus.off(EVENTS.TASK_COMPLETED, reload);
    };
  }, [eventBus, load]);

  const contribution = useCallback(
    (day: number): DayContribution => {
      const tasks = ringOrder(tasksByDay.get(day) ?? []);
      const taskSlices: Slice[] = tasks.map(task =>
        isCompleted(task) ? { color: taskColor(task), fill: 1 } : { color: tokens.track, fill: 0 },
      );
      const date = new Date(month.getFullYear(), month.getMonth(), day);
      const deviceSlices: Slice[] = devices.map((device, i) => ({
        color: deviceColor(device.kind, mode),
        fill: deviceCoverage(date, i, placeholder),
      }));
      const completed = tasks.filter(isCompleted).length;
      return { tasks: taskSlices, completed, devices: deviceSlices };
    },
    [tasksByDay, devices, placeholder, month, tokens.track, mode],
  );

  // Wheels are sized from the card's measured width, as the Figma cells are (7 across).
  const [gridWidth, setGridWidth] = useState(0);
  const cell = gridWidth > 0 ? Math.floor((gridWidth - CELL_GAP * 6) / 7) : 0;

  const cells: (number | null)[] = [
    ...Array<null>(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  const [infoOpen, setInfoOpen] = useState(false);
  // `shownDay` outlives `openDay` so the dialog keeps its content while it animates out.
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [shownDay, setShownDay] = useState(1);
  const openDetail = (day: number) => {
    setShownDay(day);
    setOpenDay(day);
  };
  const monthName = month.toLocaleDateString(undefined, { month: 'long' });

  return (
    <View style={[styles.card, { backgroundColor: allTokens.card.background }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: tokens.label }]}>{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="What do the rings mean?"
          hitSlop={8}
          onPress={() => setInfoOpen(true)}
        >
          <InfoIcon width={22} height={22} color={tokens.info} />
        </Pressable>
      </View>

      <View style={styles.row} onLayout={e => setGridWidth(e.nativeEvent.layout.width)}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={[styles.weekday, { color: allTokens.text.primary }]}>
            {d}
          </Text>
        ))}
      </View>

      {cell > 0 &&
        weeks.map((week, w) => (
          <View key={w} style={styles.row}>
            {week.map((day, i) => {
              if (day === null) return <View key={i} style={{ width: cell, height: cell }} />;
              const c = contribution(day);
              return (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={`${day} ${monthName}: ${c.completed} of ${c.tasks.length} tasks completed`}
                  onPress={() => openDetail(day)}
                  style={({ pressed }) => (pressed ? styles.pressed : null)}
                >
                  <ContributionWheel
                    size={cell}
                    day={day}
                    tasks={c.tasks}
                    devices={c.devices}
                    track={tokens.track}
                    textColor={allTokens.text.primary}
                  />
                </Pressable>
              );
            })}
          </View>
        ))}

      <DayDetailModal
        visible={openDay !== null}
        onClose={() => setOpenDay(null)}
        context={context}
        schedule={schedule}
        date={new Date(month.getFullYear(), month.getMonth(), shownDay)}
        tasks={ringOrder(tasksByDay.get(shownDay) ?? [])}
        contribution={contribution(shownDay)}
        devices={devices}
      />

      <ContributionInfoModal
        visible={infoOpen}
        onClose={() => setInfoOpen(false)}
        context={context}
        devices={devices}
      />
    </View>
  );
}

function isCompleted(task: Task): boolean {
  return task.completed || task.state === 'completed';
}

function taskColor(task: Task): string {
  return TYPE_COLORS[inferTaskType(task.title, task.taskType)];
}

/** Completed tasks first, in the order they were done, then the rest by schedule. */
function ringOrder(tasks: Task[]): Task[] {
  const done = tasks.filter(isCompleted);
  const rest = tasks.filter(t => !isCompleted(t));
  done.sort((a, b) => (a.timeCompleted ?? a.timestamp) - (b.timeCompleted ?? b.timestamp));
  rest.sort((a, b) => a.timestamp - b.timestamp);
  return [...done, ...rest];
}

function taskStatus(task: Task, schedule: ScheduleService): string {
  if (isCompleted(task)) {
    return task.timeCompleted
      ? `Completed ${new Date(task.timeCompleted).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'Completed';
  }
  if (schedule.isTaskExpired(task)) return 'Missed';
  return task.timestamp > Date.now() ? 'Upcoming' : 'To do';
}

/** How much of the day a device covered, 0..1. */
function deviceCoverage(date: Date, device: number, placeholder: boolean): number {
  // TODO: read each device's coverage for the day from its data source once one exists.
  if (!placeholder || date.getTime() > Date.now()) return 0;
  // Stable per day and device, so the preview doesn't reshuffle on every render.
  const seed = Math.sin(date.getDate() * 12.9898 + device * 78.233) * 43758.5453;
  return 0.4 + 0.6 * (seed - Math.floor(seed));
}

function ContributionWheel({
  size,
  day,
  tasks,
  devices,
  track,
  textColor,
}: {
  size: number;
  /** Omitted for an example wheel that stands for no particular day. */
  day?: number;
  tasks: Slice[];
  devices: Slice[];
  track: string;
  textColor: string;
}) {
  const centre = size / 2;
  const ring = size - RING_MARGIN * 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Ring
          centre={centre}
          radius={ring * OUTER_RADIUS}
          stroke={ring * OUTER_STROKE}
          slices={tasks}
          track={track}
        />
        {devices.length > 0 && (
          <SegmentRing
            centre={centre}
            radius={ring * INNER_RADIUS}
            stroke={ring * INNER_STROKE}
            slices={devices}
            track={track}
          />
        )}
      </Svg>
      {day !== undefined && (
        <Text
          style={[
            styles.day,
            { color: textColor, fontSize: size * DAY_FONT, lineHeight: size * DAY_FONT * 1.2 },
          ]}
        >
          {day}
        </Text>
      )}
    </View>
  );
}

/** A full-circle track with each slice's filled share drawn over it, clockwise from twelve. */
function Ring({
  centre,
  radius,
  stroke,
  slices,
  track,
}: {
  centre: number;
  radius: number;
  stroke: number;
  slices: Slice[];
  track: string;
}) {
  const span = 360 / Math.max(slices.length, 1);
  // Round caps reach past an arc's ends, so pull each end in by the cap plus half the gap.
  const inset = ((stroke / 2 / radius) * 180) / Math.PI + SLICE_GAP_DEG / 2;
  return (
    <>
      <Circle cx={centre} cy={centre} r={radius} stroke={track} strokeWidth={stroke} fill="none" />
      {slices.map((slice, i) => {
        if (slice.fill <= 0) return null;
        const start = i * span + inset;
        const end = Math.max(start + 0.01, start + (span - inset * 2) * Math.min(slice.fill, 1));
        return (
          <Path
            key={i}
            d={arcPath(centre, radius, start, end)}
            stroke={slice.color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
          />
        );
      })}
    </>
  );
}

/**
 * The device ring (Figma 4393:2963): a solid track with rounded segments on it. Each device gets an
 * equal run of slots and lights as many as its share of the day, so the ring reads apart from the task
 * ring by shape as well as colour.
 */
function SegmentRing({
  centre,
  radius,
  stroke,
  slices,
  track,
}: {
  centre: number;
  radius: number;
  stroke: number;
  slices: Slice[];
  track: string;
}) {
  const perSlice = Math.max(1, Math.round(DEVICE_SEGMENTS / Math.max(slices.length, 1)));
  const slot = 360 / (perSlice * Math.max(slices.length, 1));
  const width = ((2 * Math.PI * radius * slot) / 360) * (1 - SEGMENT_GAP);
  return (
    <>
      <Circle cx={centre} cy={centre} r={radius} stroke={track} strokeWidth={stroke} fill="none" />
      {slices.flatMap((slice, i) => {
        if (slice.fill <= 0) return [];
        // Any data at all lights at least one segment.
        const lit = Math.max(1, Math.round(Math.min(slice.fill, 1) * perSlice));
        return Array.from({ length: lit }, (_, j) => (
          <Rect
            key={`${i}-${j}`}
            x={centre - width / 2}
            y={centre - radius - stroke / 2}
            width={width}
            height={stroke}
            rx={width * SEGMENT_ROUND}
            fill={slice.color}
            transform={`rotate(${(i * perSlice + j + 0.5) * slot} ${centre} ${centre})`}
          />
        ));
      })}
    </>
  );
}

function arcPath(centre: number, radius: number, fromDeg: number, toDeg: number): string {
  const point = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${centre + radius * Math.cos(rad)} ${centre + radius * Math.sin(rad)}`;
  };
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${point(fromDeg)} A ${radius} ${radius} 0 ${large} 1 ${point(toDeg)}`;
}

/** One day's wheel, enlarged, with the tasks and device data behind it. */
function DayDetailModal({
  visible,
  onClose,
  context,
  schedule,
  date,
  tasks,
  contribution,
  devices,
}: {
  visible: boolean;
  onClose: () => void;
  context: NodeProps['context'];
  schedule: ScheduleService;
  date: Date;
  tasks: Task[];
  contribution: DayContribution;
  devices: StudyDevice[];
}) {
  const mode = context.colorScheme ?? 'light';
  const tokens = getColorTokens(mode, context.theme.brandColors);
  const ring = tokens.card.contribution;
  const primary = tokens.button.background;
  const text = tokens.text.primary;
  const muted = withAlpha(text, 0.6);
  const title = date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <ModalShell visible={visible} onClose={onClose} brandColors={context.theme.brandColors}>
      <ContributionWheel
        size={DETAIL_WHEEL}
        day={date.getDate()}
        tasks={contribution.tasks}
        devices={contribution.devices}
        track={ring.track}
        textColor={text}
      />
      <Text
        style={[
          styles.modalTitle,
          { color: readableTextColor(tokens.card.background, { preferred: primary }) },
        ]}
      >
        {title}
      </Text>

      <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailBody}>
        <View style={styles.detailSection}>
          <Text style={[styles.label, { color: ring.label }]}>
            {tasks.length
              ? `Tasks · ${contribution.completed} of ${tasks.length} completed`
              : 'Tasks'}
          </Text>
          {tasks.length === 0 && (
            <Text style={[styles.detailStatus, { color: muted }]}>No tasks were scheduled.</Text>
          )}
          {tasks.map(task => (
            <DetailRow
              key={task.id}
              dot={isCompleted(task) ? taskColor(task) : ring.track}
              name={task.title}
              status={taskStatus(task, schedule)}
              text={text}
              muted={muted}
            />
          ))}
        </View>

        {devices.length > 0 && (
          <View style={styles.detailSection}>
            <Text style={[styles.label, { color: ring.label }]}>Data received</Text>
            {devices.map(({ name, kind }, i) => {
              const fill = contribution.devices[i]?.fill ?? 0;
              return (
                <DetailRow
                  key={`${name}-${i}`}
                  dot={fill > 0 ? deviceColor(kind, mode) : ring.track}
                  name={name}
                  status={fill > 0 ? `${Math.round(fill * 100)}% of the day` : 'No data'}
                  text={text}
                  muted={muted}
                />
              );
            })}
          </View>
        )}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={({ pressed }) => [
          styles.modalCta,
          { backgroundColor: primary, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text
          style={[
            styles.modalCtaText,
            { color: readableTextColor(primary, { preferred: tokens.button.text }) },
          ]}
        >
          Done
        </Text>
      </Pressable>
    </ModalShell>
  );
}

function DetailRow({
  dot,
  name,
  status,
  text,
  muted,
}: {
  dot: string;
  name: string;
  status: string;
  text: string;
  muted: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={[styles.detailDot, { backgroundColor: dot }]} />
      <Text style={[styles.detailName, { color: text }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.detailStatus, { color: muted }]}>{status}</Text>
    </View>
  );
}

/** Explains the two rings, each with an example wheel (Figma 4388:2809). */
function ContributionInfoModal({
  visible,
  onClose,
  context,
  devices,
}: {
  visible: boolean;
  onClose: () => void;
  context: NodeProps['context'];
  devices: StudyDevice[];
}) {
  const mode = context.colorScheme ?? 'light';
  const tokens = getColorTokens(mode, context.theme.brandColors);
  const ring = tokens.card.contribution;
  const surface = resolveBackground(context.theme, mode);
  const brand = tokens.button.background;
  const muted = mode === 'dark' ? withAlpha(tokens.text.primary, 0.65) : INFO_MUTED_LIGHT;

  // The real task-type colours, so the example matches the wheels on the calendar.
  const exampleTasks: Slice[] = (['questionnaire', 'speech', 'physical', 'cognitive'] as const).map(
    type => ({ color: TYPE_COLORS[type], fill: 1 }),
  );
  // The study's own devices when it lists them, so the example matches the calendar.
  const shown = devices.length ? devices : EXAMPLE_DEVICES;
  const exampleDevices: Slice[] = shown.map((device, i) => ({
    color: deviceColor(device.kind, mode),
    fill: EXAMPLE_FILLS[i % EXAMPLE_FILLS.length],
  }));

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      brandColors={context.theme.brandColors}
      surfaceStyle={[styles.infoCard, { backgroundColor: surface }]}
    >
      <View style={styles.infoCloseRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          hitSlop={8}
        >
          {({ pressed }) => (
            <CloseIcon
              circleColor={pressed ? brand : tokens.card.stats.openBadge}
              iconColor={pressed ? tokens.navbar.text.primary : tokens.card.stats.openIcon}
            />
          )}
        </Pressable>
      </View>

      <View style={styles.infoBody}>
        <View style={styles.infoHeading}>
          <Text
            style={[styles.infoTitle, { color: readableTextColor(surface, { preferred: brand }) }]}
          >
            Your Contribution
          </Text>
          <Text style={[styles.infoSubtitle, { color: muted }]}>
            Each circle is one day in the study. The fuller it is, the more you took part that day.
          </Text>
        </View>

        <View style={styles.infoRows}>
          <InfoRow
            title="Tasks you completed"
            body="The outer ring fills in as you finish that day’s tasks. Each colour is a different kind of task."
            text={tokens.text.primary}
            muted={muted}
            renderWheel={size => (
              <ContributionWheel
                size={size}
                tasks={exampleTasks}
                devices={[{ color: ring.track, fill: 0 }]}
                track={ring.track}
                textColor={tokens.text.primary}
              />
            )}
          />
          <InfoRow
            title="Data from your devices"
            body="The inner ring shows the data your connected devices sent that day. Each device has its own colour, and more of its segments light up the more data it sends."
            text={tokens.text.primary}
            muted={muted}
            renderWheel={size => (
              <ContributionWheel
                size={size}
                tasks={[]}
                devices={exampleDevices}
                track={ring.track}
                textColor={tokens.text.primary}
              />
            )}
          />
        </View>
      </View>
    </ModalShell>
  );
}

/**
 * One explanation with its example wheel, sized to the height of the title and description beside it
 * (the Figma wheel stretches to its row). A larger wheel only narrows the text, never shortens it, so
 * starting from 0 the size settles in a pass or two.
 */
function InfoRow({
  title,
  body,
  text,
  muted,
  renderWheel,
}: {
  title: string;
  body: string;
  text: string;
  muted: string;
  renderWheel: (size: number) => React.ReactNode;
}) {
  const [size, setSize] = useState(0);
  return (
    <View style={styles.infoRow}>
      <View style={{ width: size, height: size }}>{size > 0 && renderWheel(size)}</View>
      <View style={styles.infoRowText}>
        <View
          style={styles.infoRowHeading}
          onLayout={e => {
            const height = Math.round(e.nativeEvent.layout.height);
            setSize(current => (Math.abs(current - height) > 1 ? height : current));
          }}
        >
          <Text style={[styles.infoRowTitle, { color: text }]}>{title}</Text>
          <Text style={[styles.infoRowBody, { color: muted }]}>{body}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    padding: layoutTokens.cardPadding,
    borderRadius: layoutTokens.radiusCard,
    gap: layoutTokens.gap,
    ...cardShadow,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: CELL_GAP,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  day: {
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  pressed: {
    transform: [{ scale: 0.92 }],
  },
  detailScroll: {
    alignSelf: 'stretch',
    maxHeight: 280,
    flexGrow: 0,
  },
  detailBody: {
    gap: 16,
    paddingTop: 4,
  },
  detailSection: {
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  detailName: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  detailStatus: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  modalTitle: {
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  /** Figma 4388:2809: 32pt padding, 16pt between the close row and the body. */
  infoCard: {
    padding: 32,
    gap: 16,
  },
  infoCloseRow: {
    width: '100%',
    flexDirection: 'row',
  },
  infoBody: {
    width: '100%',
    gap: 32,
  },
  infoHeading: {
    gap: 16,
  },
  infoTitle: {
    fontSize: 24,
    lineHeight: 28,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  infoSubtitle: {
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  infoRows: {
    gap: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 32,
  },
  infoRowText: {
    flex: 1,
    gap: 9,
  },
  infoRowHeading: {
    gap: 9,
  },
  infoRowTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  infoRowBody: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  modalCta: {
    marginTop: layoutTokens.gap,
    minHeight: 52,
    alignSelf: 'stretch',
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCtaText: {
    fontSize: 16,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    letterSpacing: tracking.semiBold,
    includeFontPadding: false,
  },
});
