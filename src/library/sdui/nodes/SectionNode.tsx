import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { fontFamily, layout as layoutTokens, getColorTokens, withAlpha } from '../../../theme/theme';
import type { Node } from '../../contracts/NodeSchema';
import type { NodeProps } from '../types';
import { SeeAllChip } from './section/SeeAllChip';

/** Section titles recede so the cards under them lead. */
export const SECTION_TITLE_ALPHA = 0.6;

/**
 * Logical grouping with an optional header and optional "See All" link.
 * Supports `layout: "horizontal"` for a horizontally scrolling row of children.
 */
export function SectionNode({ node, context, render }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : undefined;
  const showSeeAll = node.showSeeAll === true;
  const layout = node.layout === 'horizontal' ? 'horizontal' : 'vertical';
  const theme = context.theme;
  const tokens = getColorTokens(context.colorScheme ?? 'light', theme.brandColors);
  const customGap = typeof node.gap === 'number' ? node.gap : undefined;

  const children = asNodeArray(node.children);

  return (
    <View style={styles.container}>
      {title && (
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: withAlpha(tokens.text.primary, SECTION_TITLE_ALPHA) }]}>
            {title}
          </Text>
          {showSeeAll && (
            <SeeAllChip
              mode={context.colorScheme ?? 'light'}
              brandColors={context.theme.brandColors}
              onPress={() => {
                // `seeAllTab` switches to a primary tab (same result as tapping that tab in
                // the navbar — full header, tab highlighted). `seeAllAction` instead opens a
                // blueprint as a pushed secondary/detail view (Back button, current tab kept).
                if (typeof node.seeAllTab === 'string') {
                  context.dispatch({ type: 'Navigate', tabId: node.seeAllTab as string });
                } else if (typeof node.seeAllAction === 'string') {
                  context.dispatch({
                    type: 'OpenCustomView',
                    viewUrl: node.seeAllAction as string,
                  });
                }
              }}
            />
          )}
        </View>
      )}
      {layout === 'horizontal' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalContent}
        >
          {render(children)}
        </ScrollView>
      ) : (
        <View style={[styles.verticalContent, customGap != null && { gap: customGap }]}>
          {render(children)}
        </View>
      )}
    </View>
  );
}

function asNodeArray(value: unknown): Node[] | undefined {
  return Array.isArray(value) ? (value as Node[]) : undefined;
}

const styles = StyleSheet.create({
  // No marginBottom here — spacing between top-level sections comes from the parent
  // `ViewNode`'s `childrenList` gap, so it's consistent across every section-like node
  // (this, `CardSectionNode`, etc.) regardless of which one a blueprint uses.
  container: {},
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    fontWeight: '400',
  },
  horizontalContent: {
    gap: layoutTokens.gap,
    paddingRight: 16,
  },
  verticalContent: {
    gap: layoutTokens.gap,
  },
});
