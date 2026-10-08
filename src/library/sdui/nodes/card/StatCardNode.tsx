import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';
import CheckinIcon from '../../../../theme/icons/checkin.svg';
import CalendarIcon from '../../../../theme/icons/calendar.svg';
import FireIcon from '../../../../theme/icons/fire.svg';
import MedalIcon from '../../../../theme/icons/medal.svg';
import HeartRateIcon from '../../../../theme/icons/heartrate.svg';
import { tracking, fontFamily, getColorTokens, layout as layoutTokens, cardShadow } from '../../../../theme/theme';
import { useLocalMetric, type LocalMetricName } from '../../useLocalMetric';
import type { NodeProps } from '../../types';

type EngagementTokenKey =
  | 'checkinBadge'
  | 'checkinIcon'
  | 'activedaysBadge'
  | 'activedaysIcon'
  | 'dataBadge'
  | 'dataIcon'
  | 'streakBadge'
  | 'streakIcon'
  | 'longstreakBadge'
  | 'longstreakIcon';

export type StatCardType = 'checkIn' | 'activeDays' | 'currentStreak' | 'longestStreak' | 'data';
export type StatCardSize = 'large' | 'small';

const DEFAULT_LABEL: Record<StatCardType, string> = {
  checkIn: 'Daily Check-ins',
  activeDays: 'Active Days',
  currentStreak: 'Current Streak',
  longestStreak: 'Longest Streak',
  data: 'Data Name',
};

const ICON: Record<StatCardType, ComponentType<SvgProps>> = {
  checkIn: CheckinIcon,
  activeDays: CalendarIcon,
  currentStreak: FireIcon,
  longestStreak: MedalIcon,
  data: HeartRateIcon,
};

const ICON_SIZE: Record<StatCardType, { width: number; height: number }> = {
  checkIn: { width: 24, height: 22 },
  activeDays: { width: 20, height: 20 },
  currentStreak: { width: 14, height: 20 },
  longestStreak: { width: 16, height: 22 },
  data: { width: 21, height: 18 },
};

// Figma's "Stats" component set (node 1980:1637) gives checkIn the standard pill radius;
// the other three types use 18 (an exact circle for their 36x36 badge).
const BADGE_RADIUS: Record<StatCardType, number> = {
  checkIn: layoutTokens.radiusPill,
  activeDays: 18,
  currentStreak: 18,
  longestStreak: 18,
  data: 18,
};

// ColorTokens' `card.engagement` field names don't follow the statsType strings
// (`streakBadge`/`longstreakIcon`, not `currentStreakBadge`/`longestStreakIcon`), so map
// explicitly rather than interpolating.
const BADGE_TOKEN: Record<StatCardType, EngagementTokenKey> = {
  checkIn: 'checkinBadge',
  activeDays: 'activedaysBadge',
  currentStreak: 'streakBadge',
  longestStreak: 'longstreakBadge',
  data: 'dataBadge',
};

const ICON_TOKEN: Record<StatCardType, EngagementTokenKey> = {
  checkIn: 'checkinIcon',
  activeDays: 'activedaysIcon',
  currentStreak: 'streakIcon',
  longestStreak: 'longstreakIcon',
  data: 'dataIcon',
};

/**
 * The local metric each stat type means, for a blueprint that doesn't name one.
 *
 * `checkIn` has none: there is no app-computed check-in count, so those cards keep taking their
 * number from the blueprint's own `value` as they always have.
 */
const DEFAULT_METRIC: Record<StatCardType, LocalMetricName | ''> = {
  checkIn: '',
  activeDays: 'active_days',
  currentStreak: 'current_streak',
  longestStreak: 'longest_streak',
  // A reading, not an app-computed metric — the blueprint supplies it, like `checkIn`.
  data: '',
};

/**
 * Engagement stat card — matches the Figma `Stats` component set (node 1980:1637),
 * which exposes a `statsType` variant (checkIn / activeDays / currentStreak /
 * longestStreak) and a `size` variant (large / small). Both are config-selectable via
 * the blueprint's `statsType` / `size` node props.
 *
 * `activeDays` is themed off `text.primary` rather than `card.engagement.text` for its
 * title/value color — a quirk of the source tokens, preserved here for fidelity.
 */
