import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import ArrowRightIcon from '../../../../theme/icons/arrowright.svg';
import {
  tracking,
  fontFamily,
  getColorTokens,
  layout as layoutTokens,
  cardShadow,
  sleepStageColors,
  withAlpha,
} from '../../../../theme/theme';
import { ProgressRing, RING_SIZE, RING_STROKE } from '../../ProgressRing';
import { useDashboardData } from '../../useDashboardData';
import { useRangedNode } from '../../dataRange';
import { isLocalMetric, useLocalMetric } from '../../useLocalMetric';
import { useRiseStyle } from '../../RisingText';
import type { DashboardWidgetConfig } from '../../../../types';
import type { NodeProps } from '../../types';
import { formatDuration } from './chartAxis';
import { SleepStagesRing, asleepMinutes, describeNight, parseStages } from './SleepStagesRing';
import { CARD_HEADER_HEIGHT, WHEEL_RING_SIZE, WHEEL_RING_STROKE, squareCardHeight } from './SmallDataCard';
import { CardInfo, headerIcons } from './CardInfo';
import { openDataDetail } from './DataDetail';
import { sleepStageInfoRows } from './SleepTimeline';

/** The ring's sweep to a new figure, matching the number's count. */
const RING_TIMING = { duration: 450, easing: Easing.out(Easing.cubic) };

