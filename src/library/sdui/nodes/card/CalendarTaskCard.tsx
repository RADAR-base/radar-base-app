import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';

// State badge icons (Figma calendar "task progress" cards 3753:5144 / 5158 / 5172): a finish flag
// (done), a timer-remove (missed), and a sleeping face (not-ready). Each carries its own colors, so
// they render without a tint.
import StateDoneIcon from '../../../../theme/icons/statedone.svg';
import StateMissedIcon from '../../../../theme/icons/statemissed.svg';
import StateNotReadyIcon from '../../../../theme/icons/statenotready.svg';
import DurationIcon from '../../../../theme/icons/duration.svg';

import {
  fontFamily,
  tracking,
  getColorTokens,
  layout as layoutTokens,
  cardShadow,
  withAlpha,
  taskStatusColors,
} from '../../../../theme/theme';
import type { SDUIContext } from '../../types';
import { TYPE_COLORS, TASK_TINT, type TaskCardType } from './TaskCardNode';
import { TaskIcon } from './TaskIcon';

/** The four states a task can be in on the calendar timeline (see `CalendarTaskView`). Unlike the
 *  home task list, the calendar keeps *all* cards for the day — completed and expired included. */
export type CalendarTaskState = 'available' | 'done' | 'missed' | 'notReady';

/**
 * Per-state content for the "task progress" cards (Figma 3753:5144 / 5158 / 5172): just the badge icon
 * and the copy. All colors come from the shared `taskStatusColors` in the theme (also used by the
 * calendar rail dots), so the palette lives in one place.
 */
const STATE_META: Record<
  Exclude<CalendarTaskState, 'available'>,
  { Icon: ComponentType<SvgProps>; label: string; pillPrefix: string }
> = {
  done: { Icon: StateDoneIcon, label: 'Completed', pillPrefix: 'Done at' },
  missed: { Icon: StateMissedIcon, label: 'We missed you', pillPrefix: 'Task Expired at' },
  notReady: { Icon: StateNotReadyIcon, label: 'Not ready yet', pillPrefix: 'Starts at' },
};

export interface CalendarTaskCardProps {
  context: SDUIContext;
  state: CalendarTaskState;
  taskType: TaskCardType;
  taskName: string;
  /** Clock time shown on the card, already formatted (e.g. "9:00"). */
  time: string;
  /** `available` only: est. duration ("10 min") and time-left until expiry ("24H 00M"). */
  duration?: string;
  expirationTime?: string;
  newTask?: boolean;
  /** Optional study-supplied icon URL for the `available` badge (see `TaskIcon` / `AssessmentConfig.icon`). */
  iconUrl?: string;
}

/**
 * A single calendar task card in one of four states. Presentational only; press handling lives in
 * `CalendarTaskView`.
 *
 * `available` uses the study-configurable `TaskIcon` (type-colored badge) with time + name + "New
 * Task!" + two type-colored info pills. `done`/`missed`/`notReady` are pastel "task progress" cards
 * (see {@link STATE_META} + `taskStatusColors`) — a light badge + semantic icon, a state label, the
 * name, and a white pill.
 */
