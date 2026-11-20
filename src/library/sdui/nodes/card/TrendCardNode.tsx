import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Line, Path, Rect } from 'react-native-svg';
import ArrowRightIcon from '../../../../theme/icons/arrowright.svg';
import InfoIcon from '../../../../theme/icons/infofilled.svg';
import {
  DEFAULT_ACCENT,
  cardShadow,
  ensureContrast,
  getColorTokens,
  layout as layoutTokens,
  textStyle,
  withAlpha,
  type ThemeMode,
} from '../../../../theme/theme';
import { useDataRange, useRangedNode } from '../../dataRange';
import { ModalShell } from '../../ModalShell';
import { PillButton } from '../../PillButton';
import { useScrollLock } from '../../ScrollLockContext';
import { RisingText, useRiseStyle } from '../../RisingText';
import { useStepHaptics } from '../../useStepHaptics';
import type { NodeProps } from '../../types';
import { SmallDataCard, isSmall, smallText } from './SmallDataCard';
import { PERIOD_LABELS, formatNumber, niceTicks, pillText, pointLabel, smoothPath, xLabels } from './chartAxis';

// Figma 4517:75's chart: a 24pt axis column, 6pt gap, an 80pt plot and a 12pt label row.
const AXIS_WIDTH = 24;
const AXIS_GAP = 6;
const PLOT_HEIGHT = 80;
/** Where the top and bottom gridlines sit inside the plot. */
const PLOT_TOP = 5;
const PLOT_BOTTOM = 79;
/** Room left above and below the data on the y-axis, in the measure's own unit. */
const DEFAULT_AXIS_PADDING = 10;
const DOT_RADIUS = 4.5;
/** The dot while it is being dragged, so the point under the finger stands out. */
const DOT_RADIUS_ACTIVE = 7;
const DOT_SPRING = { damping: 14, stiffness: 260, mass: 0.6 } as const;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const PLOT_ENTER_MS = 320;
const PLOT_ENTER_SHIFT = 6;
/** Spacing of the usual-range hatching, along the stripes' normal. */
const HATCH_GAP = 8;
/** The small card's hollow end-of-line dot. */
const SPARK_DOT_RADIUS = 4;

/**
 * A reading and its recent trend (Figma 4570:1017): the latest value, a line across the period, and
 * the participant's usual range as a band behind it.
 *
 * Not tied to heart rate: `title`, `unit`, the figures and the copy are the blueprint's. `values` (the
 * line), `value` (the headline; defaults to the last point), `labels` and `usualRange` ([low, high])
 * can be written per Day / Week / Month to follow the data filter. `info` adds an ⓘ that explains the
 * measure; `summary` replaces the usual-range sentence. `size: "small"` is the 1×1 version (Figma
 * 4664:1110): the reading and a bare line.
 */
export function TrendCardNode(props: NodeProps) {
  return isSmall(props.node) ? <SmallTrendCard {...props} /> : <TrendCard {...props} />;
}

function SmallTrendCard({ node: blueprintNode, context }: NodeProps) {
  const node = useRangedNode(blueprintNode);
  const range = useDataRange();
  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);
  const text = tokens.text.primary;
  const line = context.theme.brandColors?.brand ?? tokens.button.background;

  const title = typeof node.title === 'string' ? node.title : 'Trend';
  const unit = typeof node.unit === 'string' ? node.unit : '';
  const periodLabel = typeof node.periodLabel === 'string' ? node.periodLabel : PERIOD_LABELS[range];
  const values = Array.isArray(node.values)
    ? (node.values as unknown[]).filter((v): v is number => typeof v === 'number')
    : [];
  const latest = typeof node.value === 'number' ? node.value : values[values.length - 1];

  const [size, setSize] = useState({ width: 0, height: 0 });
  const enterStyle = useRiseStyle(range);

  // Spans the plot top to bottom, inset so the end dot isn't clipped.
  const inset = SPARK_DOT_RADIUS + 1;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const points = values.map((v, i) => ({
    x: inset + (i / Math.max(1, values.length - 1)) * (size.width - inset * 2),
    y: hi === lo ? size.height / 2 : inset + ((hi - v) / (hi - lo)) * (size.height - inset * 2),
  }));
  const last = points[points.length - 1];

  return (
    <SmallDataCard
      context={context}
      title={title}
      periodLabel={periodLabel}
      viewPath={typeof node.viewPath === 'string' && node.viewPath ? node.viewPath : undefined}
      showOpenButton={node.showOpenButton !== false}
      accessibilityLabel={`${title}, ${periodLabel}: ${latest != null ? formatNumber(latest) : 'no reading'}${unit ? ` ${unit}` : ''}`}
      value={
        latest != null && (
          <View style={smallText.valueRow}>
            <RisingText style={[smallText.value, { color: text }]} numberOfLines={1}>
              {formatNumber(latest)}
            </RisingText>
            {!!unit && <Text style={[smallText.small, { color: text }]}>{unit}</Text>}
          </View>
        )
      }
    >
      <Animated.View
        style={[styles.spark, enterStyle]}
        onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        {values.length > 1 && size.width > 0 && (
          <Svg width={size.width} height={size.height}>
            <Path
              d={smoothPath(points)}
              stroke={line}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <Circle
              cx={last.x}
              cy={last.y}
              r={SPARK_DOT_RADIUS}
              fill={tokens.card.stats.background}
              stroke={line}
              strokeWidth={2}
            />
          </Svg>
        )}
      </Animated.View>
    </SmallDataCard>
  );
}

