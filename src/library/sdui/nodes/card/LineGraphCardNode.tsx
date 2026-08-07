import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import ArrowRightIcon from '../../../../theme/icons/arrowright.svg';
import { tracking, fontFamily, getColorTokens, layout as layoutTokens } from '../../../../theme/theme';
import { useScrollLock } from '../../ScrollLockContext';
import { useDashboardData } from '../../useDashboardData';
import type { DashboardWidgetConfig } from '../../../../types';
import type { NodeProps } from '../../types';

/** X axis granularity — hours across a day or days across a week (drives the point count). */
export type LineGraphXAxis = 'day' | 'week';

// Breathing room so the plotted line/points never touch the edges. The horizontal inset in
// particular keeps the first/last points' dots from being clipped by the card edge.
const PLOT_PAD_TOP = 12;
const PLOT_PAD_BOTTOM = 12;
const PLOT_PAD_X = 8;
const DOT_RADIUS = 5;
const LINE_WIDTH = 3.5;

/**
 * Line graph card — matches the Figma `Graph` component set (node 3049:792): a titled card
 * with a line plotted over time and a gradient fading beneath it. Dragging across the plot
 * scrubs: a vertical crosshair + dot follow the touch, and a hint tooltip at the top shows
 * that point's value. The tooltip stays inside the card — it left-aligns near the left edge,
 * centers in the middle, and right-aligns near the right edge (a clamp of its centered
 * position), matching the design's three states.
 *
 * Reads its data via `useDashboardData` (inline `values` today; a `dataSource` API fetch or
 * an Apple HealthKit / wearable bridge later — same resolution the other cards use), so
 * `metric` selects the series and the config supplies values for now.
 */
