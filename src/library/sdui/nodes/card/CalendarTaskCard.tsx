import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';

// State badge icons (Figma 3753:5144 / 5158 / 5172). Each carries its own colours, so no tint.
import StateDoneIcon from '../../../../theme/icons/statedone.svg';
import StateMissedIcon from '../../../../theme/icons/statemissed.svg';
import StateNotReadyIcon from '../../../../theme/icons/statenotready.svg';
import DurationIcon from '../../../../theme/icons/duration.svg';

import {
  getColorTokens,
  layout as layoutTokens,
  cardShadow,
  textStyle,
  withAlpha,
  taskStatusColors,
} from '../../../../theme/theme';
import type { SDUIContext } from '../../types';
import { TYPE_COLORS, TASK_TINT, type TaskCardType } from './TaskCardNode';
import { TaskIcon } from './TaskIcon';

/** A task's state on the calendar timeline, which keeps every card for the day, done and expired too. */
export type CalendarTaskState = 'available' | 'done' | 'missed' | 'notReady';

/** Badge icon and copy per state; colours come from `taskStatusColors`, shared with the calendar rail. */
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
  /** Clock time shown on the card, already formatted (e.g. "9:00"). Omit for a task with no set time. */
  time?: string;
  /** `available` only: est. duration ("10 min") and time-left until expiry ("24H 00M"). */
  duration?: string;
  expirationTime?: string;
  /** Whether the task expires. False for an on-demand task, which hides the expiry pill. */
  expires?: boolean;
  newTask?: boolean;
  /** Optional study-supplied icon URL for the `available` badge (see `TaskIcon` / `AssessmentConfig.icon`). */
  iconUrl?: string;
}

/**
 * A calendar task card; presses are handled by `CalendarTaskView`. `available` shows the type-coloured
 * icon, time, name and info pills; the other states are pastel cards led by the state's headline.
 */
export function CalendarTaskCard(props: CalendarTaskCardProps) {
  const { context, state, taskType, taskName, time, duration, expirationTime, newTask, iconUrl } =
    props;
  const expires = props.expires !== false;
  const isDark = context.colorScheme === 'dark';

  if (state === 'available') {
    const tokens = getColorTokens(isDark ? 'dark' : 'light', context.theme.brandColors);
    // Pills take the task-type colour, as on `TaskCardNode`.
    const typeColor = TYPE_COLORS[taskType];
    const infoPill = [
      styles.pill,
      styles.infoPill,
      { backgroundColor: withAlpha(typeColor, TASK_TINT) },
    ];
    const pillText = [styles.pillText, { color: typeColor }];
    return (
      <View style={[styles.card, { backgroundColor: tokens.card.task.background }]}>
        <View style={styles.row}>
          <TaskIcon taskType={taskType} iconUrl={iconUrl} size={BADGE_SIZE} />
          <View style={styles.content}>
            <View style={styles.topRow}>
              <View style={styles.nameCol}>
                {!!time && (
                  <Text
                    style={[styles.time, { color: withAlpha(isDark ? '#FFFFFF' : '#000000', 0.5) }]}
                  >
                    {time}
                  </Text>
                )}
                <Text style={[styles.headline, { color: tokens.text.primary }]} numberOfLines={1}>
                  {taskName}
                </Text>
              </View>
              {newTask && (
                <View style={[styles.pill, styles.newBadge]}>
                  <Text style={styles.newBadgeText}>New Task!</Text>
                </View>
              )}
            </View>
            {(expires || !!duration) && (
              <View style={styles.pillRow}>
                {expires && (
                  <View style={infoPill}>
                    <Text style={pillText}>{`Expires in ${expirationTime ?? '24H 00M'}`}</Text>
                  </View>
                )}
                {!!duration && (
                  <View style={infoPill}>
                    <DurationIcon width={12} height={12} color={typeColor} />
                    <Text style={pillText}>{duration}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }

  const { Icon, label, pillPrefix } = STATE_META[state];
  const c = taskStatusColors[state];
  const tone = isDark ? c.dark : c.light;
  return (
    <View style={[styles.card, { backgroundColor: tone.card }]}>
      <View style={styles.row}>
        {/* Dark mode swaps fill and glyph so the badge reads on the dark card. */}
        <View style={[styles.stateBadge, { backgroundColor: isDark ? c.icon : c.circle }]}>
          <Icon width={36} height={36} color={isDark ? c.circle : c.icon} />
        </View>
        <View style={[styles.content, styles.stateContent]}>
          {/* Not-ready's grey label is too faint on its grey card, so it takes the darker name tone. */}
          <Text
            style={[styles.headline, { color: state === 'notReady' ? tone.name : tone.label }]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {/* Name and timing stack beneath the headline, so a long name gets the full width. */}
          <View style={styles.statePillStack}>
            {[taskName, `${pillPrefix} ${time ?? ''}`].map((text, i) => (
              <View key={i} style={[styles.pill, styles.statePill]}>
                <Text style={[styles.pillText, { color: c.pillText }]} numberOfLines={1}>
                  {text}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const BADGE_SIZE = 64;

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: layoutTokens.radiusCard,
    padding: layoutTokens.gap,
    ...cardShadow,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, width: '100%' },
  // A fixed size: stretched to the text, the badge grew the card and squeezed the headline.
  stateBadge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  content: { flex: 1, minWidth: 0, gap: layoutTokens.gap, justifyContent: 'center' },
  // Tighter, so the two stacked pills don't make this card taller than the available one.
  stateContent: { gap: 4 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layoutTokens.gap,
    width: '100%',
  },
  nameCol: { flex: 1, minWidth: 0, gap: 4 },
  time: { ...textStyle(12, 14, 'bold'), fontWeight: '700' },
  // Line height above the font size so descenders aren't clipped on Android.
  headline: { ...textStyle(24, 28, 'bold'), fontWeight: '700' },
  newBadge: { flexShrink: 0, backgroundColor: taskStatusColors.newBadge },
  newBadgeText: { ...textStyle(10, 12, 'regular'), color: '#FFFFFF' },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  pill: {
    minHeight: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layoutTokens.pillPaddingHorizontal,
    paddingVertical: layoutTokens.pillPaddingVertical,
    borderRadius: layoutTokens.radiusPill,
  },
  infoPill: { flexDirection: 'row', gap: 2 },
  pillText: textStyle(12, 14, 'regular'),
  statePillStack: { alignItems: 'flex-start', gap: 4, maxWidth: '100%' },
  statePill: { maxWidth: '100%', backgroundColor: '#FFFFFF' },
});