function TrendCard({ node: blueprintNode, context }: NodeProps) {
  const node = useRangedNode(blueprintNode);
  const range = useDataRange();

  const mode: ThemeMode = context.colorScheme ?? 'light';
  const brandColors = context.theme.brandColors;
  const tokens = getColorTokens(mode, brandColors);
  const text = tokens.text.primary;
  const muted = withAlpha(text, 0.55);
  const line = brandColors?.brand ?? tokens.button.background;
  // The usual range: diagonal accent hatching over a faint wash of it, so the band reads as an area
  // behind the line without competing with it.
  const accent = brandColors?.accent ?? DEFAULT_ACCENT;
  const bandWash = withAlpha(accent, 0.12);
  // The accent deepened until it shows on the card: the default sky is only 1.86:1 on white.
  const bandHatch = ensureContrast(accent, tokens.card.stats.background, 2.2);
  const clipId = `usualBand${useId().replace(/:/g, '')}`;
  const surface = tokens.card.stats.background;

  const title = typeof node.title === 'string' ? node.title : 'Trend';
  const unit = typeof node.unit === 'string' ? node.unit : '';
  const periodLabel = typeof node.periodLabel === 'string' ? node.periodLabel : PERIOD_LABELS[range];
  const info = typeof node.info === 'string' && node.info ? node.info : undefined;
  const viewPath = typeof node.viewPath === 'string' && node.viewPath ? node.viewPath : undefined;
  const showOpenButton = node.showOpenButton !== false;

  const values = Array.isArray(node.values)
    ? (node.values as unknown[]).filter((v): v is number => typeof v === 'number')
    : [];
  const latest = typeof node.value === 'number' ? node.value : values[values.length - 1];
  const usual = usualRangeOf(node.usualRange);
  const labels = xLabels(range, values.length, node.labels);

  const [plotWidth, setPlotWidth] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);

  // Dragging across the plot picks a point: the headline, its label and the sentence follow it, and
  // letting go returns them to the latest reading.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const scrubbing = activeIndex != null && activeIndex < values.length;
  const value = scrubbing ? values[activeIndex] : latest;
  const headlineLabel = scrubbing ? pointLabel(range, activeIndex, values.length, node.labels) : periodLabel;
  const summary =
    typeof node.summary === 'string'
      ? node.summary
      : usual && value != null
        ? usualSentence(value, usual, unit)
        : '';

  // Grows while dragging and settles back on release.
  const dotRadius = useSharedValue(DOT_RADIUS);
  useEffect(() => {
    dotRadius.value = withSpring(scrubbing ? DOT_RADIUS_ACTIVE : DOT_RADIUS, DOT_SPRING);
  }, [scrubbing, dotRadius]);
  const dotProps = useAnimatedProps(() => ({ r: dotRadius.value }));

  // A new period's line can't morph from the last (7 points to 4), so it fades and rises in instead.
  const reduceMotion = useReducedMotion();
  const enter = useSharedValue(1);
  const lastRange = useRef(range);
  useEffect(() => {
    if (lastRange.current === range) return;
    lastRange.current = range;
    if (reduceMotion) return;
    enter.value = withSequence(
      withTiming(0, { duration: 0 }),
      withTiming(1, { duration: PLOT_ENTER_MS, easing: Easing.out(Easing.cubic) }),
    );
  }, [range, reduceMotion, enter]);
  const plotEnter = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * PLOT_ENTER_SHIFT }],
  }));

  const { setLocked } = useScrollLock();
  const tick = useStepHaptics();
  // The responder is made once, so it reads the live layout and callbacks through a ref.
  const live = useRef({ width: 0, count: 0, index: null as number | null, setLocked, tick });
  live.current = { ...live.current, width: plotWidth, count: values.length, setLocked, tick };
  const scrubResponder = useMemo(() => {
    const pick = (x: number) => {
      const { width, count, index } = live.current;
      if (width <= 0 || count < 2) return;
      // Each point owns the column it sits in the middle of.
      const next = Math.min(count - 1, Math.max(0, Math.floor((x / width) * count)));
      if (next === index) return;
      live.current.index = next;
      live.current.tick();
      setActiveIndex(next);
    };
    const release = () => {
      live.current.setLocked(false);
      live.current.index = null;
      setActiveIndex(null);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Holds the gesture so the page doesn't take it over as a scroll.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        live.current.setLocked(true);
        pick(e.nativeEvent.locationX);
      },
      onPanResponderMove: (e) => pick(e.nativeEvent.locationX),
      onPanResponderRelease: release,
      onPanResponderTerminate: release,
    });
  }, []);

  // The axis spans the line and the band, so the band is never cut off.
  // `axisPadding` (10 by default) above the highest point and below the lowest, never below 0: these
  // are measurements, so a negative axis would show values that can't happen.
  const axisPadding =
    typeof node.axisPadding === 'number' && node.axisPadding >= 0 ? node.axisPadding : DEFAULT_AXIS_PADDING;
  const ticks = niceTicks(
    Math.max(0, Math.min(...values, ...(usual ?? [])) - axisPadding),
    Math.max(...values, ...(usual ?? [])) + axisPadding,
  );
  const yFor = (v: number) => {
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    return PLOT_BOTTOM - ((v - lo) / (hi - lo || 1)) * (PLOT_BOTTOM - PLOT_TOP);
  };
  // Each point sits over the centre of its label, so the line and the days line up.
  const xFor = (i: number) => ((i + 0.5) * plotWidth) / Math.max(1, values.length);
  const points = values.map((v, i) => ({ x: xFor(i), y: yFor(v) }));
  // The dot marks the latest reading, or the point being dragged over.
  const marked = points[scrubbing ? activeIndex : points.length - 1];

  return (
    <View style={[styles.card, { backgroundColor: surface }, cardShadow]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[styles.small, styles.title, { color: text }]} numberOfLines={1}>
            {title}
          </Text>
          {info && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`About ${title}`}
              onPress={() => setInfoOpen(true)}
              hitSlop={10}
            >
              <InfoIcon width={18} height={18} color={muted} />
            </Pressable>
          )}
        </View>
        {showOpenButton && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${title}`}
            disabled={!viewPath}
            onPress={() => viewPath && context.dispatch({ type: 'OpenCustomView', viewUrl: viewPath })}
            hitSlop={8}
            style={({ pressed }) => [
              styles.open,
              { backgroundColor: tokens.card.stats.openBadge },
              pressed && styles.pressed,
            ]}
          >
            <ArrowRightIcon width={13} height={12} color={tokens.card.stats.openIcon} />
          </Pressable>
        )}
      </View>

      <View style={styles.summary}>
        <Text style={[styles.small, { color: text }]}>{headlineLabel}</Text>
        {value != null && (
          <View style={styles.valueRow}>
            {/* A new period's reading rises into place; a dragged-over point shows at once, keeping up
                with the finger. */}
            <RisingText style={[styles.value, { color: text }]} still={scrubbing}>
              {formatNumber(value)}
            </RisingText>
            {!!unit && <Text style={[styles.small, { color: text }]}>{unit}</Text>}
          </View>
        )}
      </View>
      {!!summary && (
        <View style={[styles.pill, { backgroundColor: tokens.card.stats.openBadge }]}>
          <Text style={[styles.small, { color: text }]}>{pillText(summary)}</Text>
        </View>
      )}

      {values.length > 1 && (
        <View
          style={styles.chart}
          accessible
          accessibilityLabel={`${title} chart: ${values.map(formatNumber).join(', ')}${unit ? ` ${unit}` : ''}`}
        >
          {/* Ticks, top to bottom, each centred on its gridline. */}
          <View style={styles.axis}>
            {[...ticks].reverse().map((tick) => (
              <Text key={tick} style={[styles.tick, { color: muted, top: yFor(tick) - 6 }]}>
                {formatNumber(tick)}
              </Text>
            ))}
          </View>

          <Animated.View style={[styles.plotColumn, plotEnter]}>
            <View
              style={styles.plot}
              onLayout={(e) => setPlotWidth(e.nativeEvent.layout.width)}
              {...scrubResponder.panHandlers}
            >
              {ticks.map((tick, i) => (
                <View
                  key={tick}
                  style={[
                    styles.grid,
                    // The bottom line is the baseline, a touch stronger than the rest.
                    { top: yFor(tick), backgroundColor: withAlpha(text, i === 0 ? 0.16 : 0.07) },
                  ]}
                />
              ))}
              {plotWidth > 0 && (
                <Svg width={plotWidth} height={PLOT_HEIGHT} style={StyleSheet.absoluteFill}>
                  {usual && (
                    <>
                      {/* Drawn as clipped lines rather than an SVG pattern, which renders unreliably. */}
                      <Defs>
                        <ClipPath id={clipId}>
                          <Rect
                            x={0}
                            y={yFor(usual[1])}
                            width={plotWidth}
                            height={yFor(usual[0]) - yFor(usual[1])}
                            rx={6}
                          />
                        </ClipPath>
                      </Defs>
                      <Rect
                        x={0}
                        y={yFor(usual[1])}
                        width={plotWidth}
                        height={yFor(usual[0]) - yFor(usual[1])}
                        rx={6}
                        fill={bandWash}
                      />
                      <Path
                        d={hatchPath(plotWidth, PLOT_HEIGHT)}
                        stroke={bandHatch}
                        strokeOpacity={0.6}
                        strokeWidth={1.75}
                        clipPath={`url(#${clipId})`}
                      />
                    </>
                  )}
                  <Path
                    d={smoothPath(points)}
                    stroke={line}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  {scrubbing && marked && (
                    <Line
                      x1={marked.x}
                      y1={0}
                      x2={marked.x}
                      y2={PLOT_HEIGHT}
                      stroke={withAlpha(text, 0.25)}
                      strokeWidth={1}
                    />
                  )}
                  {marked && (
                    <AnimatedCircle
                      cx={marked.x}
                      cy={marked.y}
                      animatedProps={dotProps}
                      fill={line}
                      stroke={surface}
                      strokeWidth={2}
                    />
                  )}
                </Svg>
              )}
            </View>
            <View style={styles.labels}>
              {labels.map((label, i) => (
                <Text
                  key={i}
                  style={[
                    styles.label,
                    // The marked point's label stands out: today's, or the one being dragged over.
                    i === (scrubbing ? activeIndex : labels.length - 1)
                      ? [styles.labelNow, { color: text }]
                      : { color: muted },
                  ]}
                >
                  {label}
                </Text>
              ))}
            </View>
          </Animated.View>
        </View>
      )}

      {info && (
        <ModalShell visible={infoOpen} onClose={() => setInfoOpen(false)} brandColors={brandColors}>
          <Text style={[styles.infoTitle, { color: line }]}>{title}</Text>
          <Text style={[styles.infoBody, { color: withAlpha(text, 0.8) }]}>{info}</Text>
          <View style={styles.infoAction}>
            <PillButton label="Done" variant="primary" onPress={() => setInfoOpen(false)} brandColors={brandColors} />
          </View>
        </ModalShell>
      )}
    </View>
  );
}

