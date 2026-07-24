import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navbarLayout, layout as layoutTokens } from '../../../theme/theme';
import { ScrollLockContext } from '../ScrollLockContext';
import type { NodeProps } from '../types';

/** The floating navbar's total footprint (pill + its wrapper's padding), excluding the safe-area inset. */
const NAVBAR_FOOTPRINT =
  navbarLayout.itemHeight +
  navbarLayout.containerPadding * 2 +
  navbarLayout.outerPaddingTop +
  navbarLayout.outerPaddingBottom;

/**
 * Root container for a screen. Renders its children inside a scrollable view. The
 * `title` prop is consumed by the `SDUIShell` for the screen header, not by this node.
 *
 * `SDUIShell`'s bottom navbar floats via `position: 'absolute'` over this content rather
 * than pushing it up in the layout (it matches the Figma pill's drop-shadow — a floating
 * overlay, not a bar that reserves its own row). So this scroll view's own bottom padding
 * is what keeps content from ending up rendered underneath it once scrolled to the end.
 */
export function ViewNode({ node, render }: NodeProps) {
  const insets = useSafeAreaInsets();
  // A descendant (e.g. a graph being dragged) can lock scrolling via ScrollLockContext so
  // the page doesn't scroll along with the gesture.
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const scrollLock = useMemo(() => ({ setLocked: (locked: boolean) => setScrollEnabled(!locked) }), []);
  return (
    <ScrollLockContext.Provider value={scrollLock}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: NAVBAR_FOOTPRINT + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
      >
        <View style={styles.childrenList}>{render(asNodeArray(node.children))}</View>
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
  content: {
    padding: 15,
  },
  childrenList: {
    gap: layoutTokens.sectionGap,
  },
});
