import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SyncIcon from '../../../../theme/icons/sync.svg';
import BellIcon from '../../../../theme/icons/bell.svg';
import SettingsIcon from '../../../../theme/icons/settings.svg';
import { getColorTokens, headerLayout } from '../../../../theme/theme';
import type { NodeProps } from '../../types';

/**
 * Top row of the dashboard header — matches the Figma `HeaderBar` component set
 * (node 2086:4254). `HeaderNode` decides whether the leading avatar is the RadarBase
 * wordmark or the profile picture and passes the resolved element in as
 * `node.leadingElement`; this component only lays it out next to the sync/notification/
 * settings action cluster (`showActions`, matching the Figma `bar` variant).
 */
export function HeaderBarNode({ node, context }: NodeProps) {
  const showActions = node.showActions !== false;
  const leadingElement = (node as { leadingElement?: React.ReactNode }).leadingElement ?? null;
  const lastSyncedLabel =
    typeof node.lastSyncedLabel === 'string' ? node.lastSyncedLabel : undefined;
  const notificationCount =
    typeof node.notificationCount === 'number' ? node.notificationCount : 0;

  const tokens = getColorTokens(context.colorScheme ?? 'light');
  const textColor = typeof node.textColor === 'string' ? node.textColor : tokens.header.text;
  const buttonBg =
    typeof node.buttonBackgroundColor === 'string'
      ? node.buttonBackgroundColor
      : tokens.header.buttonBackground;
  const buttonIconColor =
    typeof node.buttonIconColor === 'string' ? node.buttonIconColor : tokens.header.buttonIcon;

  const dispatch = (eventName: string) =>
    context.dispatch({ type: 'TriggerEvent', eventName });

  return (
    <View style={[styles.row, !showActions && styles.rowCompact]}>
      {leadingElement}

      {showActions && (
        <View style={styles.actions}>
          {lastSyncedLabel && (
            <Text style={[styles.lastSynced, { color: textColor }]}>{lastSyncedLabel}</Text>
          )}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Sync now"
            onPress={() =>
              dispatch(typeof node.syncEventName === 'string' ? node.syncEventName : 'HeaderSync')
            }
            style={[styles.iconButton, { backgroundColor: buttonBg }]}
          >
            <SyncIcon width={20} height={20} color={buttonIconColor} />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            onPress={() =>
              dispatch(
                typeof node.notificationsEventName === 'string'
                  ? node.notificationsEventName
                  : 'HeaderNotifications',
              )
            }
            style={[styles.iconButton, { backgroundColor: buttonBg }]}
          >
            <BellIcon width={18} height={21} color={buttonIconColor} />
            {notificationCount > 0 && (
              <View style={[styles.badge, { backgroundColor: tokens.header.redBubble }]} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() =>
              dispatch(
                typeof node.settingsEventName === 'string' ? node.settingsEventName : 'HeaderSettings',
              )
            }
            style={[styles.iconButton, { backgroundColor: buttonBg }]}
          >
            <SettingsIcon width={36} height={36} color={buttonIconColor} />
          </TouchableOpacity>
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
    letterSpacing: headerLayout.letterSpacing,
    marginRight: 2,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
