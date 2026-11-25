import React, { useId, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Path } from 'react-native-svg';
import ArrowRightIcon from '../../../../theme/icons/arrowright.svg';
import { tracking, fontFamily, getColorTokens, layout as layoutTokens, cardShadow } from '../../../../theme/theme';
import { useDashboardData } from '../../useDashboardData';
import type { DashboardWidgetConfig } from '../../../../types';
import type { NodeProps } from '../../types';

type ArcState = 'bad' | 'neutral' | 'good';

const NUMBER_LINE_HEIGHT = 36;

// Arc band shape exported from Figma ("Ellipse 81"), in its native 303×129 viewBox. It's a
// filled band (not a stroked line), so it's used two ways: drawn faint as the track, and as
// a clip mask for the colored value fill.
const ARC_VIEWBOX_W = 303;
const ARC_VIEWBOX_H = 129;
const ARC_BAND_PATH =
  'M281.949 128.5C294.666 128.5 305.212 118.078 302.528 105.648C297.004 80.0587 282.284 56.2787 260.015 37.6368C231.229 13.5384 192.185 2.57299e-06 151.475 0C110.764 -2.57299e-06 71.7204 13.5383 42.9336 37.6368C20.6648 56.2787 5.94482 80.0587 0.420554 105.648C-2.26283 118.078 8.28313 128.5 20.9995 128.5C33.7158 128.5 43.7154 117.968 47.494 105.826C52.2725 90.4707 61.8635 76.3079 75.4959 64.8957C95.6467 48.0268 122.977 38.55 151.474 38.55C179.972 38.55 207.302 48.0269 227.453 64.8958C241.085 76.3079 250.676 90.4708 255.455 105.826C259.234 117.968 269.233 128.5 281.949 128.5Z';

// The value fill is a pie-wedge swept from the left (180°) by an angle proportional to the
// value, drawn from the arc's center out past its outer edge and clipped to ARC_BAND_PATH.
// A wedge covers the band's full thickness at every angle — including the wider horns — so
// it never leaves an uncovered sliver of track (which a fixed-width centerline stroke did).
const WEDGE_CENTER_X = 151.5;
const WEDGE_CENTER_Y = 128.5;
const WEDGE_RADIUS = 180; // safely beyond the band's outer edge (~153 at the farthest)
const LEAD_CAP_RADIUS = 26; // ~half the band thickness — rounds the fill's leading edge
// Band centerline as an ellipse (rx at the horns, ry at the top). The rounded leading cap is
// placed on this centerline at the leading angle so it tracks the true middle of the band —
// a fixed mid-radius sat too far inward on the sides, leaving the outer band uncovered there
// (the notch).
const CENTERLINE_RX = 129.5;
const CENTERLINE_RY = 109.2;
// Where the value sits vertically inside the arc, in viewBox units — the middle of the open
// bowl (between the band's inner top ≈38 and the baseline ≈128) rather than the bbox center,
// so it reads as centered under the dome.
const NUMBER_CENTER_VB_Y = 86;

/**
 * Low fill → `bad`, mid → `neutral`, high → `good` (thresholds shared with
 * `DataWheelCardNode`'s `stateForPercent`). `reverse` swaps the low/high ends so a high
 * value reads as `bad` and a low value as `good` — configured per card, e.g. for metrics
 * where "less is better".
 */
function arcState(percent: number, reverse: boolean): ArcState {
  const low: ArcState = reverse ? 'good' : 'bad';
  const high: ArcState = reverse ? 'bad' : 'good';
  if (percent < 34) return low;
  if (percent <= 66) return 'neutral';
  return high;
}

/**
 * Arc data card — matches the Figma `RingStats` component set (node 2993:1478): a 180°
 * gauge that fills clockwise from the left in proportion to the value, with the value
 * shown large in the bowl. The arc color is derived from the fill percentage
 * (`arcState`) rather than passed in — red (low) / amber (mid) / green (high) — and
 * `reverse` flips that mapping. Reuses the shared `dataWheel` red/amber/green tokens.
 *
 * Reads its stat via `useDashboardData` (the same resolution `DataWheelCardNode` /
 * `GraphDataNode` use — inline `value`/`values`, a `dataSource` API fetch, or synthesized
 * placeholder data), so `metric` selects which data type to show from a blueprint.
 */
