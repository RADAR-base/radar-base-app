import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import ArrowRightIcon from '../../../../theme/icons/arrowright.svg';
import { tracking, fontFamily, getColorTokens, layout as layoutTokens, cardShadow } from '../../../../theme/theme';
import { useDashboardData } from '../../useDashboardData';
import { isLocalMetric, useLocalMetric } from '../../useLocalMetric';
import type { DashboardWidgetConfig } from '../../../../types';
import type { NodeProps } from '../../types';

export type DataWheelSize = 'small' | 'large';
type WheelState = 'bad' | 'neutral' | 'good';

const RING_SIZE = 142;
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
  // Figma's standalone small card is a fixed 176 wide; composite layouts (e.g.
  // CardSectionNode's `layout: "grid"`) set `fillWidth: true` so the card fills its flex
  // cell instead — matching StatCardNode, which shares those grid columns.
  const fillWidth = node.fillWidth === true;
  const metric = typeof node.metric === 'string' ? node.metric : 'wearable_metric';
  const unit = typeof node.unit === 'string' ? node.unit : undefined;
  const targetProp = typeof node.target === 'number' && node.target > 0 ? node.target : undefined;
  const reverse = node.reverse === true;
  // When set, the ring's center shows the value as a fraction of its target ("7/10") rather than
  // just the value — natural for count metrics like `task_completed` (X of Y tasks done).
  const showTotal = node.showTotal === true;
  const viewPath = typeof node.viewPath === 'string' ? node.viewPath : undefined;
  // The open button (arrow → `viewPath`) shows by default; set `showOpenButton: false` in the config
  // to hide it. Navigation still requires `viewPath` — a shown button with no target stays disabled.
  const showOpenButton = node.showOpenButton !== false;
  const inlineValue = typeof node.value === 'number' ? node.value : undefined;
  const inlineValues = Array.isArray(node.values)
    ? (node.values as number[]).filter((v) => typeof v === 'number')
    : inlineValue != null
      ? [inlineValue]
      : undefined;

  const config: DashboardWidgetConfig = useMemo(
    () => ({
      series: [{ id: metric, label: title, chartType: 'sparkline', unit, values: inlineValues }],
      placeholder:
        isLocalMetric(metric) || (inlineValues && inlineValues.length > 0) ? 'none' : 'random',
    }),
    [metric, title, unit, inlineValues],
  );
  const { series } = useDashboardData(config);
  const resolvedValues = series[0]?.values ?? [];
  const dashValue = resolvedValues.length > 0 ? resolvedValues[resolvedValues.length - 1] : 0;

  // A local metric (e.g. `metric: "task_completed"`) overrides the wearable value and supplies a
  // natural target (total tasks today); otherwise use the dashboard-resolved value + `target`/100.
  const local = useLocalMetric(metric);
  const statValue = local ? local.value : dashValue;
  const target = targetProp ?? local?.target ?? 100;
  const valueText = `${Math.round(statValue)}`;
  // With `showTotal`, the ring shows the value big with a small "out of N" beneath it (e.g. 3 /
  // "out of 4") instead of a "3/4" fraction.
  const totalText = showTotal ? `out of ${Math.round(target)}` : undefined;

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
        <Text
          style={[styles.ringValue, { color: tokens.text.primary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {valueText}
        </Text>
        {totalText && (
          <Text
            style={[styles.ringSubValue, { color: tokens.card.stats.description }]}
            numberOfLines={1}
          >
            {totalText}
          </Text>
        )}
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
          {showOpenButton && openButton}
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
    <View
      style={[
        styles.card,
        styles.cardSmall,
        // In a grid (fillWidth), fill the column's stretched height so the wheel always lines up with
        // the two stacked StatCards opposite it — even when their content grows past the base 93 (e.g.
        // under font scaling). Standalone (no flex parent) this is a harmless no-op. See CardSectionNode.
        fillWidth && styles.cardSmallFill,
        { backgroundColor: tokens.card.stats.background, width: fillWidth ? '100%' : 176 },
      ]}
    >
      <Text style={[styles.titleSmall, styles.titleTop, { color: tokens.text.primary }]} numberOfLines={1}>
        {title}
      </Text>
      {showOpenButton && <View style={styles.openButtonCorner}>{openButton}</View>}
      <View style={styles.ringCenter}>{wheel}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: layoutTokens.radiusCard,
    padding: layoutTokens.cardPadding,
    gap: layoutTokens.gap,
    ...cardShadow,
  },
  // 195 matches StatCardNode's cardLarge height, which is itself two stacked small StatCards
  // (93 + 9px grid gap + 93). In CardSectionNode's grid the wheel sits alone in one column
  // opposite two stacked small StatCards, so pinning it to 195 makes the two columns line up.
  // (padding 16*2 + header 24 + gap 9 + ring 128 = 193, so the ring clears the height.)
  cardSmall: {
    // minHeight, not height, so accessibility font scaling grows the card instead of clipping the
    // title/center value (the ring stays a fixed 128). See fontScaling.ts.
    minHeight: 195,
    alignItems: 'center',
    // No inter-child gap: the ring's own flex box (`ringCenter`) centers it in the space below the
    // header, so the title→ring and ring→bottom gaps come out equal.
    gap: 12,
  },
  // Grid-only: stretch to the column's full (row-matched) height so the wheel matches the two
  // stacked StatCards opposite it, whatever their combined height. `ringCenter` (flex:1) re-centers
  // the ring in the extra space.
  cardSmallFill: {
    flex: 1,
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
  // Small card: the ring sits in its own flex box below the title, centred within the space that's
  // left after the title text (not the whole card), so the title→ring and ring→bottom gaps come out equal.
  ringCenter: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The title is a plain top row; the open button is pinned to the top-right corner (absolute) so it
  // doesn't inflate the row height. That bounds the ring's centring by the *title text*, not the taller
  // button — otherwise the extra button height above the ring makes it read as pushed down / off-centre.
  titleTop: {
    width: '100%',
    paddingRight: 32, // leave room for the corner open button
  },
  openButtonCorner: {
    position: 'absolute',
    top: layoutTokens.cardPadding,
    right: layoutTokens.cardPadding,
    zIndex: 1,
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
    fontSize: 32,
    fontFamily: fontFamily.bold,
    includeFontPadding: false,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    textAlign: 'center',
    // Keep the number inside the ring's inner circle — `adjustsFontSizeToFit` then shrinks longer
    // values (e.g. "142") to fit rather than overrunning the stroke.
    maxWidth: RING_SIZE - RING_STROKE * 2 - 8,
  },
  // Small "out of N" caption beneath the big value when `showTotal` is set.
  ringSubValue: {
    fontSize: 11,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    opacity: 0.75,
    letterSpacing: tracking.regular,
    textAlign: 'center',
    marginTop: -2,
    maxWidth: RING_SIZE - RING_STROKE * 2 - 8,
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
