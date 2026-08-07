import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import ArrowRightIcon from '../../../../theme/icons/arrowright.svg';
import { tracking, fontFamily, getColorTokens, layout as layoutTokens } from '../../../../theme/theme';
import { useDashboardData } from '../../useDashboardData';
import type { DashboardWidgetConfig } from '../../../../types';
import type { NodeProps } from '../../types';

export type DataWheelSize = 'small' | 'large';
type WheelState = 'bad' | 'neutral' | 'good';

const RING_SIZE = 134;
const RING_STROKE = 18;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * <34% filled → red ("bad"); 34–66% → amber ("neutral"); >66% → green ("good"), per the
 * card's spec. Thresholds are otherwise arbitrary — adjust here if a real wearable metric
 * needs different bands. `reverse` swaps the low/high ends (high → "bad", low → "good") for
 * metrics where "less is better", matching `ArcDataCardNode`'s `reverse`.
 */
function stateForPercent(percent: number, reverse: boolean): WheelState {
  const low: WheelState = reverse ? 'good' : 'bad';
  const high: WheelState = reverse ? 'bad' : 'good';
  if (percent < 34) return low;
  if (percent <= 66) return 'neutral';
  return high;
}

/**
 * Data wheel card — matches the Figma `WheelStats` component set (node 2189:1786): a
 * circular progress ring around a stat number, with a `size` variant (small = ring above
 * title; large = ring beside title + description). The ring's color is derived from the
 * fill percentage (see `stateForPercent`) rather than taken as a direct prop, matching
 * the card's actual behavior — it's a status indicator, not a free color choice.
 *
 * Reads its stat via `useDashboardData` (the same resolution `GraphDataNode` uses for
 * wearable-sourced metrics: inline `values`, a `dataSource` API fetch, or synthesized
 * placeholder data), so it can be wired to a real wearable API the same way any other
 * dashboard widget is, instead of only accepting a pre-computed number.
 */
export function DataWheelCardNode({ node, context }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : 'Title';
  const description = typeof node.description === 'string' ? node.description : '';
  const size: DataWheelSize = node.size === 'large' ? 'large' : 'small';
  const metric = typeof node.metric === 'string' ? node.metric : 'wearable_metric';
  const unit = typeof node.unit === 'string' ? node.unit : undefined;
  const target = typeof node.target === 'number' && node.target > 0 ? node.target : 100;
  const reverse = node.reverse === true;
  const viewPath = typeof node.viewPath === 'string' ? node.viewPath : undefined;
  const inlineValue = typeof node.value === 'number' ? node.value : undefined;
  const inlineValues = Array.isArray(node.values)
    ? (node.values as number[]).filter((v) => typeof v === 'number')
    : inlineValue != null
      ? [inlineValue]
      : undefined;

  const config: DashboardWidgetConfig = useMemo(
    () => ({
      series: [{ id: metric, label: title, chartType: 'sparkline', unit, values: inlineValues }],
      placeholder: inlineValues && inlineValues.length > 0 ? 'none' : 'random',
    }),
    [metric, title, unit, inlineValues],
  );
  const { series } = useDashboardData(config);
  const resolvedValues = series[0]?.values ?? [];
  const statValue = resolvedValues.length > 0 ? resolvedValues[resolvedValues.length - 1] : 0;

  const percent = Math.max(0, Math.min(100, (statValue / target) * 100));
  const wheelState = stateForPercent(percent, reverse);

  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);
  const ringColor = tokens.dataWheel[wheelState];
  const dashOffset = RING_CIRCUMFERENCE * (1 - percent / 100);

  const wheel = (
    <View style={styles.ringWrapper}>
      <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={ringColor}
          strokeWidth={RING_STROKE}
          strokeOpacity={0.25}
          fill="none"
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={ringColor}
          strokeWidth={RING_STROKE}
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          fill="none"
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>
      <View style={styles.ringValueWrapper}>
        <Text style={[styles.ringValue, { color: tokens.text.primary }]}>{Math.round(statValue)}</Text>
      </View>
    </View>
  );

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

  if (size === 'large') {
    return (
      <View style={[styles.card, styles.cardLarge, { backgroundColor: tokens.card.stats.background }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.titleSmall, { color: tokens.text.primary }]} numberOfLines={1}>
            {title}
          </Text>
          {openButton}
        </View>
        <View style={styles.largeContentRow}>
          {wheel}
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
      {wheel}
    </View>
  );
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
  largeContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    width: '100%',
  },
  largeTextBlock: {
    gap: layoutTokens.gap,
    flexShrink: 1,
  },
  ringWrapper: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValueWrapper: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    fontSize: 24,
    fontFamily: fontFamily.bold,
    includeFontPadding: false,
    fontWeight: '700',
    letterSpacing: tracking.bold,
  },
  titleSmall: {
    flexShrink: 1,
    fontSize: 12,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    letterSpacing: tracking.regular,
  },
  titleLarge: {
    fontSize: layoutTokens.headingFontSize,
    fontFamily: fontFamily.bold,
    includeFontPadding: false,
    fontWeight: '700',
  },
  description: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    width: 128,
  },
  openBadge: {
    width: 24,
    height: 24,
    borderRadius: layoutTokens.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
