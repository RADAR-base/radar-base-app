import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';
import CheckinIcon from '../../../../theme/icons/checkin.svg';
import CalendarIcon from '../../../../theme/icons/calendar.svg';
import FireIcon from '../../../../theme/icons/fire.svg';
import MedalIcon from '../../../../theme/icons/medal.svg';
import { getColorTokens, layout as layoutTokens } from '../../../../theme/theme';
import type { NodeProps } from '../../types';

type EngagementTokenKey =
  | 'checkinBadge'
  | 'checkinIcon'
  | 'activedaysBadge'
  | 'activedaysIcon'
  | 'streakBadge'
  | 'streakIcon'
  | 'longstreakBadge'
  | 'longstreakIcon';

export type StatCardType = 'checkIn' | 'activeDays' | 'currentStreak' | 'longestStreak';
export type StatCardSize = 'large' | 'small';

const DEFAULT_LABEL: Record<StatCardType, string> = {
  checkIn: 'Daily Check-ins',
  activeDays: 'Active Days',
  currentStreak: 'Current Streak',
  longestStreak: 'Longest Streak',
};

const ICON: Record<StatCardType, ComponentType<SvgProps>> = {
  checkIn: CheckinIcon,
  activeDays: CalendarIcon,
  currentStreak: FireIcon,
  longestStreak: MedalIcon,
};

const ICON_SIZE: Record<StatCardType, { width: number; height: number }> = {
  checkIn: { width: 24, height: 22 },
  activeDays: { width: 20, height: 20 },
  currentStreak: { width: 14, height: 20 },
  longestStreak: { width: 16, height: 22 },
};

// Figma's "Stats" component set (node 1980:1637) gives checkIn the standard pill radius;
// the other three types use 18 (an exact circle for their 36x36 badge).
const BADGE_RADIUS: Record<StatCardType, number> = {
  checkIn: layoutTokens.radiusPill,
  activeDays: 18,
  currentStreak: 18,
  longestStreak: 18,
};

// ColorTokens' `card.engagement` field names don't follow the statsType strings
// (`streakBadge`/`longstreakIcon`, not `currentStreakBadge`/`longestStreakIcon`), so map
// explicitly rather than interpolating.
const BADGE_TOKEN: Record<StatCardType, EngagementTokenKey> = {
  checkIn: 'checkinBadge',
  activeDays: 'activedaysBadge',
  currentStreak: 'streakBadge',
  longestStreak: 'longstreakBadge',
};

const ICON_TOKEN: Record<StatCardType, EngagementTokenKey> = {
  checkIn: 'checkinIcon',
  activeDays: 'activedaysIcon',
  currentStreak: 'streakIcon',
  longestStreak: 'longstreakIcon',
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
    node.statsType === 'longestStreak'
      ? node.statsType
      : 'checkIn';
  const size: StatCardSize = node.size === 'small' ? 'small' : 'large';
  // Figma's standalone card is a fixed 176 wide; composite layouts (e.g.
  // CardSectionNode's `layout: "grid"`) need the card to fill whatever flex cell it's
  // placed in instead, so they set `fillWidth: true`.
  const fillWidth = node.fillWidth === true;
  const value = typeof node.value === 'string' || typeof node.value === 'number' ? node.value : 0;
  const label = typeof node.label === 'string' ? node.label : DEFAULT_LABEL[statsType];
  const showKeepItUp = node.showKeepItUp !== false;
  const keepItUpLabel = typeof node.keepItUpLabel === 'string' ? node.keepItUpLabel : 'Keep it up!';

  const tokens = getColorTokens(context.colorScheme ?? 'light');
  const engagement = tokens.card.engagement;
  const badgeColor = engagement[BADGE_TOKEN[statsType]];
  const iconColor = engagement[ICON_TOKEN[statsType]];
  const textColor = statsType === 'activeDays' ? tokens.text.primary : engagement.text;
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
          <Text style={[styles.valueLarge, { color: textColor }]}>{value}</Text>
          {showKeepItUp && (
            <View style={[styles.pill, { backgroundColor: badgeColor, alignSelf: 'flex-start' }]}>
              <Text style={[styles.pillText, { color: iconColor }]}>{keepItUpLabel}</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.valueRowSmall}>
          <Text style={[styles.valueSmall, { color: textColor }]}>{value}</Text>
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
    shadowColor: '#085041',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  // 195 is deliberate, not arbitrary: two stacked small cards (93) plus the 9px gap
  // between them (in CardSectionNode's grid layout) sum to exactly 195 — cardLarge's
  // height — so the two grid columns line up evenly. 93 is itself the minimum that
  // fits cardSmall's content (title + 9px gap + value row) inside a 16px padding on
  // all sides without overflowing into (and visually shrinking) the bottom padding.
  cardLarge: {
    height: 195,
    justifyContent: 'flex-start',
  },
  cardSmall: {
    height: 93,
    justifyContent: 'space-between',
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
    // lineHeight equal to fontSize clips descenders (g/y/p) on some platforms — give it
    // some breathing room instead of a 1:1 ratio.
    lineHeight: 16,
    letterSpacing: layoutTokens.letterSpacing,
  },
  valuePillWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: layoutTokens.gap,
  },
  valueLarge: {
    fontSize: 64,
    lineHeight: 64,
    fontWeight: 'bold',
    letterSpacing: layoutTokens.letterSpacing,
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
