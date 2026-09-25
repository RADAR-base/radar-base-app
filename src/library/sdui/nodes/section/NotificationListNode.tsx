import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';
import BellIcon from '../../../../theme/icons/bell.svg';
import WarningIcon from '../../../../theme/icons/warning.svg';
import AlarmIcon from '../../../../theme/icons/alarm.svg';
import InfoIcon from '../../../../theme/icons/infocircle.svg';
import ArrowRightIcon from '../../../../theme/icons/arrowright.svg';
import {
  tracking,
  fontFamily,
  getColorTokens,
  cardShadow,
  layout as layoutTokens,
  notificationColors,
  withAlpha,
} from '../../../../theme/theme';
import { useNotifications, type AppNotification, type NotificationType } from '../../useNotifications';
import type { NodeProps } from '../../types';

type ColorTokens = ReturnType<typeof getColorTokens>;

/** Opacity for a type's badge fill — derived from its `iconColor`, so one color drives both (like
 *  `TaskCardNode`'s `TASK_TINT`), and the tint adapts to a light/dark card background for free. */
const BADGE_TINT = 0.15;

/**
 * Per-type icon and its size, paired with the colour from the theme.
 *
 * Only the glyph and its dimensions live here — those are this component's business. The colours are
 * `notificationColors`, next to `taskStatusColors` which does the same job for the task cards, so a
 * palette that says what kind of thing something is sits with the rest of the app's palette rather
 * than in the one file that draws it.
 */
const TYPE_STYLES: Record<
  NotificationType,
  { iconColor: string; Icon: ComponentType<SvgProps>; w: number; h: number }
> = {
  default: { iconColor: notificationColors.default, Icon: BellIcon, w: 18, h: 21 },
  warning: { iconColor: notificationColors.warning, Icon: WarningIcon, w: 24, h: 24 },
  expired: { iconColor: notificationColors.expired, Icon: AlarmIcon, w: 22, h: 22 },
  info: { iconColor: notificationColors.info, Icon: InfoIcon, w: 22, h: 22 },
};

const UNREAD_BORDER = notificationColors.unreadRing;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How many cards peek out from under a collapsed stack, and by how much.
 *
 * They sit *below* the front card rather than above it, which is the other way up from a deck of
 * swipe cards: in a list read top to bottom, a pile that grew upward would climb into the card before
 * it, and the newest notification — the one the stack shows — belongs at the top of its own group.
 *
 * The inset narrows each one, so the stack reads as depth. It has to be applied as a real width
 * inset rather than a uniform scale: scaling shrinks about the centre and would pull each card's
 * bottom edge *up*, cancelling the offset that is doing the work.
 */
const STACK_PEEK_DEPTH = 2;
const STACK_PEEK_OFFSET = 7;
const STACK_PEEK_INSET = 10;

/** How long a group takes to open or close. */
const EXPAND_MS = 260;

/** The space between cards in a day, repeated inside a group so its rows sit on the same rhythm. */
const CARD_GAP = layoutTokens.gap;

/**
 * The card's corner, and the peeking cards' behind it.
 *
 * Rounder than `radiusCard`'s 12 and than `radiusPill`'s 24, because the type badge inside is a 52pt
 * circle and a tighter corner beside it reads as two different radii arguing. Named rather than
 * repeated, so the pile can't round differently from the card it hides under.
 */
const CARD_RADIUS = 26;

/** The disc holding a notification's type glyph. */
const TYPE_BADGE_SIZE = 52;

/** Extra reach around "Mark all as read", which is text on a heading row rather than a padded button. */
const MARK_ALL_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

/**
 * Notifications list — the Figma Notifications page (node 3546:10082). Groups notifications into day
 * sections (Today first, then dated sections newest→oldest, newest card at the top of each) and
 * renders each as a `NotificationCard` (type icon + time/title/description + arrow button). Unread
 * cards get a coral ring. Data comes from `useNotifications` (demo data for now; see that hook).
 */