export type DataWheelSize = 'small' | 'large';
type WheelState = 'bad' | 'neutral' | 'good';

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
export function DataWheelCardNode({ node: blueprintNode, context }: NodeProps) {
  // Per-range props (`"values": { "day": …, "week": … }`) resolved for the data page's filter.
  const node = useRangedNode(blueprintNode);
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
  const info = typeof node.info === 'string' && node.info ? node.info : undefined;
  // As the data cards: the arrow with `showOpenButton: true` (or a `viewPath`), else the ⓘ.
  const { showInfo, showOpen: showOpenButton } = headerIcons(info, viewPath, node.showOpenButton);
  const inlineValue = typeof node.value === 'number' ? node.value : undefined;
  /**
   * Whether the ring sits *above* its text rather than beside it.
   *
   * Driven by the space available, not by `size` alone. The side-by-side arrangement needs a card the
   * width of the page: the ring alone is `RING_SIZE` (142) against a grid column's inner width of
   * about 135, so the row overflows, `justifyContent: 'center'` centres the overflow, and the ring
   * lands left of centre with its text block outside the card entirely. In a column — which is what
   * `fillWidth` means — a large card stacks like a small one.
   */
  const stacked = size === 'small' || fillWidth;
  const inlineValues = Array.isArray(node.values)
    ? (node.values as number[]).filter((v) => typeof v === 'number')
    : inlineValue != null
      ? [inlineValue]
      : undefined;
  // `stages` turns the ring into the night's sleep stages, each its share of the circle (Figma 4557:803).
  const stages = parseStages(node.stages);
  const sleep = stages.length > 0;

  const config: DashboardWidgetConfig = useMemo(
    () => ({
      series: [{ id: metric, label: title, chartType: 'sparkline', unit, values: inlineValues }],
      placeholder:
        sleep || isLocalMetric(metric) || (inlineValues && inlineValues.length > 0) ? 'none' : 'random',
    }),
    [metric, title, unit, inlineValues, sleep],
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
  // A new figure (e.g. the data filter changing period) rises into place.
  const valueRise = useRiseStyle(valueText);
  // With `showTotal`, the ring shows the value big with a small "out of N" beneath it (e.g. 3 /
  // "out of 4") instead of a "3/4" fraction.
  const totalText = showTotal ? `out of ${Math.round(target)}` : undefined;

  const percent = Math.max(0, Math.min(100, (statValue / target) * 100));
  const wheelState = stateForPercent(percent, reverse);

  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);
  const ringColor = tokens.dataWheel[wheelState];
  // Starts at its figure, then sweeps to each new one (the filter changing period).
  const ringProgress = useSharedValue(percent / 100);
  useEffect(() => {
    ringProgress.value = withTiming(percent / 100, RING_TIMING);
  }, [percent, ringProgress]);

  const brandColors = context.theme.brandColors;
  const brand = brandColors?.brand ?? tokens.button.background;
  const sleepValue = stages.length > 0 ? formatDuration(inlineValue ?? asleepMinutes(stages)) : '–';

  // In a square card the ring shrinks to fit the same header and gap as the small data cards.
  const ringSize = stacked ? WHEEL_RING_SIZE : RING_SIZE;
  const ringStroke = stacked ? WHEEL_RING_STROKE : RING_STROKE;
  const ringBox = { width: ringSize, height: ringSize };
  const valueWidth = { maxWidth: ringSize - ringStroke * 2 - 8 };

  const wheel = sleep ? (
    <View accessible accessibilityLabel={`${title}: ${sleepValue} asleep. ${describeNight(stages)}`}>
      <SleepStagesRing
        stages={stages}
        valueText={sleepValue}
        text={tokens.text.primary}
        // The same stage colours as every other sleep chart.
        colors={sleepStageColors(context.colorScheme ?? 'light', brand)}
        size={ringSize}
        stroke={ringStroke}
      />
    </View>
  ) : (
    <View style={[styles.ringWrapper, ringBox]}>
      <ProgressRing progress={ringProgress} color={ringColor} size={ringSize} stroke={ringStroke} />
      <View style={[styles.ringValueWrapper, ringBox]}>
        {/* The wrapper rises, so the figure keeps its shrink-to-fit. */}
        <Animated.View style={valueRise}>
          <Text
            style={[styles.ringValue, valueWidth, { color: tokens.text.primary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {valueText}
          </Text>
        </Animated.View>
        {totalText && (
          <Text
            style={[styles.ringSubValue, valueWidth, { color: tokens.card.stats.description }]}
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
      accessibilityLabel={`Open ${title}`}
      onPress={() => openDataDetail(context, title, viewPath)}
      style={[styles.openBadge, { backgroundColor: tokens.card.stats.openBadge }]}
    >
      <ArrowRightIcon width={13} height={12} color={tokens.card.stats.openIcon} />
    </TouchableOpacity>
  );

  // The same header as the small data cards: the title and its ⓘ, and the arrow, in a 28pt row.
  const header = (
    <View style={styles.headerRow}>
      <View style={styles.titleRow}>
        <Text style={[styles.titleSmall, { color: tokens.text.primary }]} numberOfLines={1}>
          {title}
        </Text>
        {showInfo && info && (
          <CardInfo
            title={title}
            info={info}
            color={withAlpha(tokens.text.primary, 0.55)}
            context={context}
            rows={sleep ? sleepStageInfoRows() : undefined}
          />
        )}
      </View>
      {showOpenButton && openButton}
    </View>
  );

  if (!stacked) {
    return (
      <View style={[styles.card, styles.cardLarge, { backgroundColor: tokens.card.stats.background }]}>
        {header}
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
        styles.cardStacked,
        // In a grid (fillWidth), fill the column's stretched height so the wheel always lines up with
        // the two stacked StatCards opposite it — even when their content grows past the base 93 (e.g.
        // under font scaling). Standalone (no flex parent) this is a harmless no-op. See CardSectionNode.
        { backgroundColor: tokens.card.stats.background, width: fillWidth ? '100%' : 176, minHeight: squareCardHeight() },
      ]}
    >
      {header}
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
  // The ring under the header, as a grid column shows it whatever its `size` (see `stacked`). Padding
  // 16*2 + header 28 + gap 9 + ring 126 is the small data cards' 195; its minHeight is the
  // `squareCardHeight()` they share.
  cardStacked: {
    alignItems: 'center',
  },
  // Grid-only: stretch to the column's full (row-matched) height so the wheel matches the two
  // stacked StatCards opposite it, whatever their combined height. `ringCenter` (flex:1) re-centers
  // the ring in the extra space.
  cardLarge: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    minHeight: CARD_HEADER_HEIGHT,
    width: '100%',
  },
  // Stacked card: the ring is centred in whatever room the header leaves.
  ringCenter: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValueWrapper: {
    position: 'absolute',
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
    // Kept inside the ring by a maxWidth from its size; `adjustsFontSizeToFit` then shrinks longer
    // values (e.g. "142") to fit rather than overrunning the stroke.
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
  },
  titleSmall: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
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
  // As the data cards' arrow.
  openBadge: {
    width: CARD_HEADER_HEIGHT,
    height: CARD_HEADER_HEIGHT,
    borderRadius: CARD_HEADER_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
