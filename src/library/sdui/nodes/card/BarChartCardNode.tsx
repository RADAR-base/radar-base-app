import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import ArrowRightIcon from '../../../../theme/icons/arrowright.svg';
import { tracking, fontFamily, getColorTokens, layout as layoutTokens } from '../../../../theme/theme';
import { useDashboardData } from '../../useDashboardData';
import type { DashboardWidgetConfig } from '../../../../types';
import type { NodeProps } from '../../types';

export type BarChartSize = 'small' | 'large';

/** Monday-first weekday initials, matching the Figma `BarStats` day row (M T W T F S S). */
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const DAYS = DAY_LABELS.length;

const CHART_HEIGHT = 106;
const BAR_WIDTH = 13;
// Bars are scaled between the dataset's min and max rather than 0..max, so the shortest
// day still reads as a visible bar and the tallest leaves headroom below the card edge.
// The average line uses the same mapping, so it always sits proportionally between the
// shortest and tallest bar (see `fractionForValue`).
const MIN_BAR_FRACTION = 0.15;
const MAX_BAR_FRACTION = 0.85;

const AVG_PILL_HEIGHT = 14;
// How far the average pill overhangs past the bars into the card's right padding, so it
// sits toward the card edge rather than stopping at the last bar (matches the Figma).
const PILL_OVERHANG = 12;

/**
 * Bar chart card — matches the Figma `BarStats` component set (node 2250:2687): seven
 * day-of-week bars over a faint track, a dashed average line with the average value in a
 * pill at its right end, and a weekday label row where the current day is highlighted. Has
 * a `size` variant (small = square, bars above labels; large = bars beside a title +
 * description block), mirroring `DataWheelCardNode`.
 *
 * Reads its data via `useDashboardData` (same resolution `GraphDataNode` /
 * `DataWheelCardNode` use — inline `values`, a `dataSource` API fetch, or synthesized
 * placeholder data), taking the last seven values as the week. `metric` selects which
 * wearable series to show, so the card can be pointed at any data type from a blueprint.
 */
export function BarChartCardNode({ node, context }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : 'Title';
  const description = typeof node.description === 'string' ? node.description : '';
  const size: BarChartSize = node.size === 'large' ? 'large' : 'small';
  const metric = typeof node.metric === 'string' ? node.metric : 'wearable_metric';
  const unit = typeof node.unit === 'string' ? node.unit : undefined;
  const viewPath = typeof node.viewPath === 'string' ? node.viewPath : undefined;
  // Defaults to today (JS Sunday=0 remapped to a Monday-first index), but can be pinned
  // from a blueprint for previews / fixed reports.
  const currentDayIndex =
    typeof node.currentDayIndex === 'number' && node.currentDayIndex >= 0 && node.currentDayIndex < DAYS
      ? node.currentDayIndex
      : (new Date().getDay() + 6) % 7;

  const inlineValues = Array.isArray(node.values)
    ? (node.values as number[]).filter((v) => typeof v === 'number')
    : undefined;

  const config: DashboardWidgetConfig = useMemo(
    () => ({
      series: [{ id: metric, label: title, chartType: 'bar', unit, values: inlineValues }],
      placeholder: inlineValues && inlineValues.length > 0 ? 'none' : 'random',
    }),
    [metric, title, unit, inlineValues],
  );
  const { series } = useDashboardData(config);
  const values = lastSevenDays(series[0]?.values ?? []);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const average = values.reduce((sum, v) => sum + v, 0) / values.length;

  // Map a value to its bar-height fraction. When every day is equal (`range === 0`) there's
  // no meaningful min/max spread, so everything (bars + line) sits at the midpoint.
  const fractionForValue = (value: number): number =>
    range === 0
      ? (MIN_BAR_FRACTION + MAX_BAR_FRACTION) / 2
      : MIN_BAR_FRACTION + ((value - min) / range) * (MAX_BAR_FRACTION - MIN_BAR_FRACTION);

  const avgFraction = fractionForValue(average);

  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);
  const barTokens = tokens.barChart;

  // The dashed average line is drawn with SVG (RN's `borderStyle: 'dashed'` renders
  // unreliably on a zero-height single-border View), which needs a pixel width — measured
  // from the chart's laid-out size.
  const [chartWidth, setChartWidth] = useState(0);
  // The value pill is centered on the line's right end; the dashed line stops just before
  // it (measured width) so the two read as one marker instead of the pill hiding the line.
  const [pillWidth, setPillWidth] = useState(0);
  const avgLineY = (1 - avgFraction) * CHART_HEIGHT;
  const lineEndX = Math.max(0, chartWidth + PILL_OVERHANG - pillWidth - 2);

  const openButton = (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={!viewPath}
      onPress={() => viewPath && context.dispatch({ type: 'OpenCustomView', viewUrl: viewPath })}
      style={[styles.openBadge, { backgroundColor: tokens.card.stats.openBadge }]}
    >
      <ArrowRightIcon width={12} height={12} color={tokens.card.stats.openIcon} />
    </TouchableOpacity>
  );

  const chart = (
    <View
      style={styles.chartArea}
      onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.barsRow}>
        {values.map((value, i) => (
          <View key={i} style={styles.barSlot}>
            <View style={[styles.barTrack, { backgroundColor: barTokens.barTrack }]}>
              <View
                style={[
                  styles.barFill,
                  { height: `${fractionForValue(value) * 100}%`, backgroundColor: barTokens.bar },
                ]}
              />
            </View>
          </View>
        ))}
      </View>

      {/* Average line + value pill, overlaid so they float across the bars at the average's
          mapped height. The dashed line spans the full chart width (all seven bars); the value
          pill sits just above the line's right end so it doesn't obscure the line under it. */}
      {chartWidth > 0 && (
        <Svg
          width={chartWidth + PILL_OVERHANG}
          height={2}
          style={[styles.avgLine, { top: avgLineY - 1 }]}
          pointerEvents="none"
        >
          <Line
            x1={0}
            y1={1}
            x2={lineEndX}
            y2={1}
            stroke={barTokens.average}
            strokeWidth={1.5}
            strokeDasharray="3 4"
            strokeLinecap="round"
          />
        </Svg>
      )}
      <View
        pointerEvents="none"
        onLayout={(e) => setPillWidth(e.nativeEvent.layout.width)}
        style={[
          styles.avgPill,
          { top: avgLineY - AVG_PILL_HEIGHT / 2, right: -PILL_OVERHANG, backgroundColor: barTokens.average },
        ]}
      >
        <Text style={[styles.avgPillText, { color: barTokens.averageLabel }]}>{Math.round(average)}</Text>
      </View>
    </View>
  );

  const dayLabels = (
    <View style={styles.dayRow}>
      {DAY_LABELS.map((day, i) => {
        const isCurrent = i === currentDayIndex;
        return (
          <Text
            key={i}
            style={[
              styles.dayLabel,
              {
                color: isCurrent ? barTokens.currentDay : tokens.text.primary,
                fontWeight: isCurrent ? '700' : '400',
              },
            ]}
          >
            {day}
          </Text>
        );
      })}
    </View>
  );

  if (size === 'large') {
    return (
      <View style={[styles.card, styles.cardLarge, { backgroundColor: tokens.card.stats.background }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.titleSmall, { color: tokens.text.primary }]} numberOfLines={1}>
            {title}
          </Text>
          {openButton}
        </View>
        <View style={styles.largeRow}>
          <View style={styles.chartColumn}>
            {chart}
            {dayLabels}
          </View>
          <View style={styles.largeTextBlock}>
            <Text style={[styles.titleLarge, { color: tokens.text.primary }]}>{title}</Text>
            {description !== '' && (
              <Text style={[styles.description, { color: tokens.card.stats.description }]}>{description}</Text>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, styles.cardSmall, { backgroundColor: tokens.card.stats.background }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.titleSmall, { color: tokens.text.primary }]} numberOfLines={1}>
          {title}
        </Text>
        {openButton}
      </View>
      {chart}
      {dayLabels}
    </View>
  );
}