export function NotificationListNode({ context }: NodeProps) {
  const { notifications, markRead, markAllRead } = useNotifications();
  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);
  const sections = useMemo(() => groupByDay(notifications), [notifications]);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const handlePress = (n: AppNotification) => {
    if (!n.read) markRead(n.id);
    if (n.action) void context.dispatch(n.action);
  };

  if (sections.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: tokens.card.stats.description }]}>
          You have no notifications.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {sections.map((section, sectionIndex) => (
        <View key={section.key} style={styles.section}>
          {/* The day, and — on the first one only — the control that acts on the whole list. It sits
              here rather than on a row of its own because it belongs to the list, not to a day, and
              this is the one line already spanning the full width with nothing on its right.

              Only while it has something to do: a control that is always there but usually does
              nothing teaches you to ignore it, and its absence is itself the answer to "is anything
              unread?". */}
          <View style={styles.dayRow}>
            <Text style={[styles.dayLabel, { color: tokens.text.primary }]}>{section.label}</Text>
            {sectionIndex === 0 && unreadCount > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Mark all ${unreadCount} notifications as read`}
                onPress={markAllRead}
                // Reach rather than padding, so the button is comfortably tappable without making
                // this row taller than every other day heading on the page.
                hitSlop={MARK_ALL_HIT_SLOP}
                style={({ pressed }) => [pressed && styles.cardPressed]}
              >
                <Text style={[styles.markAllLabel, { color: tokens.text.primary }]}>
                  Mark all as read
                </Text>
              </Pressable>
            ) : null}
          </View>
          {toStacks(section.items).map((group) =>
            group.items.length === 1 ? (
              <NotificationCard
                key={group.key}
                notification={group.items[0]}
                tokens={tokens}
                onPress={() => handlePress(group.items[0])}
              />
            ) : (
              <NotificationStack
                key={group.key}
                items={group.items}
                tokens={tokens}
                onPress={handlePress}
              />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

/**
 * The card's face, without the press behaviour around it.
 *
 * Split out because a collapsed stack shows exactly this — its newest notification — and only the
 * control on the right differs: a single card's arrow opens the notification, a group's slot carries
 * the count instead. Drawing the two separately is how they drift apart.
 */
function CardFace({
  notification,
  tokens,
  count,
}: {
  notification: AppNotification;
  tokens: ColorTokens;
  /** How many notifications this face stands for. Omitted, or 1, draws the plain open arrow. */
  count?: number;
}) {
  const t = TYPE_STYLES[notification.type];
  const Icon = t.Icon;
  const isStack = (count ?? 1) > 1;
  return (
    <>
      <View style={[styles.typeBadge, { backgroundColor: withAlpha(t.iconColor, BADGE_TINT) }]}>
        <Icon width={t.w} height={t.h} color={t.iconColor} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.time, { color: tokens.card.hint.text }]}>
          {timeLabel(notification.timestamp)}
        </Text>
        <View style={styles.textBlock}>
          <Text style={[styles.title, { color: tokens.text.primary }]} numberOfLines={2}>
            {notification.title}
          </Text>
          <Text
            style={[styles.description, { color: tokens.card.stats.description }]}
            numberOfLines={2}
          >
            {notification.description}
          </Text>
        </View>
      </View>

      {/* The same slot, saying a different thing. A lone card offers its arrow, into the
          notification; a group puts the count there instead, because the card is standing in for
          several and how many is the first thing worth knowing about it. Opening the group is the
          row beneath, where it can say so in words. */}
      {isStack ? (
        <View style={[styles.countBadge, { backgroundColor: tokens.background.secondary }]}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      ) : (
        <View style={[styles.arrowButton, { backgroundColor: tokens.card.stats.openBadge }]}>
          <ArrowRightIcon width={12} height={12} color={tokens.card.stats.openIcon} />
        </View>
      )}
    </>
  );
}

function NotificationCard({
  notification,
  tokens,
  onPress,
}: {
  notification: AppNotification;
  tokens: ColorTokens;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: tokens.card.background,
          // A constant 4px border keeps read↔unread the same size (transparent when read).
          borderColor: notification.read ? 'transparent' : UNREAD_BORDER,
        },
        pressed && styles.cardPressed,
      ]}
    >
      <CardFace notification={notification} tokens={tokens} />
    </Pressable>
  );
}

/**
 * A run of notifications that say the same thing, collapsed into one card.
 *
 * Closed, it shows the newest of them with the rest peeking out underneath and a count — a repeated
 * reminder then costs one row instead of five, which is the whole point on a day that fired several.
 * Open, it is simply the cards themselves, each behaving as it would have on its own, with a row at
 * the end to close it again.
 *
 * The group's own card is not one of them: it stands for the newest rather than being it, so opening
 * the stack is all its press does. Were it to open the notification as well, the newest would be the
 * one card in the list you could never reach a second time.
 */
function NotificationStack({
  items,
  tokens,
  onPress,
}: {
  items: AppNotification[];
  tokens: ColorTokens;
  onPress: (n: AppNotification) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const newest = items[0];
  const rest = items.slice(1);
  // Any unread among them marks the whole stack, or a card would go unnoticed under a read one.
  const anyUnread = items.some((n) => !n.read);

  /**
   * How far open the group is, 0 to 1 — the pile, the reveal and the chevron all read from it.
   *
   * One value rather than three, so they can't arrive at different times: the cards sliding out from
   * under a pile that has already gone is the specific thing that makes an accordion feel loose.
   */
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, {
      duration: EXPAND_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [expanded, progress]);

  /**
   * The natural height of the cards below the front one, measured once.
   *
   * A height has to be a number for it to animate, and the content's own is only known after it has
   * been laid out. It is measured on the inner view, which is never the clipped one — so it reports
   * its full height whatever the container around it has been animated down to.
   */
  const [revealHeight, setRevealHeight] = useState(0);

  const revealStyle = useAnimatedStyle(() => ({
    height: revealHeight * progress.value,
    // Trails the height slightly, so the cards are already in place by the time they are readable
    // rather than fading in over a gap that is still opening.
    opacity: interpolate(progress.value, [0, 0.4, 1], [0, 0, 1]),
  }));
  // The pile goes as the group opens: there is nothing left underneath to suggest.
  const peekStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const spacerStyle = useAnimatedStyle(() => ({
    height: STACK_PEEK_DEPTH * STACK_PEEK_OFFSET * (1 - progress.value),
  }));
  // Down when closed, up when open, turning through the quarter between.
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(progress.value, [0, 1], [90, -90])}deg` }],
  }));

  return (
    <View style={styles.stackGroup}>
      <View style={styles.stack}>
        {/* Behind the front card, and declared first so they paint under it. Each is anchored top
            and bottom rather than given a height, so none of this needs to know how tall a card
            came out — and as the spacer below closes, their slivers close with it. */}
        {Array.from({ length: STACK_PEEK_DEPTH }, (_, i) => {
          const depth = i + 1;
          return (
            <Animated.View
              key={depth}
              pointerEvents="none"
              style={[
                styles.peek,
                {
                  backgroundColor: tokens.card.background,
                  left: STACK_PEEK_INSET * depth,
                  right: STACK_PEEK_INSET * depth,
                  top: STACK_PEEK_OFFSET * depth,
                  bottom: STACK_PEEK_OFFSET * (STACK_PEEK_DEPTH - depth),
                },
                peekStyle,
              ]}
            />
          );
        })}

        {/* Closed, this card stands for the group and opening it is all its press does. Open, it is
            simply the newest notification again — arrow and all — or it would be the one card in the
            list you could never reach a second time. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            expanded ? newest.title : `${newest.title}, ${items.length} notifications`
          }
          accessibilityState={{ expanded }}
          onPress={() => (expanded ? onPress(newest) : setExpanded(true))}
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: tokens.card.background,
              borderColor: (expanded ? !newest.read : anyUnread) ? UNREAD_BORDER : 'transparent',
            },
            pressed && styles.cardPressed,
          ]}
        >
          <CardFace
            notification={newest}
            tokens={tokens}
            count={expanded ? undefined : items.length}
          />
        </Pressable>

        {/* Holds the room the peeking cards need, and gives it back as they go. In flow, so the
            group takes its real height and the next card in the day sits clear of the pile. */}
        <Animated.View style={spacerStyle} />
      </View>

      <Animated.View style={[styles.reveal, revealStyle]}>
        <View onLayout={(e) => setRevealHeight(e.nativeEvent.layout.height)} style={styles.revealInner}>
          {rest.map((n) => (
            <NotificationCard
              key={n.id}
              notification={n}
              tokens={tokens}
              onPress={() => onPress(n)}
            />
          ))}
        </View>
      </Animated.View>

      {/* Beneath the group either way, so the control keeps its place as the group opens and closes
          rather than moving to wherever the last card happens to end. */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((open) => !open)}
        style={({ pressed }) => [styles.toggleRow, pressed && styles.cardPressed]}
      >
        <Animated.View style={chevronStyle}>
          <ArrowRightIcon width={11} height={10} color={tokens.text.primary} />
        </Animated.View>
        <Text style={[styles.toggleLabel, { color: tokens.text.primary }]}>
          {expanded ? 'Show less' : 'Show more'}
        </Text>
      </Pressable>
    </View>
  );
}

