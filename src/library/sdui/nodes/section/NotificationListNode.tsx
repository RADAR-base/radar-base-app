import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';
import BellIcon from '../../../../theme/icons/bell.svg';
import WarningIcon from '../../../../theme/icons/warning.svg';
import AlarmIcon from '../../../../theme/icons/alarm.svg';
import InfoIcon from '../../../../theme/icons/infocircle.svg';
import ArrowRightIcon from '../../../../theme/icons/arrowright.svg';
import { tracking, fontFamily, getColorTokens, cardShadow, withAlpha } from '../../../../theme/theme';
import { useNotifications, type AppNotification, type NotificationType } from '../../useNotifications';
import type { NodeProps } from '../../types';

type ColorTokens = ReturnType<typeof getColorTokens>;

/** Opacity for a type's badge fill — derived from its `iconColor`, so one color drives both (like
 *  `TaskCardNode`'s `TASK_TINT`), and the tint adapts to a light/dark card background for free. */
const BADGE_TINT = 0.15;

/** Per-type icon + color (Figma `NotificationType`, node 3548:10398). The badge fill is derived from
 *  `iconColor` at `BADGE_TINT` opacity — one color per type. Local, like `TaskCardNode`. */
const TYPE_STYLES: Record<
  NotificationType,
  { iconColor: string; Icon: ComponentType<SvgProps>; w: number; h: number }
> = {
  default: { iconColor: '#1D3557', Icon: BellIcon, w: 18, h: 21 },
  warning: { iconColor: '#C0312D', Icon: WarningIcon, w: 24, h: 24 },
  expired: { iconColor: '#854F0B', Icon: AlarmIcon, w: 22, h: 22 },
  info: { iconColor: '#0F6E56', Icon: InfoIcon, w: 22, h: 22 },
};

const UNREAD_BORDER = 'rgba(232, 72, 85, 0.6)';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Notifications list — the Figma Notifications page (node 3546:10082). Groups notifications into day
 * sections (Today first, then dated sections newest→oldest, newest card at the top of each) and
 * renders each as a `NotificationCard` (type icon + time/title/description + arrow button). Unread
 * cards get a coral ring. Data comes from `useNotifications` (demo data for now; see that hook).
 */
export function NotificationListNode({ context }: NodeProps) {
  const { notifications, markRead } = useNotifications();
  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);
  const sections = useMemo(() => groupByDay(notifications), [notifications]);

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
      {sections.map((section) => (
        <View key={section.key} style={styles.section}>
          <Text style={[styles.dayLabel, { color: tokens.text.primary }]}>{section.label}</Text>
          {section.items.map((n) => (
            <NotificationCard key={n.id} notification={n} tokens={tokens} onPress={() => handlePress(n)} />
          ))}
        </View>
      ))}
    </View>
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
  const t = TYPE_STYLES[notification.type];
  const Icon = t.Icon;
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

      <View style={[styles.arrowButton, { backgroundColor: tokens.card.stats.openBadge }]}>
        <ArrowRightIcon width={12} height={12} color={tokens.card.stats.openIcon} />
      </View>
    </Pressable>
  );
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
    gap: 16,
  },
  section: {
    width: '100%',
    gap: 9,
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
    gap: 16,
    padding: 16,
    borderRadius: 26,
    borderWidth: 4,
    ...cardShadow,
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
  },
  typeBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
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
    color: '#0E5474',
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
    color: '#1D3557',
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
    color: '#5A5A5A',
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
