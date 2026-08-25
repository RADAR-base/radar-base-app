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

import { fontFamily, tracking, getColorTokens, layout as layoutTokens, cardShadow, withAlpha } from '../../../../theme/theme';
import type { SDUIContext } from '../../types';
import { TYPE_COLORS, TASK_TINT, type TaskCardType } from './TaskCardNode';
import { TaskIcon } from './TaskIcon';

/** The four states a task can be in on the calendar timeline (see `CalendarTaskView`). Unlike the
 *  home task list, the calendar keeps *all* cards for the day — completed and expired included. */
export type CalendarTaskState = 'available' | 'done' | 'missed' | 'notReady';

const NEW_TASK_GREEN = '#9CB167'; // color/green/200

/**
 * Per-state "task progress" card (Figma 3753:5144 / 5158 / 5172): a pastel card in the state hue, a
 * light-tint badge circle holding a semantic icon, a mid-shade label, a dark-shade name, and a white
 * pill with mid-shade text. Fixed colors (like `toDoStatus`/`dataWheel`) — they don't vary by
 * light/dark, so the text is a fixed dark shade that reads on the fixed pastel (all clear WCAG AA).
 */
const STATE_BADGE: Record<
  Exclude<CalendarTaskState, 'available'>,
  {
    Icon: ComponentType<SvgProps>;
    cardBg: string;
    circle: string;
    label: string;
    labelColor: string;
    nameColor: string;
    pillTextColor: string;
    pillPrefix: string;
  }
> = {
  done: {
    Icon: StateDoneIcon,
    cardBg: '#C0DD97', // green/100
    circle: '#E3FAE4', // light green
    label: 'Completed',
    labelColor: '#639922', // green/400
    nameColor: '#27500A', // green/800
    pillTextColor: '#639922', // green/400
    pillPrefix: 'Done at',
  },
  missed: {
    Icon: StateMissedIcon,
    cardBg: '#7EC8E8', // sky/200
    circle: '#E3F4FA', // sky/50
    label: 'We missed you',
    labelColor: '#1778A0', // sky/600
    nameColor: '#0E5474', // sky/800
    pillTextColor: '#2196C4', // sky/500
    pillPrefix: 'Task Expired at',
  },
  notReady: {
    Icon: StateNotReadyIcon,
    cardBg: '#CACBD4', // neutral/500
    circle: '#F6F5F8', // neutral/400
    label: 'Not ready yet',
    labelColor: '#79787F', // neutral/800
    nameColor: '#28313B', // slate surface-mild
    pillTextColor: '#79787F', // neutral/800
    pillPrefix: 'Starts in',
  },
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
 * (see {@link STATE_BADGE}) — a light badge + semantic icon, a state label, the name, and a white pill.
 */
export function CalendarTaskCard(props: CalendarTaskCardProps) {
  const { context, state, taskType, taskName, time, duration, expirationTime, newTask, iconUrl } = props;
  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);

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
                <Text style={styles.time}>{time}</Text>
                <Text style={[styles.name, { color: tokens.text.primary }]} numberOfLines={1}>
                  {taskName}
                </Text>
              </View>
              {newTask && (
                <View style={[styles.newBadge, { backgroundColor: NEW_TASK_GREEN }]}>
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

  const badge = STATE_BADGE[state];
  const Icon = badge.Icon;
  return (
    <View style={[styles.card, { backgroundColor: badge.cardBg }]}>
      <View style={styles.row}>
        <View style={[styles.stateBadge, { backgroundColor: badge.circle }]}>
          <Icon width={36} height={36} />
        </View>
        <View style={styles.content}>
          <View style={styles.nameCol}>
            <Text style={[styles.stateLabel, { color: badge.labelColor }]}>{badge.label}</Text>
            <Text style={[styles.name, { color: badge.nameColor }]} numberOfLines={1}>
              {taskName}
            </Text>
          </View>
          <View style={styles.pillRow}>
            <View style={styles.statePill}>
              <Text style={[styles.statePillText, { color: badge.pillTextColor }]}>
                {`${badge.pillPrefix} ${time}`}
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
  stateLabel: {
    fontSize: 12,
    lineHeight: 14,
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
  statePill: {
    minHeight: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layoutTokens.pillPaddingHorizontal,
    paddingVertical: layoutTokens.pillPaddingVertical,
    borderRadius: layoutTokens.radiusPill,
    backgroundColor: '#FFFFFF',
  },
  statePillText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
});
