import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import SyncIcon from '../../../../theme/icons/sync.svg';
import BellIcon from '../../../../theme/icons/bell.svg';
import SettingsIcon from '../../../../theme/icons/settings.svg';
import { tracking, fontFamily, getColorTokens, headerLayout } from '../../../../theme/theme';
import { useUnreadNotificationCount } from '../../useNotifications';
import { useSyncService } from '../../../../core/CoreServicesContext';
import type { NodeProps } from '../../types';

/** "Last Synced: HH:MM" for the given time, zero-padded. */
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

  const syncService = useSyncService();
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(
    () => syncService.getLastSyncedAt(),
  );
  const [syncing, setSyncing] = useState(false);
  const lastSyncedText = lastSyncedAt ? syncLabelFor(lastSyncedAt) : 'Last Sync';
  const syncSpin = useSharedValue(0);
  const syncSpinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${syncSpin.value}deg` }] }));

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    // Turns for as long as the refresh takes, rather than once for a fixed 600ms: a sync that ran
    // longer than the animation left a still icon above a label saying it was refreshing. `-1`
    // repeats until cancelled, and linear easing keeps every turn the same speed so the loop has no
    // visible seam where it restarts.
    syncSpin.value = withRepeat(
      withTiming(syncSpin.value - 360, { duration: 900, easing: Easing.linear }),
      -1,
    );
    try {
      const result = await syncService.sync();
      setLastSyncedAt(result.lastSyncedAt);
    } finally {
      setSyncing(false);
      // Stopped, then eased to a whole turn so the icon comes to rest upright rather than at
      // whatever angle the loop happened to be passing through.
      cancelAnimation(syncSpin);
      syncSpin.value = withTiming(Math.round(syncSpin.value / 360) * 360, { duration: 200 });
    }
    dispatch(typeof node.syncEventName === 'string' ? node.syncEventName : 'HeaderSync');
  };

  return (
    <View style={[styles.row, !showActions && styles.rowCompact]}>
      {leadingElement}

      {showActions && (
        <View style={styles.actions}>
          {showLastSynced && (
            /* The label and the ↻ are one control, not two things that happen to sit together: the
               label is what tells you the data might be stale, so it should be the thing you can
               press about it. One target also means one accessibility announcement, rather than a
               button a screen reader reaches only after reading the time out separately. */
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={syncing ? 'Refreshing' : `${lastSyncedText}. Refresh now`}
              accessibilityState={{ busy: syncing }}
              onPress={handleSync}
              disabled={syncing}
              style={styles.syncPair}
            >
              <Text style={[styles.lastSynced, { color: textColor }]}>
                {syncing ? 'Refreshing…' : lastSyncedText}
              </Text>
              <View style={[styles.iconButton, { backgroundColor: buttonBg }]}>
                <Animated.View style={syncSpinStyle}>
                  <SyncIcon width={20} height={20} color={buttonIconColor} />
                </Animated.View>
              </View>
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
  /** The label and its button, as one target — see the call site. */
  syncPair: {
    flexDirection: 'row',
    alignItems: 'center',
    // The header's own spacing. These two used to be siblings in `actions`, which supplies this gap
    // between every child; folding them into one control put them inside it, so the gap has to be
    // stated here or they end up hard against each other.
    gap: headerLayout.gap,
  },
  lastSynced: {
    fontSize: headerLayout.captionFontSize,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    letterSpacing: tracking.regular,
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