function usualRangeOf(raw: unknown): [number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const [a, b] = raw;
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  return a <= b ? [a, b] : [b, a];
}

/** Describes where the reading sits against the participant's own range, without judging it. */
function usualSentence(value: number, [low, high]: [number, number], unit: string): string {
  const span = `${formatNumber(low)}–${formatNumber(high)}${unit ? ` ${unit}` : ''}`;
  if (value < low) return `Below your usual range, ${span}`;
  if (value > high) return `Above your usual range, ${span}`;
  return `Within your usual range, ${span}`;
}

/** 45° stripes `HATCH_GAP` apart across a `width` × `height` box, as one path to clip to the band. */
function hatchPath(width: number, height: number): string {
  const segments: string[] = [];
  for (let x = -height; x < width; x += HATCH_GAP) {
    segments.push(`M ${x} ${height} L ${x + height} 0`);
  }
  return segments.join(' ');
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    gap: layoutTokens.gap,
    padding: layoutTokens.cardPadding,
    borderRadius: layoutTokens.radiusCard,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 28,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    flexShrink: 1,
  },
  open: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
  summary: {
    gap: 4,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  value: { ...textStyle(36, 40, 'bold'), fontWeight: '700' },
  small: textStyle(12, 16, 'regular'),
  /** A neutral chip for the card's one-line summary, sized to its text. */
  pill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  chart: {
    flexDirection: 'row',
    gap: AXIS_GAP,
  },
  axis: {
    width: AXIS_WIDTH,
    height: PLOT_HEIGHT,
  },
  tick: {
    ...textStyle(10, 12, 'regular'),
    position: 'absolute',
    right: 0,
    textAlign: 'right',
  },
  plotColumn: {
    flex: 1,
    gap: 6,
  },
  plot: {
    height: PLOT_HEIGHT,
  },
  grid: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
  },
  labels: {
    flexDirection: 'row',
  },
  label: {
    ...textStyle(10, 12, 'regular'),
    flex: 1,
    textAlign: 'center',
  },
  labelNow: { ...textStyle(10, 12, 'bold'), fontWeight: '700' },
  spark: {
    flex: 1,
    minHeight: 32,
  },
  infoTitle: { ...textStyle(22, 28, 'bold'), fontWeight: '700', textAlign: 'center' },
  infoBody: { ...textStyle(15, 22, 'regular'), textAlign: 'center' },
  infoAction: {
    width: '100%',
    marginTop: layoutTokens.gap,
  },
});
