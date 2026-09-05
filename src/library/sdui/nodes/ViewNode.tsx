import React, { useContext, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navbarLayout, layout as layoutTokens, resolveBackground } from '../../../theme/theme';
import { ScrollLockContext } from '../ScrollLockContext';
import { TabHeaderContext } from '../TabHeaderContext';
import { HeaderBarNode } from './header/HeaderBarNode';
import { HeaderTextNode } from './header/HeaderTextNode';
import { buildHeaderParts } from './header/HeaderNode';
import type { NodeProps } from '../types';

/** The floating navbar's total footprint, excluding the device's bottom safe-area inset. */
const NAVBAR_FOOTPRINT =
  navbarLayout.itemHeight +
  navbarLayout.containerPadding * 2 +
  navbarLayout.outerPaddingTop +
  navbarLayout.outerPaddingBottom;

/**
 * Root container for a screen. Renders its children inside a scrollable view.
 *
 * When a tab supplies a header (via `TabHeaderContext`), the header **bar** (avatar + actions) is the
 * scroll view's first child and is made *sticky* so it pins to the top, while the **title/greeting**
 * is the second child and simply scrolls away beneath it. That gives a fully fluid, native collapse —
 * the title tracks the finger 1:1 in both directions — instead of animating a pinned header's height
 * against the scroll (which fought the scroll and never re-expanded).
 *
 * `SDUIShell`'s bottom navbar floats via `position: 'absolute'` over this content, so the scroll
 * view's own bottom padding keeps content from ending up underneath it once scrolled to the end.
 */
export function ViewNode({ node, context, render }: NodeProps) {
  const insets = useSafeAreaInsets();
  // A descendant (e.g. a graph being dragged) can lock scrolling via ScrollLockContext so
  // the page doesn't scroll along with the gesture.
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const scrollLock = useMemo(() => ({ setLocked: (locked: boolean) => setScrollEnabled(!locked) }), []);

  const headerConfig = useContext(TabHeaderContext);
  const header = headerConfig ? buildHeaderParts(headerConfig, context) : null;
  // Bar + title share one opaque background so scrolling content is occluded as it passes under the
  // sticky bar: the navy panel when colored, or the page background when transparent (a flat header).
  const headerBg = header
    ? header.transparent
      ? resolveBackground(context.theme, context.colorScheme ?? 'light')
      : header.panelColor
    : undefined;

  const children = asNodeArray(node.children);

  return (
    <ScrollLockContext.Provider value={scrollLock}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: NAVBAR_FOOTPRINT + insets.bottom }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
        stickyHeaderIndices={header ? [0] : undefined}
      >
        {header && (
          <View
            style={[
              styles.headerBar,
              { backgroundColor: headerBg, paddingTop: 16 + insets.top },
              !header.transparent && styles.roundedBottom,
            ]}
          >
            <HeaderBarNode node={header.barNode} context={context} render={render} />
          </View>
        )}
        {header && (
          <View
            style={[
              styles.headerTitle,
              { backgroundColor: headerBg },
              !header.transparent && styles.headerTitleOverlap,
              !header.transparent && styles.roundedBottom,
            ]}
          >
            <HeaderTextNode node={header.textNode} context={context} render={render} />
          </View>
        )}
        <View style={styles.body}>{render(children)}</View>
      </ScrollView>
    </ScrollLockContext.Provider>
  );
}

function asNodeArray(value: unknown): import('../../contracts/NodeSchema').Node[] | undefined {
  return Array.isArray(value) ? (value as import('../../contracts/NodeSchema').Node[]) : undefined;
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  // Sticky header bar — pins to the top; `paddingBottom` becomes the gap under the bar once the
  // title has scrolled away, and the gap to the title while it's visible.
  headerBar: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerTitleOverlap: {
    marginTop: -24,
    paddingTop: 24,
  },
  // Navy-panel rounding: shows the content behind it once the title scrolls out, and is back-filled
  // by the (same-navy) title while it's still in place.
  roundedBottom: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  // Standard screen gutter for the page content, below the header.
  body: {
    paddingHorizontal: 15,
    paddingTop: 15,
    gap: layoutTokens.sectionGap,
  },
});
