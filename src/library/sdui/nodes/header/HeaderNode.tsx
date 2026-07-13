import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RadarBaseLogo from '../../../../theme/icons/radarbaselogo.svg';
import ProfileIcon from '../../../../theme/icons/profile.svg';
import { getColorTokens, layout as layoutTokens } from '../../../../theme/theme';
import { HeaderBarNode } from './HeaderBarNode';
import { HeaderTextNode } from './HeaderTextNode';
import type { Node } from '../../../contracts/NodeSchema';
import type { NodeProps } from '../../types';

/**
 * Dashboard header — matches the Figma `Header` component (node 2825:3010), which
 * composes `HeaderBar` (bar=true variant) and `HeaderTitle` (name=true variant) inside a
 * rounded, drop-shadowed navy panel.
 *
 * This is the only header node addressable from a blueprint; it owns the
 * RadarBase-logo-vs-profile-picture decision (`profileIcon` in the app config,
 * defaulting to true to match the Figma composite) and hands the resolved element to
 * `HeaderBarNode` as `leadingElement`, so that sub-component doesn't need to know about
 * either icon.
 */
export function HeaderNode({ node, context, render }: NodeProps) {
  const insets = useSafeAreaInsets();
  const tokens = getColorTokens(context.colorScheme ?? 'light');
  const backgroundColor =
    typeof node.backgroundColor === 'string' ? node.backgroundColor : tokens.header.headerBackground;
  const showProfileIcon = node.profileIcon !== false;

  // Fixed to the Figma design (white circle + navy face) regardless of light/dark mode —
  // unlike the rest of the header chrome, this icon intentionally doesn't retheme.
  const leadingElement = showProfileIcon ? (
    <View style={styles.avatar}>
      <ProfileIcon width={48} height={46} />
    </View>
  ) : (
    <RadarBaseLogo width={50} height={50} />
  );

  const barNode: Node = {
    id: `${node.id}-bar`,
    type: 'HeaderBarNode',
    leadingElement,
    showActions: node.showActions !== false,
    lastSyncedLabel: node.lastSyncedLabel,
    notificationCount: node.notificationCount,
    textColor: node.textColor,
    buttonBackgroundColor: node.buttonBackgroundColor,
    buttonIconColor: node.buttonIconColor,
    syncEventName: node.syncEventName,
    notificationsEventName: node.notificationsEventName,
    settingsEventName: node.settingsEventName,
  };

  const textNode: Node = {
    id: `${node.id}-text`,
    type: 'HeaderTextNode',
    title: node.title,
    name: node.name,
    showName: node.showName,
    description: node.description,
    showEditButton: node.showEditButton,
    editLabel: node.editLabel,
    textColor: node.textColor,
    descriptionColor: node.descriptionColor,
    buttonBackgroundColor: node.buttonBackgroundColor,
    buttonTextColor: node.buttonIconColor,
    editEventName: node.editEventName,
  };

  return (
    <View style={[styles.container, { backgroundColor, paddingTop: 16 + insets.top }]}>
      <HeaderBarNode node={barNode} context={context} render={render} />
      <HeaderTextNode node={textNode} context={context} render={render} />
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    width: '100%',
    gap: 16,
    paddingBottom: layoutTokens.cardPadding,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
});