export function CalendarTaskCard(props: CalendarTaskCardProps) {
  const { context, state, taskType, taskName, time, duration, expirationTime, newTask, iconUrl } = props;
  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);
  const isDark = (context.colorScheme ?? 'light') === 'dark';

  if (state === 'available') {
    // Info pills take the task-type color (15% tint fill, full-color text/icon) — same as TaskCardNode.
    const typeColor = TYPE_COLORS[taskType];
    const pillBg = withAlpha(typeColor, TASK_TINT);
    return (
      <View style={[styles.card, { backgroundColor: tokens.card.task.background }]}>
        <View style={styles.row}>
          <TaskIcon taskType={taskType} iconUrl={iconUrl} size={64} />
          <View style={styles.content}>
            <View style={styles.topRow}>
              <View style={styles.nameCol}>
                <Text
                  style={[styles.time, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }]}
                >
                  {time}
                </Text>
                <Text style={[styles.name, { color: tokens.text.primary }]} numberOfLines={1}>
                  {taskName}
                </Text>
              </View>
              {newTask && (
                <View style={[styles.newBadge, { backgroundColor: taskStatusColors.newBadge }]}>
                  <Text style={styles.newBadgeText}>New Task!</Text>
                </View>
              )}
            </View>
            <View style={styles.pillRow}>
              <View style={[styles.pill, { backgroundColor: pillBg }]}>
                <Text style={[styles.pillText, { color: typeColor }]}>
                  {`Expires in ${expirationTime ?? '24H 00M'}`}
                </Text>
              </View>
              {duration && (
                <View style={[styles.pill, { backgroundColor: pillBg }]}>
                  <DurationIcon width={12} height={12} color={typeColor} />
                  <Text style={[styles.pillText, { color: typeColor }]}>{duration}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  }

  const meta = STATE_META[state];
  const c = taskStatusColors[state];
  const Icon = meta.Icon;
  const m = isDark ? c.dark : c.light;
  // Dark mode inverts the badge — the solid icon color becomes the circle fill and the pale chip
  // color becomes the glyph, so it reads clearly against the dark card. Light mode keeps chip + solid.
  const circleBg = isDark ? c.icon : c.circle;
  const iconColor = isDark ? c.circle : c.icon;
  // Headline color: the state's `label` tone, except not-ready — its grey label is too faint on its
  // grey card, so that one takes the darker `name` tone (matching Figma 3734:4958).
  const statusColor = state === 'notReady' ? m.name : m.label;
  return (
    <View style={[styles.card, { backgroundColor: m.card }]}>
      <View style={styles.row}>
        <View style={[styles.stateBadge, { backgroundColor: circleBg }]}>
          <Icon width={36} height={36} color={iconColor} />
        </View>
        <View style={styles.stateContent}>
          <Text style={[styles.stateLabel, { color: statusColor }]} numberOfLines={1}>
            {meta.label}
          </Text>
          {/* Task name and timing both drop to white pills beneath the status headline, so the state is
              what reads first (Figma 3734:4925 / 4943 / 4958). Stacked rather than side by side, which
              gives a long name (e.g. "Record Blood Pressure") the full content width before it has to
              truncate. */}
          <View style={styles.statePillStack}>
            <View style={styles.statePill}>
              <Text style={[styles.statePillText, { color: c.pillText }]} numberOfLines={1}>
                {taskName}
              </Text>
            </View>
            <View style={styles.statePill}>
              <Text style={[styles.statePillText, { color: c.pillText }]} numberOfLines={1}>
                {`${meta.pillPrefix} ${time}`}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 24,
    padding: layoutTokens.gap,
    ...cardShadow,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    width: '100%',
  },
  // Fixed rather than stretched to the card height: a stretching square grows with the (now taller)
  // stacked text block, which both bulks up the card and steals width from the headline — pushing it to
  // wrap and grow the card again. A fixed size breaks that loop.
  stateBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: layoutTokens.gap,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layoutTokens.gap,
    width: '100%',
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  time: {
    fontSize: 12,
    lineHeight: 14,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
    color: 'rgba(0,0,0,0.5)',
  },
  name: {
    fontSize: 24,
    // Taller than the font size so tall glyphs/descenders aren't clipped on Android.
    lineHeight: 28,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  // The state is the card's headline — everything else drops to a pill beneath it.
  stateLabel: {
    fontSize: 24,
    // Taller than the font size so tall glyphs/descenders aren't clipped on Android ("y" in "yet").
    lineHeight: 28,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  newBadge: {
    flexShrink: 0,
    paddingHorizontal: layoutTokens.pillPaddingHorizontal,
    paddingVertical: layoutTokens.pillPaddingVertical,
    borderRadius: layoutTokens.radiusPill,
  },
  newBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
    color: '#FFFFFF',
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  pill: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: layoutTokens.pillPaddingHorizontal,
    paddingVertical: layoutTokens.pillPaddingVertical,
    borderRadius: layoutTokens.radiusPill,
  },
  pillText: {
    fontSize: 12,
    lineHeight: 14,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  // Like `content`, but with a tighter headline→pills gap: the status card stacks two pills, so the
  // shared 9px gap made it noticeably taller than the available card.
  stateContent: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    justifyContent: 'center',
  },
  // Stacked pills, each hugging its own text. The 4px gap matches the available card's `pillRow`, so
  // both card variants share the same pill rhythm.
  statePillStack: {
    alignItems: 'flex-start',
    gap: 4,
    maxWidth: '100%',
  },
  // Box matches the available card's `pill`: same padding tokens, min height and pill radius.
  statePill: {
    maxWidth: '100%',
    minHeight: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layoutTokens.pillPaddingHorizontal,
    paddingVertical: layoutTokens.pillPaddingVertical,
    borderRadius: layoutTokens.radiusPill,
    backgroundColor: '#FFFFFF',
  },
  // Matches the available card's `pillText` so both card variants read at the same size.
  statePillText: {
    fontSize: 12,
    lineHeight: 14,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
});