export function LineGraphCardNode({ node, context }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : 'Title';
  const metric = typeof node.metric === 'string' ? node.metric : 'wearable_metric';
  const unit = typeof node.unit === 'string' ? node.unit : undefined;
  // `xAxis` is semantic for now (hours-in-a-day vs days-in-a-week); the point count comes
  // from the resolved values. Kept on the API so time-axis labelling can hang off it later.
  const xAxis: LineGraphXAxis = node.xAxis === 'week' ? 'week' : 'day';
  const viewPath = typeof node.viewPath === 'string' ? node.viewPath : undefined;
  const inlineValues = Array.isArray(node.values)
    ? (node.values as number[]).filter((v) => typeof v === 'number')
    : undefined;

  const config: DashboardWidgetConfig = useMemo(
    () => ({
      series: [{ id: metric, label: title, chartType: 'sparkline', unit, values: inlineValues }],
      placeholder: inlineValues && inlineValues.length > 0 ? 'none' : 'random',
    }),
    [metric, title, unit, inlineValues],
  );
  const { series } = useDashboardData(config);
  const values = series[0]?.values ?? [];

  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);
  const graphTokens = tokens.graph;

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [tooltipSize, setTooltipSize] = useState({ w: 0, h: 0 });

  // Lock the parent ScrollView while dragging so the page doesn't scroll with the gesture.
  const { setLocked } = useScrollLock();
  const lockRef = useRef(setLocked);
  lockRef.current = setLocked;
  const gradientId = `graphGrad${useIdSafe()}`;

  const n = values.length;
  const min = n > 0 ? Math.min(...values) : 0;
  const max = n > 0 ? Math.max(...values) : 1;
  const range = max - min || 1;

  const plotW = Math.max(0, size.w - PLOT_PAD_X * 2);
  const xFor = (i: number) => (n > 1 ? PLOT_PAD_X + (i / (n - 1)) * plotW : size.w / 2);
  const yFor = (v: number) => {
    const t = (v - min) / range; // 0 (min) .. 1 (max)
    return PLOT_PAD_TOP + (1 - t) * Math.max(0, size.h - PLOT_PAD_TOP - PLOT_PAD_BOTTOM);
  };

  const points = useMemo(
    () => values.map((v, i) => ({ x: xFor(i), y: yFor(v) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, size.w, size.h],
  );
  const linePath = smoothPath(points);
  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x} ${size.h} L ${points[0].x} ${size.h} Z`
      : '';

  // The pan handler reads the latest size/points through a ref so it doesn't capture stale
  // values from the render it was created in.
  const scrubRef = useRef({ w: 0, n: 0 });
  scrubRef.current = { w: size.w, n };
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          lockRef.current(true);
          scrub(e.nativeEvent.locationX);
        },
        onPanResponderMove: (e) => scrub(e.nativeEvent.locationX),
        onPanResponderRelease: () => {
          lockRef.current(false);
          setActiveIndex(null);
        },
        onPanResponderTerminate: () => {
          lockRef.current(false);
          setActiveIndex(null);
        },
      }),
    // Created once; reads live state via scrubRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function scrub(locationX: number) {
    const { w, n: count } = scrubRef.current;
    if (w <= 0 || count < 1) return;
    const clamped = Math.max(0, Math.min(w, locationX));
    setActiveIndex(count > 1 ? Math.round((clamped / w) * (count - 1)) : 0);
  }

  const active = activeIndex != null && activeIndex < points.length ? points[activeIndex] : null;
  const activeValue = activeIndex != null ? values[activeIndex] : undefined;
  // Centered on the crosshair, clamped so it never spills outside the card.
  const tooltipLeft = active
    ? Math.max(0, Math.min(active.x - tooltipSize.w / 2, size.w - tooltipSize.w))
    : 0;
  // Start the crosshair at the tooltip's vertical middle so the line never shows through the
  // tooltip's rounded top corners (visible for the first/last points, where the tooltip is
  // clamped to the edge and the line runs along its corner).
  const crosshairTop = tooltipSize.h > 0 ? tooltipSize.h / 2 : 0;

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

  return (
    <View style={[styles.card, { backgroundColor: tokens.card.stats.background }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: tokens.text.primary }]} numberOfLines={1}>
          {title}
        </Text>
        {openButton}
      </View>

      <View
        style={styles.plot}
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        {...panResponder.panHandlers}
      >
        {size.w > 0 && size.h > 0 && points.length > 1 && (
          <Svg width={size.w} height={size.h}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={graphTokens.area} stopOpacity={0.35} />
                <Stop offset="1" stopColor={graphTokens.area} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {/* Gradient area beneath the line */}
            <Path d={areaPath} fill={`url(#${gradientId})`} />
            {/* The plotted line */}
            <Path
              d={linePath}
              stroke={graphTokens.line}
              strokeWidth={LINE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {/* Drag crosshair + point */}
            {active && (
              <>
                <Line
                  x1={active.x}
                  y1={crosshairTop}
                  x2={active.x}
                  y2={size.h}
                  stroke={graphTokens.crosshair}
                  strokeWidth={1}
                  strokeOpacity={0.5}
                />
                <Circle cx={active.x} cy={active.y} r={DOT_RADIUS} fill={graphTokens.dot} />
              </>
            )}
          </Svg>
        )}

        {/* Scrub tooltip — measured so it can be clamped inside the card. */}
        {active && activeValue != null && (
          <View
            pointerEvents="none"
            onLayout={(e) =>
              setTooltipSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
            }
            style={[styles.tooltip, { backgroundColor: tokens.card.hint.background, left: tooltipLeft }]}
          >
            <Text style={[styles.tooltipValue, { color: tokens.card.hint.text }]}>
              {formatValue(activeValue)}
            </Text>
            <Text style={[styles.tooltipMetric, { color: tokens.card.hint.text }]} numberOfLines={1}>
              {unit ?? metric}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

/** Compact number formatting for the tooltip (e.g. 8234 → "8,234"). */
function formatValue(v: number): string {
  return Math.round(v).toLocaleString();
}

/**
 * A smooth (Catmull-Rom → cubic bézier) path through the points, so the line curves through
 * each point with rounded transitions instead of sharp angular joins.
 */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length === 1 ? `M ${pts[0].x} ${pts[0].y}` : '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}


/** Stable, SVG-safe unique suffix for gradient ids (avoids `useId`'s ':' in `url(#…)`). */
function useIdSafe(): string {
  return React.useId().replace(/:/g, '');
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    height: 176,
    borderRadius: layoutTokens.radiusCard,
    padding: layoutTokens.cardPadding,
    gap: layoutTokens.gap,
    overflow: 'hidden',
    shadowColor: '#085041',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  title: {
    flexShrink: 1,
    fontSize: 12,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    letterSpacing: tracking.regular,
  },
  plot: {
    flex: 1,
    width: '100%',
    position: 'relative',
  },
  tooltip: {
    position: 'absolute',
    top: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: layoutTokens.radiusCard,
  },
  tooltipValue: {
    fontSize: 16,
    fontFamily: fontFamily.bold,
    includeFontPadding: false,
    fontWeight: '700',
    letterSpacing: tracking.bold,
  },
  tooltipMetric: {
    fontSize: 11,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    letterSpacing: tracking.regular,
    opacity: 0.8,
  },
  openBadge: {
    width: 24,
    height: 24,
    borderRadius: layoutTokens.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
