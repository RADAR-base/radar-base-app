import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';
import HomeIcon from '../../../../theme/icons/homenavbar.svg';
import CalendarIcon from '../../../../theme/icons/calendarnavbar.svg';
import ProfileIcon from '../../../../theme/icons/profilenavbar.svg';
import DataIcon from '../../../../theme/icons/datanavbar.svg';
import { getColorTokens, navbarLayout, withAlpha } from '../../../../theme/theme';
import { NavbarItemNode } from './NavbarItemNode';
import type { NodeProps } from '../../types';

interface NavbarTab {
  id: string;
  label: string;
  icon?: string;
  /** Per-tab override for the navbar-wide `showLabels` default. */
  showLabel?: boolean;
}

/**
 * Maps a manifest tab's `icon` string onto one of the four navbar icon assets.
 * `person`/`grid` are the icon keys the hand-drawn `BottomTabBar` this replaces used to
 * accept — kept as aliases so existing `app-manifest.json` tab configs don't need to
 * change. Unrecognized/missing icons fall back to the home glyph.
 */
const ICONS: Record<string, ComponentType<SvgProps>> = {
  home: HomeIcon,
  calendar: CalendarIcon,
  person: ProfileIcon,
  profile: ProfileIcon,
  grid: DataIcon,
  data: DataIcon,
};

/** Opacity of the selected tab's highlight — a translucent tint of the icon color over the dark bar. */
const NAV_SELECTED_TINT = 0.2;

function isNavbarTabArray(value: unknown): value is NavbarTab[] {
  return (
    Array.isArray(value) &&
    value.every((t) => typeof t === 'object' && t !== null && typeof (t as NavbarTab).id === 'string')
  );
}

/**
 * Bottom navigation bar — matches the Figma `navbar` component set (node 1795:434).
 * Unlike the Figma component (which hardcodes up to 4 fixed tabs), `tabs` is a generic
 * list so the app manifest controls which pages appear here, same as the `BottomTabBar`
 * this replaces. `selectedTabId` drives which tab shows the pill highlight, `showLabels`
 * toggles the labels under each icon (Figma's `textLabel` variant) — each tab's own
 * `showLabel` overrides that default when set.
 *
 * Tapping a tab dispatches a `Navigate` action with that tab's id — `SDUIShell` already
 * handles this (switches the active tab and clears the secondary-view stack).
 */
export function NavbarNode({ node, context }: NodeProps) {
  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);

  const backgroundColor =
    typeof node.backgroundColor === 'string' ? node.backgroundColor : tokens.navbar.surface.background;
  const unselectedColor =
    typeof node.textColor === 'string' ? node.textColor : tokens.navbar.text.primary;
  // Selected tab: the icon keeps its (unselected) color and sits on a translucent tint of that same
  // color — a soft highlight that reads on the dark bar in both light & dark, deriving one fill from
  // the icon color instead of a solid pill token that had to swap per theme.
  const selectedColor =
    typeof node.selectedTextColor === 'string' ? node.selectedTextColor : unselectedColor;
  const selectedBg =
    typeof node.selectedBackgroundColor === 'string'
      ? node.selectedBackgroundColor
      : withAlpha(unselectedColor, NAV_SELECTED_TINT);
  const borderColor = typeof node.borderColor === 'string' ? node.borderColor : tokens.navbar.border;

  const defaultShowLabel = node.showLabels !== false;
  const tabs = isNavbarTabArray(node.tabs) ? node.tabs : [];
  const selectedTabId = typeof node.selectedTabId === 'string' ? node.selectedTabId : undefined;

  const navigate = (tabId: string) => context.dispatch({ type: 'Navigate', tabId });

  return (
    <View
      style={[
        styles.container,
        { backgroundColor, borderColor, shadowColor: tokens.navbar.dropshadow },
      ]}
    >
      <View style={styles.row}>
        {tabs.map((tab) => (
          <NavbarItemNode
            key={tab.id}
            Icon={ICONS[tab.icon ?? 'home'] ?? HomeIcon}
            label={tab.label}
            selected={tab.id === selectedTabId}
            showLabel={tab.showLabel ?? defaultShowLabel}
            selectedBg={selectedBg}
            selectedColor={selectedColor}
            unselectedColor={unselectedColor}
            onPress={() => navigate(tab.id)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 38,
    padding: navbarLayout.containerPadding,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
