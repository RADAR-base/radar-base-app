import React, { useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navbarLayout, layout as layoutTokens } from '../../../theme/theme';
import { PageScrollContext } from '../PageScrollContext';
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

/** Slack below the navbar, so the last card rests clear of it and there is room to scroll. */
const NAVBAR_CLEARANCE = 24;

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
 * view's own bottom padding keeps content from ending up underneath it once scrolled to the end —
 * the pill's footprint plus `NAVBAR_CLEARANCE`.
 */
export function ViewNode({ node, context, render }: NodeProps) {
  const insets = useSafeAreaInsets();
  // A descendant (e.g. a graph being dragged) can lock scrolling via ScrollLockContext so
  // the page doesn't scroll along with the gesture.
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const scrollLock = useMemo(
    () => ({ setLocked: (locked: boolean) => setScrollEnabled(!locked) }),
    [],
  );

  const headerConfig = useContext(TabHeaderContext);
  const header = headerConfig ? buildHeaderParts(headerConfig, context) : null;
  // The navy panel is one opaque surface behind bar and title. A flat header has none, so the page's
  // content stays visible as it scrolls up under the pinned bar.
  const headerBg = header && !header.transparent ? header.panelColor : 'transparent';

  const children = asNodeArray(node.children);

  // Shared with content that pins itself under the bar as the page scrolls (the data filter).
  const scrollY = useSharedValue(0);
  const pinTop = useSharedValue(insets.top);
  useEffect(() => {
    // Without a bar, pinned content rests under the status bar instead.
    if (!header) pinTop.value = insets.top;
  }, [header, insets.top, pinTop]);
  const onScroll = useAnimatedScrollHandler(event => {
    scrollY.value = event.contentOffset.y;
  });
  const bodyTop = useSharedValue(0);
  const pageScroll = useMemo(() => ({ scrollY, pinTop, bodyTop }), [scrollY, pinTop, bodyTop]);
  const customGap = typeof node.gap === 'number' ? node.gap : undefined;

  return (
    <ScrollLockContext.Provider value={scrollLock}>
      <PageScrollContext.Provider value={pageScroll}>
        <Animated.ScrollView
          style={styles.scroll}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingBottom: NAVBAR_FOOTPRINT + NAVBAR_CLEARANCE + insets.bottom,
          }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={scrollEnabled}
          stickyHeaderIndices={header ? [0] : undefined}
        >
          {header && (
            <View
              // The bar is pinned at the top, so its height is where pinned content can rest.
              onLayout={e => {
                pinTop.value = e.nativeEvent.layout.height;
              }}
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
          <View
            onLayout={e => {
              bodyTop.value = e.nativeEvent.layout.y;
            }}
            style={[
              styles.body,
              // A flat header's own 16pt bottom padding already spaces the content; the body's would
              // double it. Under the navy panel the body's padding is what clears the panel.
              header?.transparent && styles.bodyUnderFlatHeader,
              customGap != null && { gap: customGap },
            ]}
          >
            {render(children)}
          </View>
        </Animated.ScrollView>
      </PageScrollContext.Provider>
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
    paddingHorizontal: layoutTokens.pageGutter,
    paddingTop: layoutTokens.pageGutter,
    gap: layoutTokens.sectionGap,
  },
  /** 12pt under the title's padding, less the 40pt title's line leading: the spacing the calendar had. */
  bodyUnderFlatHeader: {
    paddingTop: 0,
    marginTop: -4,
  },
});