export function StatCardNode({ node, context }: NodeProps) {
  const statsType: StatCardType =
    node.statsType === 'activeDays' ||
    node.statsType === 'currentStreak' ||
    node.statsType === 'longestStreak' ||
    node.statsType === 'data'
      ? node.statsType
      : 'checkIn';
  const size: StatCardSize = node.size === 'small' ? 'small' : 'large';
  // Figma's standalone card is a fixed 176 wide; composite layouts (e.g.
  // CardSectionNode's `layout: "grid"`) need the card to fill whatever flex cell it's
  // placed in instead, so they set `fillWidth: true`.
  const fillWidth = node.fillWidth === true;
  // A local metric (e.g. `metric: "task_completed"`) drives the value from app data (the task
  // schedule); otherwise fall back to the static `value` from the blueprint.
  //
  // Defaulted from `statsType` when the blueprint names none: a card that says it shows the current
  // streak has already said which number it wants, and having to repeat it in `metric` is a quiet
  // trap — miss it and the card renders a confident `0` forever rather than failing. A blueprint that
  // does set `metric` still wins, so a study can point a stat card at something else.
  const metric =
    typeof node.metric === 'string' && node.metric ? node.metric : DEFAULT_METRIC[statsType];
  const local = useLocalMetric(metric);
  const value = local
    ? local.value
    : typeof node.value === 'string' || typeof node.value === 'number'
      ? node.value
      : 0;
  const label = typeof node.label === 'string' ? node.label : DEFAULT_LABEL[statsType];
  /** The reading's unit — "BPM", "steps". Only `data` draws one; the rest are plain counts. */
  const unit = typeof node.unit === 'string' ? node.unit : '';
  const showKeepItUp = node.showKeepItUp !== false;
  const keepItUpLabel = typeof node.keepItUpLabel === 'string' ? node.keepItUpLabel : 'Keep it up!';

  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);
  const engagement = tokens.card.engagement;
  const badgeColor = engagement[BADGE_TOKEN[statsType]];
  const iconColor = engagement[ICON_TOKEN[statsType]];
  const textColor = statsType === 'activeDays' ? tokens.text.primary : engagement.text;
  // Only the data card shrinks to fit: a reading can be three digits where a streak count is one or
  // two, and `adjustsFontSizeToFit` is fiddly enough on Android not to switch on where nothing needs it.
  const isData = statsType === 'data';
  const unitText = unit ? (
    <Text style={[styles.unit, { color: engagement.unit }]} numberOfLines={1}>
      {unit}
    </Text>
  ) : null;
  const Icon = ICON[statsType];
  const iconSize = ICON_SIZE[statsType];

  const badge = (
    <View
      style={[
        styles.badge,
        { backgroundColor: badgeColor, borderRadius: BADGE_RADIUS[statsType] },
      ]}
    >
      <Icon width={iconSize.width} height={iconSize.height} color={iconColor} />
    </View>
  );

  return (
    <View
      style={[
        styles.card,
        size === 'large' ? styles.cardLarge : styles.cardSmall,
        // A large card in a grid fills its column rather than stopping at `minHeight`.
        //
        // The column stretches to whatever is tallest across the grid, and a `DataWheelCardNode` is
        // taller than this card's 195 (its ring alone is 142). Without this the stat card stops short
        // and its bottom edge sits a few points above the wheel's beside it. Large only: two small
        // cards sharing a column must keep their own 93 each, not split the column between them.
        fillWidth && size === 'large' && styles.cardFill,
        {
          backgroundColor: tokens.card.background,
          width: fillWidth ? '100%' : 176,
        },
      ]}
    >
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
          {label}
        </Text>
        {size === 'large' && badge}
      </View>

      {size === 'large' ? (
        <View style={styles.valuePillWrapper}>
          <View style={styles.valueRowLarge}>
            <Text
              style={[
                styles.valueLarge,
                isData && styles.valueLargeData,
                isData && styles.valueShrink,
                { color: textColor },
              ]}
              numberOfLines={isData ? 1 : undefined}
              adjustsFontSizeToFit={isData}
            >
              {value}
            </Text>
            {unitText}
          </View>
          {showKeepItUp && (
            <View style={[styles.pill, { backgroundColor: badgeColor, alignSelf: 'flex-start' }]}>
              <Text style={[styles.pillText, { color: iconColor }]}>{keepItUpLabel}</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.valueRowSmall}>
          <View style={styles.valueUnitSmall}>
            <Text
              style={[styles.valueSmall, isData && styles.valueShrink, { color: textColor }]}
              numberOfLines={isData ? 1 : undefined}
              adjustsFontSizeToFit={isData}
            >
              {value}
            </Text>
            {unitText}
          </View>
          {badge}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: layoutTokens.cardPadding,
    borderRadius: layoutTokens.radiusCard,
    ...cardShadow,
  },
  // 195 is deliberate, not arbitrary: two stacked small cards (93) plus the 9px gap
  // between them (in CardSectionNode's grid layout) sum to exactly 195 — cardLarge's
  // height — so the two grid columns line up evenly. 93 is itself the minimum that
  // fits cardSmall's content (title + 9px gap + value row) inside a 16px padding on
  // all sides without overflowing into (and visually shrinking) the bottom padding.
  // `minHeight` (not fixed `height`) so the card renders identically at normal font size but grows
  // instead of clipping when accessibility font scaling enlarges the title/value. See fontScaling.ts.
  cardLarge: {
    minHeight: 195,
    justifyContent: 'flex-start',
  },
  cardSmall: {
    minHeight: 93,
    justifyContent: 'space-between',
  },
  /** Grid-only — see the call site. `minHeight` above stays the floor when there is no slack. */
  cardFill: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: layoutTokens.gap,
    marginBottom: layoutTokens.gap,
  },
  title: {
    flexShrink: 1,
    fontSize: 12,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    // lineHeight equal to fontSize clips descenders (g/y/p) on some platforms — give it
    // some breathing room instead of a 1:1 ratio.
    lineHeight: 16,
    letterSpacing: tracking.regular,
  },
  valuePillWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: layoutTokens.gap,
  },
  valueLarge: {
    fontSize: 64,
    fontFamily: fontFamily.bold,
    includeFontPadding: false,
    // Slightly taller than the font size so the top of the digits isn't clipped on Android.
    lineHeight: 72,
    fontWeight: 'bold',
    letterSpacing: tracking.bold,
  },
  /**
   * Value and unit share a baseline, so "BPM" rides the digits (Figma 4289:2376).
   *
   * `baseline`, not `flex-end`: the latter aligns the two *line boxes*, and the value's box is far
   * taller than its digits — which drops the unit a clear line below the number it belongs to.
   */
  valueRowLarge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 16,
  },
  valueUnitSmall: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    flexShrink: 1,
  },
  unit: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    letterSpacing: tracking.regular,
  },
  /** The data card's own size (Figma 4285:2240, `font/size/5xl`) — larger than the counts', since a
   *  reading is the whole point of the card. `lineHeight` stays above the font size; see `valueLarge`. */
  valueLargeData: {
    fontSize: 90,
    // Tighter than the 1.125 ratio above: digits have no descenders, so a box nearer the design's
    // own 69 hugs them and keeps the pill below from being pushed off by dead space.
    lineHeight: 76,
  },
  /** Gives `adjustsFontSizeToFit` a bounded width to shrink within — without it the digits keep
   *  their natural width and run past the card's edge instead. */
  valueShrink: {
    flexShrink: 1,
  },
  valueRowSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  valueSmall: {
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: layoutTokens.letterSpacing,
    // Center the digit's own line box against the 36-tall badge: `alignItems: 'center'` on
    // the row centers the boxes, and trimming Android's extra font padding makes the box hug
    // the glyph so its optical center matches. (iOS/web ignore the flag but don't add that
    // padding in the first place.)
    includeFontPadding: false,
  },
  badge: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    paddingHorizontal: layoutTokens.pillPaddingHorizontal,
    paddingVertical: layoutTokens.pillPaddingVertical,
    borderRadius: layoutTokens.radiusPill,
  },
  pillText: {
    fontSize: layoutTokens.captionFontSize,
    lineHeight: layoutTokens.captionFontSize,
    letterSpacing: layoutTokens.letterSpacing,
  },
});
