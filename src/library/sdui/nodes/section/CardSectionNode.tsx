import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  tracking,
  fontFamily,
  getColorTokens,
  cardShadowBleed,
  layout as layoutTokens,
} from '../../../../theme/theme';
import type { Node } from '../../../contracts/NodeSchema';
import type { NodeProps } from '../../types';

function asNodeArray(value: unknown): Node[] | undefined {
  return Array.isArray(value) ? (value as Node[]) : undefined;
}

function withFillWidth(child: Node, fillWidth: boolean): Node {
  // A blueprint that states it wins — this only supplies what the layout implies.
  return child.fillWidth === undefined ? { ...child, fillWidth } : child;
}

/**
 * Hand a horizontal row's children the width the section itself was given.
 *
 * Inside a horizontally-scrolling content container there is no width to be a percentage of — the
 * container is as wide as its children make it — so a card that wants to span the page cannot say
 * `width: '100%'` and has nothing to measure. This passes the number down instead: the width the
 * section occupies, which is the page's content width. A card that sizes itself (a 176 stat card)
 * ignores it; one that spans the page (`StreakCardNode`) uses it in place of the percentage.
 */
function withAvailableWidth(child: Node, availableWidth: number): Node {
  return availableWidth > 0 ? { ...child, availableWidth } : child;
}

/**
 * Row-major ("Z path") auto-placement over a fixed 2-column grid, mirroring CSS Grid's
 * default auto-flow: scan cells in reading order — row 0's columns left-to-right, then
 * row 1's, and so on — and drop each child into the first cell (or, for a 2-row-span
 * child, the first same-column pair of cells) it fits in. `size: "small"` children span
 * 1 row; everything else spans 2 (a whole column), matching `StatCardNode`'s large/small
 * variants. Returns each column's children in top-to-bottom order, ready to render in a
 * `flex: 1` column.
 */
function packGrid(children: Node[]): [Node[], Node[]] {
  const COLUMN_COUNT = 2;
  const occupied: boolean[][] = [];
  const ensureRow = (r: number) => {
    while (occupied.length <= r) occupied.push(new Array(COLUMN_COUNT).fill(false));
  };
  const canPlace = (row: number, col: number, span: number) => {
    ensureRow(row + span - 1);
    for (let r = row; r < row + span; r++) {
      if (occupied[r][col]) return false;
    }
    return true;
  };
  const occupy = (row: number, col: number, span: number) => {
    for (let r = row; r < row + span; r++) occupied[r][col] = true;
  };

  const columns: [Node[], Node[]] = [[], []];
  for (const child of children) {
    const span = child.size === 'small' ? 1 : 2;
    let row = 0;
    let placedCol = -1;
    while (placedCol === -1) {
      for (let col = 0; col < COLUMN_COUNT; col++) {
        if (canPlace(row, col, span)) {
          occupy(row, col, span);
          placedCol = col;
          break;
        }
      }
      if (placedCol === -1) row++;
    }
    columns[placedCol].push(withFillWidth(child, true));
  }
  return columns;
}

/**
 * Generic card-list section — matches the Figma "My Activity" (node 2243:2055) and "My
 * Tasks" (node 2267:2974) frames, which are the same title+"See All"+card-list shell
 * around different content (stat cards side-by-side vs. task pills stacked). Rather than
 * hardcoding either arrangement, this maps whatever `children` the blueprint config
 * gives it — same generic-slot model as `SectionNode` — and just supplies the Figma
 * chrome (title style, "See All" pill, spacing) themed from `theme.ts`'s color tokens
 * instead of `SectionNode`'s manifest-driven `theme.textColor`.
 *
 * `layout: "horizontal"` scrolls children in a row (e.g. the stat cards example);
 * `"vertical"` (default) stacks them full-width with a 9px gap (e.g. the task list
 * example); `"grid"` auto-places them into a 2-column grid via `packGrid` (see above) —
 * a `size: "small"` child takes one cell, everything else takes both rows of whichever
 * column it lands in, matching the Figma "My Activity" grid. Grid children are rendered
 * with `fillWidth: true` merged in so `StatCardNode` (or any other card respecting that
 * flag) stretches to fill its column instead of Figma's standalone fixed 176px.
 *
 * Unlike `SectionNode`'s `seeAllAction` (a raw viewUrl string), `showSeeAll` here is a
 * plain boolean and the destination is its own `viewPath` prop — matching the
 * `viewPath` naming already used for tabs in `app-manifest.json`.
 */