export function ArcDataCardNode({ node, context }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : 'Title';
  const metric = typeof node.metric === 'string' ? node.metric : 'wearable_metric';
  const unit = typeof node.unit === 'string' ? node.unit : undefined;
  const target = typeof node.target === 'number' && node.target > 0 ? node.target : 100;
  const reverse = node.reverse === true;
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
      placeholder: inlineValues && inlineValues.length > 0 ? 'none' : 'random',
    }),
    [metric, title, unit, inlineValues],
  );
  const { series } = useDashboardData(config);
  const resolvedValues = series[0]?.values ?? [];
  const statValue = resolvedValues.length > 0 ? resolvedValues[resolvedValues.length - 1] : 0;

  const percent = Math.max(0, Math.min(100, (statValue / target) * 100));
  const fraction = percent / 100;

  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);
  const arcColor = tokens.dataWheel[arcState(percent, reverse)];

  // The arc SVG scales to its measured box (keeping the Figma band's aspect via the
  // viewBox), so it's only measured for width/height.
  const [box, setBox] = useState({ w: 0, h: 0 });
  // Unique, SVG-safe clip id per instance (React's useId contains ':', invalid in a url(#…)).
  const clipId = `arcClip${useId().replace(/:/g, '')}`;

  // Map the arc's bowl-center (viewBox space) to screen space. `meet` scales the viewBox
  // uniformly to fit the box; `yMax` bottom-aligns it — so the arc top is offset by whatever
  // vertical slack remains. Positioning the value this way keeps it centered in the bowl
  // regardless of the box's aspect ratio.
  const arcScale = Math.min(box.w / ARC_VIEWBOX_W, box.h / ARC_VIEWBOX_H) || 0;
  const arcTop = box.h - ARC_VIEWBOX_H * arcScale;
  const valueCenterY = arcTop + NUMBER_CENTER_VB_Y * arcScale;

  // Value wedge: sweep clockwise from the left (180°) by `fraction` of the 180° arc.
  const endDeg = 180 + fraction * 180;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const wedgePath =
    `M ${WEDGE_CENTER_X} ${WEDGE_CENTER_Y}` +
    ` L ${WEDGE_CENTER_X - WEDGE_RADIUS} ${WEDGE_CENTER_Y}` +
    ` A ${WEDGE_RADIUS} ${WEDGE_RADIUS} 0 0 1` +
    ` ${WEDGE_CENTER_X + WEDGE_RADIUS * Math.cos(toRad(endDeg))} ${WEDGE_CENTER_Y + WEDGE_RADIUS * Math.sin(toRad(endDeg))} Z`;
  // Radius of the centerline ellipse at the leading polar angle, so the cap sits on the true
  // band middle (not too far in on the sides).
  const endRad = toRad(endDeg);
  const centerlineR =
    (CENTERLINE_RX * CENTERLINE_RY) /
    Math.sqrt((CENTERLINE_RY * Math.cos(endRad)) ** 2 + (CENTERLINE_RX * Math.sin(endRad)) ** 2);
  const leadX = WEDGE_CENTER_X + centerlineR * Math.cos(endRad);
  const leadY = WEDGE_CENTER_Y + centerlineR * Math.sin(endRad);

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
        {showOpenButton && openButton}
      </View>

      <View style={styles.arcWrap} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {box.w > 0 && (
          <Svg
            width={box.w}
            height={box.h}
            viewBox={`0 0 ${ARC_VIEWBOX_W} ${ARC_VIEWBOX_H}`}
            preserveAspectRatio="xMidYMax meet"
          >
            <Defs>
              <ClipPath id={clipId}>
                <Path d={ARC_BAND_PATH} />
              </ClipPath>
            </Defs>
            {/* Track: the exact Figma band as a faint tint of the current state color. */}
            <Path d={ARC_BAND_PATH} fill={arcColor} fillOpacity={0.25} />
            {/* Fill: a wedge swept from the left horn, clipped to the exact band shape so it
                fills the band's full thickness (no gaps at the wider horns). The circle rounds
                the leading edge. Skipped at zero so an empty gauge shows only the track. */}
            {fraction > 0 && (
              <G clipPath={`url(#${clipId})`}>
                <Path d={wedgePath} fill={arcColor} />
                <Circle cx={leadX} cy={leadY} r={LEAD_CAP_RADIUS} fill={arcColor} />
              </G>
            )}
          </Svg>
        )}
        <View pointerEvents="none" style={[styles.valueWrap, { top: valueCenterY - NUMBER_LINE_HEIGHT / 2 }]}>
          <Text style={[styles.value, { color: tokens.text.primary }]}>{Math.round(statValue)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    // minHeight so enlarged text grows the card rather than being clipped by `overflow: hidden`
    // (the arc graphic keeps its own size). See fontScaling.ts.
    minHeight: 176,
    borderRadius: layoutTokens.radiusCard,
    padding: layoutTokens.cardPadding,
    gap: 4,
    overflow: 'hidden',
    ...cardShadow,
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
  arcWrap: {
    flex: 1,
    width: '100%',
    position: 'relative',
  },
  valueWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  value: {
    fontSize: 36,
    fontFamily: fontFamily.bold,
    includeFontPadding: false,
    lineHeight: NUMBER_LINE_HEIGHT,
    fontWeight: '700',
    letterSpacing: tracking.bold,
  },
  openBadge: {
    width: 24,
    height: 24,
    borderRadius: layoutTokens.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
