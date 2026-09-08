import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { tracking, fontFamily, getColorTokens, layout as layoutTokens } from '../../../../theme/theme';
import { TaskDayList, type FilterShape } from './TaskDayList';
import type { NodeProps } from '../../types';

/**
 * Task list driven by `ScheduleService` (ultimately `protocol.json`), rendered as `TaskCardNode`s —
 * the config-driven counterpart to `SurveyTaskListNode`'s own inline task rendering. Same
 * `title`/`showSeeAll`/`viewPath` chrome as `CardSectionNode`, themed from `theme.ts`.
 *
 * This node owns only the section chrome (title + optional "See All" pill); the actual task loading
 * and rendering lives in the shared `TaskDayList`, always for *today*. `CalendarNode` reuses that
 * same `TaskDayList` for an arbitrary selected day.
 */
export function TaskListSectionNode({ node, context }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : undefined;
  const showSeeAll = node.showSeeAll === true;
  const viewPath = typeof node.viewPath === 'string' ? node.viewPath : undefined;
  const variant = node.variant === 'multiCard' ? 'multiCard' : 'singleCard';
  const filter = useMemo<FilterShape>(
    () => (isRecord(node.filter) ? (node.filter as FilterShape) : {}),
    [node.filter],
  );

  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);

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

      <TaskDayList context={context} date={new Date()} variant={variant} filter={filter} idPrefix={node.id} />
    </View>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
});