export function CardSectionNode({ node, context, render }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : undefined;
  const showSeeAll = node.showSeeAll === true;
  const viewPath = typeof node.viewPath === 'string' ? node.viewPath : undefined;
  const layout =
    node.layout === 'horizontal' ? 'horizontal' : node.layout === 'grid' ? 'grid' : 'vertical';
  const children = asNodeArray(node.children);
  const [gridColumn0, gridColumn1] = layout === 'grid' ? packGrid(children ?? []) : [[], []];
  /**
   * The width the section itself occupies — the page's content width, measured rather than assumed.
   *
   * Only a horizontal row needs it, and only because its children have no width to be a percentage
   * of; see `withAvailableWidth`. Measured on the outer container, which is the element still sized
   * by the page: the `ScrollView` inside it is deliberately wider (see `horizontalBleed`).
   */
  const [sectionWidth, setSectionWidth] = useState(0);
  const horizontalChildren =
    layout === 'horizontal'
      ? (children ?? []).map(c => withAvailableWidth(c, sectionWidth))
      : children;

  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);

  return (
    <View
      style={styles.container}
      onLayout={
        layout === 'horizontal' ? e => setSectionWidth(e.nativeEvent.layout.width) : undefined
      }
    >
      {title && (
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: tokens.text.primary }]}>{title}</Text>
          {showSeeAll && viewPath && (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => context.dispatch({ type: 'OpenCustomView', viewUrl: viewPath })}
            >
              <View style={[styles.seeAllPill, { borderColor: tokens.card.stats.description }]}>
                <Text style={[styles.seeAllText, { color: tokens.text.primary }]}>See All</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      )}
      {layout === 'horizontal' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.horizontalBleed}
          contentContainerStyle={styles.horizontalContent}
        >
          {render(horizontalChildren)}
        </ScrollView>
      ) : layout === 'grid' ? (
        <View style={styles.grid}>
          <View style={[styles.gridColumn, styles.gridColumnStacked]}>{render(gridColumn0)}</View>
          <View style={[styles.gridColumn, styles.gridColumnStacked]}>{render(gridColumn1)}</View>
        </View>
      ) : (
        <View style={styles.verticalContent}>{render(children)}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: layoutTokens.gap,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  title: {
    fontSize: layoutTokens.headingFontSize,
    fontFamily: fontFamily.bold,
    includeFontPadding: false,
    lineHeight: layoutTokens.headingLineHeight,
    fontWeight: '700',
    letterSpacing: tracking.bold,
  },
  seeAllPill: {
    height: 18,
    borderWidth: 1,
    borderRadius: layoutTokens.radiusPill,
    paddingHorizontal: layoutTokens.pillPaddingHorizontal,
    paddingVertical: layoutTokens.pillPaddingVertical,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seeAllText: {
    fontSize: layoutTokens.captionFontSize,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    lineHeight: layoutTokens.captionFontSize,
    letterSpacing: tracking.regular,
  },
  /**
   * Escape the page gutter so the row scrolls edge to edge.
   *
   * Left inside it, cards are clipped at the gutter and the row reads as a window with a margin
   * rather than as content running off the screen. The negative margin widens the scroll view to the
   * full screen; `horizontalContent` pays the same amount back as padding, so the first card still
   * starts flush with the heading above it and the last one clears the right edge.
   */
  horizontalBleed: {
    marginHorizontal: -layoutTokens.pageGutter,
    // Deliberately no negative *vertical* margin to match the padding below. A horizontal scroll
    // view takes its height from its content and stretches its children to it, so pulling the frame
    // in by a margin shortens the cards themselves — it sliced the bottom off the streak card's day
    // circles. The row simply gets that much taller instead.
  },
  // `stretch` so cards of different natural heights come out level — a streak card is shorter than a
  // wheel, and left to themselves they'd sit on a ragged baseline.
  horizontalContent: {
    alignItems: 'stretch',
    gap: layoutTokens.gap,
    paddingHorizontal: layoutTokens.pageGutter,
    // Room for the shadow to fall into, so the scroll view's own clip doesn't cut it off.
    paddingVertical: cardShadowBleed,
  },
  verticalContent: {
    width: '100%',
    gap: layoutTokens.gap,
  },
  grid: {
    flexDirection: 'row',
    // Each column ends where its own content ends. `stretch` made both as tall as the taller one,
    // and whichever card was flexible then absorbed the whole difference — a lone large card beside
    // a two-card column grew by ~100pt and pulled its own contents apart to fill it.
    alignItems: 'flex-start',
    gap: layoutTokens.gap,
    width: '100%',
  },
  gridColumn: {
    flex: 1,
    minWidth: 0,
  },
  gridColumnStacked: {
    gap: layoutTokens.gap,
  },
});
