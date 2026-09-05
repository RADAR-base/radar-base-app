import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import SyncIcon from '../../../../theme/icons/sync.svg';
import BellIcon from '../../../../theme/icons/bell.svg';
import SettingsIcon from '../../../../theme/icons/settings.svg';
import { tracking, fontFamily, getColorTokens, headerLayout } from '../../../../theme/theme';
import { useUnreadNotificationCount } from '../../useNotifications';
import type { NodeProps } from '../../types';

// Shown before the first manual sync this session; pressing sync replaces it with the real time.
const DEFAULT_LAST_SYNCED = 'Last Synced: 12:00';

/** "Last Synced: HH:MM" for the given time, zero-padded to match the placeholder's format. */
function syncLabelFor(date: Date): string {
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  return `Last Synced: ${hh}:${mm}`;
}

/**
 * Top row of the dashboard header — matches the Figma `HeaderBar` component set
 * (node 2086:4254). `HeaderNode` decides whether the leading avatar is the RadarBase
 * wordmark or the profile picture and passes the resolved element in as
 * `node.leadingElement`; this component only lays it out next to the sync/notification/
 * settings action cluster (`showActions`, matching the Figma `bar` variant).
 */
export function HeaderBarNode({ node, context }: NodeProps) {
  const showActions = node.showActions !== false;
  // Per-element visibility within the actions cluster — each defaults to shown; `showActions` still
  // hides the whole cluster. `lastSyncedButton` toggles the whole last-sync affordance: the
  // "Last Synced" label *and* the sync (↻) button next to it, which read as a pair.
  const showLastSynced = node.lastSyncedButton !== false;
  const showNotifications = node.showNotifications !== false;
  const showSettings = node.showSettings !== false;
  const leadingElement = (node as { leadingElement?: React.ReactNode }).leadingElement ?? null;
  const notificationCount =
    typeof node.notificationCount === 'number' ? node.notificationCount : 0;
  // Live unread count from the shared notifications store — drives the bell's red dot. A manual
  // `notificationCount` prop still forces it on.
  const unreadCount = useUnreadNotificationCount();
  const hasUnread = unreadCount > 0 || notificationCount > 0;

  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);
  const textColor = typeof node.textColor === 'string' ? node.textColor : tokens.header.text;
  const buttonBg =
    typeof node.buttonBackgroundColor === 'string'
      ? node.buttonBackgroundColor
      : tokens.header.buttonBackground;
  const buttonIconColor =
    typeof node.buttonIconColor === 'string' ? node.buttonIconColor : tokens.header.buttonIcon;

  const dispatch = (eventName: string) =>
    context.dispatch({ type: 'TriggerEvent', eventName });
  // A button with a `*ViewPath` opens that secondary view (OpenCustomView); otherwise it emits an
  // app event (TriggerEvent) for the host to handle however it likes.
  const activate = (viewPath: unknown, eventName: string) =>
    typeof viewPath === 'string' && viewPath !== ''
      ? context.dispatch({ type: 'OpenCustomView', viewUrl: viewPath })
      : dispatch(eventName);

  // Sync affordance: the icon spins on press and the label stamps the press time. State is
  // per-header-instance for now — a shared sync service should own the real "last synced" time
  // once the wearable fetch below is wired.
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const lastSyncedText = lastSyncedAt ? syncLabelFor(lastSyncedAt) : DEFAULT_LAST_SYNCED;
  const syncSpin = useSharedValue(0);
  const syncSpinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${syncSpin.value}deg` }] }));

  const handleSync = () => {
    // One full turn per press. (When the real async fetch is wired, loop this until it resolves.)
    syncSpin.value = withTiming(syncSpin.value - 360, {
      duration: 600,
      easing: Easing.inOut(Easing.ease),
    });
    setLastSyncedAt(new Date());
    // TODO: trigger the wearable-data fetch from the server here, then set the label from the real
    // sync-completion time instead of the press time.
    dispatch(typeof node.syncEventName === 'string' ? node.syncEventName : 'HeaderSync');
  };

  return (
    <View style={[styles.row, !showActions && styles.rowCompact]}>
      {leadingElement}

      {showActions && (
        <View style={styles.actions}>
          {showLastSynced && (
            <Text style={[styles.lastSynced, { color: textColor }]}>{lastSyncedText}</Text>
          )}
          {showLastSynced && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Sync now"
              onPress={handleSync}
              style={[styles.iconButton, { backgroundColor: buttonBg }]}
            >
              <Animated.View style={syncSpinStyle}>
                <SyncIcon width={20} height={20} color={buttonIconColor} />
              </Animated.View>
            </TouchableOpacity>
          )}
          {showNotifications && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() =>
                activate(
                  node.notificationsViewPath,
                  typeof node.notificationsEventName === 'string'
                    ? node.notificationsEventName
                    : 'HeaderNotifications',
                )
              }
              style={[styles.iconButton, { backgroundColor: buttonBg }]}
            >
              <BellIcon width={18} height={21} color={buttonIconColor} />
              {hasUnread && (
                <View style={[styles.badge, { backgroundColor: tokens.header.redBubble }]} />
              )}
            </TouchableOpacity>
          )}
          {showSettings && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() =>
                activate(
                  node.settingsViewPath,
                  typeof node.settingsEventName === 'string'
                    ? node.settingsEventName
                    : 'HeaderSettings',
                )
              }
              style={[styles.iconButton, { backgroundColor: buttonBg }]}
            >
              <SettingsIcon width={22} height={23} color={buttonIconColor} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    height: 50,
  },
  rowCompact: {
    justifyContent: 'flex-start',
    gap: headerLayout.gap,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: headerLayout.gap,
  },
  lastSynced: {
    fontSize: headerLayout.captionFontSize,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    letterSpacing: tracking.regular,
    marginRight: 2,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Red notification dot with a white ring (Figma node 3546:10311) — the ring separates it from the
  // bell glyph on any header background.
  badge: {
    position: 'absolute',
    top: 5,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});