interface NotificationGroup {
  key: string;
  items: AppNotification[];
}

/**
 * Collapse repeats within a day into groups, keyed by title.
 *
 * A group takes the place of its newest member, so the day still reads newest-first — the repeats
 * behind it are already in that order, since the section was sorted before it got here.
 *
 * Only within the day it is given: a reminder that fires daily is one card per day, which is the list
 * doing its job. It is several in *one* day that is the noise worth folding away.
 */
function toStacks(items: AppNotification[]): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  const indexByTitle = new Map<string, number>();
  for (const n of items) {
    const i = indexByTitle.get(n.title);
    if (i === undefined) {
      indexByTitle.set(n.title, groups.length);
      groups.push({ key: n.id, items: [n] });
    } else {
      groups[i].items.push(n);
    }
  }
  return groups;
}

interface DaySection {
  key: string;
  label: string;
  items: AppNotification[];
}

/** Group notifications into day sections, newest day first, newest card first within each. */
function groupByDay(notifications: AppNotification[]): DaySection[] {
  const sorted = [...notifications].sort((a, b) => b.timestamp - a.timestamp);
  const sections: DaySection[] = [];
  const indexByKey = new Map<string, number>();
  for (const n of sorted) {
    const key = dayKey(n.timestamp);
    let i = indexByKey.get(key);
    if (i === undefined) {
      i = sections.length;
      indexByKey.set(key, i);
      sections.push({ key, label: dayLabel(n.timestamp), items: [] });
    }
    sections[i].items.push(n);
  }
  return sections;
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(ts: number): string {
  if (dayKey(ts) === dayKey(Date.now())) return 'Today';
  if (dayKey(ts) === dayKey(Date.now() - DAY_MS)) return 'Yesterday';
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function timeLabel(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: layoutTokens.sectionGap,
  },
  section: {
    width: '100%',
    gap: CARD_GAP,
  },
  /** The day label, with the list-wide control opposite it on the first day only. */
  dayRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  markAllLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    letterSpacing: tracking.semiBold,
    includeFontPadding: false,
  },
  dayLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: layoutTokens.cardPadding,
    padding: layoutTokens.cardPadding,
    borderRadius: CARD_RADIUS,
    borderWidth: 4,
    ...cardShadow,
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
  },
  /**
   * A group, open or closed.
   *
   * No `gap`: the spacing has to come from inside the parts, because the reveal between them closes
   * to nothing. A gap is charged whatever a child's size, so a collapsed group would carry two of
   * them — one either side of a strip with no height — and sit the toggle twice as far from its card
   * as every other row on the page.
   */
  stackGroup: {
    width: '100%',
  },
  /** A collapsed group: the front card in flow, the peeking ones behind it, and room for them below. */
  stack: {
    width: '100%',
  },
  /**
   * The cards below the front one, clipped to an animated height.
   *
   * `overflow: hidden` is what makes the height mean anything — without it the content spills out of
   * the collapsed container and the group never looks shut.
   */
  reveal: {
    width: '100%',
    overflow: 'hidden',
  },
  /**
   * The measured content. Carries the gap above itself, so that spacing is part of the height that
   * animates rather than a constant that would hold the cards apart while the group is closed.
   */
  revealInner: {
    width: '100%',
    gap: CARD_GAP,
    paddingTop: CARD_GAP,
  },
  /**
   * One card peeking out from under the front one.
   *
   * Given `top` and `bottom` rather than a height, so it stretches to wherever the front card ends
   * without anything having to measure it. It carries the card's fill, corner and shadow but none of
   * its content — the pile says how many there are, and the count says it exactly.
   */
  peek: {
    position: 'absolute',
    borderRadius: CARD_RADIUS,
    ...cardShadow,
  },
  /** The count, in the slot a lone card gives its arrow — same 26pt disc, so the row never reflows. */
  countBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 14,
    lineHeight: 16,
    // On the navy disc, as the design draws it. Both modes put a dark navy here, so it reads in each.
    color: '#FFFFFF',
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  /** Opens and closes a group. Deliberately not a card — it is a control, not a notification. */
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: CARD_GAP,
    // Its own spacing above, since the group it follows carries no gap of its own — see `stackGroup`.
    marginTop: CARD_GAP,
    paddingVertical: 4,
  },
  toggleLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  /** A circle, so its radius is half its size — not `CARD_RADIUS`, which it happens to equal. */
  typeBadge: {
    width: TYPE_BADGE_SIZE,
    height: TYPE_BADGE_SIZE,
    borderRadius: TYPE_BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  time: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  textBlock: {
    gap: 0,
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  arrowButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
  },
});