/**
 * Reduce a resolved series to exactly seven values (one per weekday). Takes the most
 * recent seven; if fewer are available it front-pads with the earliest value so the week
 * still renders, and falls back to a flat week of zeros when there's no data at all.
 */
function lastSevenDays(vals: number[]): number[] {
  if (vals.length >= DAYS) return vals.slice(-DAYS);
  if (vals.length === 0) return Array(DAYS).fill(0);
  return [...Array(DAYS - vals.length).fill(vals[0]), ...vals];
}

const styles = StyleSheet.create({
  card: {
    borderRadius: layoutTokens.radiusCard,
    padding: layoutTokens.cardPadding,
    gap: layoutTokens.gap,
    shadowColor: '#085041',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  cardSmall: {
    width: 176,
    alignItems: 'center',
  },
  cardLarge: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  largeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    width: '100%',
  },
  chartColumn: {
    width: 176,
    gap: layoutTokens.gap,
  },
  largeTextBlock: {
    flexShrink: 1,
    gap: layoutTokens.gap,
  },
  chartArea: {
    height: CHART_HEIGHT,
    width: '100%',
    position: 'relative',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT,
    width: '100%',
  },
  barSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: CHART_HEIGHT,
  },
  barTrack: {
    width: BAR_WIDTH,
    height: CHART_HEIGHT,
    borderRadius: layoutTokens.radiusCard,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: layoutTokens.radiusCard,
  },
  avgLine: {
    position: 'absolute',
    left: 0,
  },
  avgPill: {
    position: 'absolute',
    right: 0,
    height: AVG_PILL_HEIGHT,
    minWidth: 18,
    paddingHorizontal: 5,
    borderRadius: layoutTokens.radiusCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avgPillText: {
    fontSize: layoutTokens.captionFontSize,
    fontFamily: fontFamily.bold,
    includeFontPadding: false,
    fontWeight: '700',
    letterSpacing: tracking.bold,
  },
  dayRow: {
    flexDirection: 'row',
    width: '100%',
  },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: layoutTokens.captionFontSize,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    letterSpacing: tracking.regular,
  },
  titleSmall: {
    flexShrink: 1,
    fontSize: 12,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    letterSpacing: tracking.regular,
  },
  // Figma's large `BarStats` uses a 24px bold heading beside the chart (node 2985:1049);
  // there's no design token for that size, so it's inlined like `DataWheelCardNode`'s
  // 24px `ringValue`.
  titleLarge: {
    fontSize: 24,
    fontFamily: fontFamily.bold,
    includeFontPadding: false,
    fontWeight: '700',
  },
  description: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    letterSpacing: tracking.regular,
  },
  openBadge: {
    width: 24,
    height: 24,
    borderRadius: layoutTokens.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
