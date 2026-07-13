import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getColorTokens, layout as layoutTokens } from '../../../../theme/theme';
import type { Node } from '../../../contracts/NodeSchema';
import type { NodeProps } from '../../types';

function asNodeArray(value: unknown): Node[] | undefined {
  return Array.isArray(value) ? (value as Node[]) : undefined;
}

function withFillWidth(child: Node): Node {
  return { ...child, fillWidth: true };
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
    columns[placedCol].push(withFillWidth(child));
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

  const tokens = getColorTokens(context.colorScheme ?? 'light');

  return (
    <View style={styles.container}>
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
          contentContainerStyle={styles.horizontalContent}
        >
          {render(children)}
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
    lineHeight: layoutTokens.headingFontSize,
    fontWeight: '700',
    letterSpacing: layoutTokens.letterSpacing,
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
    lineHeight: layoutTokens.captionFontSize,
    letterSpacing: layoutTokens.letterSpacing,
  },
  horizontalContent: {
    gap: layoutTokens.gap,
    paddingRight: layoutTokens.cardPadding,
  },
  verticalContent: {
    width: '100%',
    gap: layoutTokens.gap,
  },
  grid: {
    flexDirection: 'row',
    alignItems: 'stretch',
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
