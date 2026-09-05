import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RadarBaseLogo from '../../../../theme/icons/radarbaselogo.svg';
import ProfileIcon from '../../../../theme/icons/profile.svg';
import { getColorTokens, layout as layoutTokens, resolveBackground, readableTextColor } from '../../../../theme/theme';
import { HeaderBarNode } from './HeaderBarNode';
import { HeaderTextNode } from './HeaderTextNode';
import type { Node } from '../../../contracts/NodeSchema';
import type { NodeProps, SDUIContext } from '../../types';

// The profile avatar is a fixed design element (its glyph is a non-theming white silhouette + navy
// face `#1D3557`), so its backdrop is a fixed navy that matches the glyph — it intentionally does
// NOT follow `brandColors` (which would tint it, e.g. to the secondary/amber).

export interface HeaderParts {
  /** Config for the bar row (avatar + sync/notifications/settings) — the part that stays pinned. */
  barNode: Node;
  /** Config for the title/greeting row — the part that collapses (scrolls away). */
  textNode: Node;
  /** The flat/transparent variant (no navy panel). */
  transparent: boolean;
  /** The navy panel color — the opaque background used by the non-transparent variant. */
  panelColor: string;
}

/**
 * Derives the bar + title sub-node configs (and colors) from a `HeaderNode` config. Shared by
 * `HeaderNode` (which stacks them into one panel) and `ViewNode` (which renders the bar as a *sticky*
 * scroll header and lets the title scroll away beneath it — a fluid, native collapse).
 */
export function buildHeaderParts(node: Node, context: SDUIContext): HeaderParts {
  const mode = context.colorScheme ?? 'light';
  const tokens = getColorTokens(mode, context.theme.brandColors);
  const transparent = node.transparent === true;
  const panelColor = tokens.header.headerBackground;
  const pageBg = resolveBackground(context.theme, mode);
  // Colored header: the greeting/title text takes the page background color so its tone matches the
  // page — but only while that stays readable on the panel (WCAG AA); otherwise it falls back to a
  // readable light/dark. Transparent (flat) header: the text sits on the page, so it's kept readable
  // against the page background instead.
  const textColor =
    typeof node.textColor === 'string'
      ? node.textColor
      : transparent
        ? readableTextColor(pageBg, { preferred: panelColor })
        : readableTextColor(panelColor, { preferred: pageBg });
  // Swap the button's fill/icon when transparent: navy chip + white icon → white chip + navy icon.
  const buttonBackgroundColor =
    typeof node.buttonBackgroundColor === 'string'
      ? node.buttonBackgroundColor
      : transparent
        ? tokens.header.buttonIcon
        : tokens.header.buttonBackground;
  const buttonIconColor =
    typeof node.buttonIconColor === 'string'
      ? node.buttonIconColor
      : transparent
        ? tokens.header.buttonBackground
        : tokens.header.buttonIcon;
  const showProfileIcon = node.profileIcon !== false;

  // Fixed navy backdrop for the (non-theming white) profile glyph. Filled disc when transparent so
  // the white silhouette reads on the light page; a white ring on the navy panel otherwise.
  const leadingElement = showProfileIcon ? (
    <View
      style={[
        styles.avatar,
        transparent ? { backgroundColor: panelColor } : { borderWidth: 2, borderColor: 'white' },
      ]}
    >
      <ProfileIcon width={30} height={29} />
    </View>
  ) : (
    <RadarBaseLogo width={50} height={50} />
  );

  const barNode: Node = {
    id: `${node.id}-bar`,
    type: 'HeaderBarNode',
    leadingElement,
    showActions: node.showActions !== false,
    showNotifications: node.showNotifications,
    showSettings: node.showSettings,
    lastSyncedButton: node.lastSyncedButton,
    notificationCount: node.notificationCount,
    textColor,
    buttonBackgroundColor,
    buttonIconColor,
    syncEventName: node.syncEventName,
    notificationsEventName: node.notificationsEventName,
    settingsEventName: node.settingsEventName,
    notificationsViewPath: node.notificationsViewPath,
    settingsViewPath: node.settingsViewPath,
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
    textColor,
    descriptionColor: node.descriptionColor,
    buttonBackgroundColor,
    buttonTextColor: buttonIconColor,
    editEventName: node.editEventName,
  };

  return { barNode, textNode, transparent, panelColor };
}

/**
 * Composed dashboard header (bar + title in one navy panel). Kept for direct blueprint use; tab
 * screens instead render the bar as a sticky scroll header via `ViewNode` (so the title collapses by
 * scrolling naturally), both driven by `buildHeaderParts`.
 */
export function HeaderNode({ node, context, render }: NodeProps) {
  const insets = useSafeAreaInsets();
  const { barNode, textNode, transparent, panelColor } = buildHeaderParts(node, context);
  const backgroundColor = transparent
    ? 'transparent'
    : typeof node.backgroundColor === 'string'
      ? node.backgroundColor
      : panelColor;

  return (
    <View
      style={[styles.frame, !transparent && styles.panel, { backgroundColor, paddingTop: 16 + insets.top }]}
    >
      <HeaderBarNode node={barNode} context={context} render={render} />
      <View style={styles.title}>
        <HeaderTextNode node={textNode} context={context} render={render} />
      </View>
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
  frame: {
    width: '100%',
    paddingHorizontal: 16,
    paddingBottom: layoutTokens.cardPadding,
  },
  // The navy panel chrome — omitted when `transparent`, leaving the header flat on the page.
  panel: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  title: {
    paddingTop: 16,
  },
});
