import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';
import ArrowRightIcon from '../../../../theme/icons/arrowright.svg';
import {
  DEFAULT_ACCENT,
  cardShadow,
  getColorTokens,
  layout as layoutTokens,
  sleepStageColors,
  textStyle,
  withAlpha,
  type ThemeMode,
} from '../../../../theme/theme';
import { useDataRange, useRangedNode, type DataRange } from '../../dataRange';
import { RisingText, useRiseStyle } from '../../RisingText';
import { useScrollLock } from '../../ScrollLockContext';
import type { NodeProps } from '../../types';
import { SmallDataCard, isSmall, smallText } from './SmallDataCard';
import { CardInfo, headerIcons } from './CardInfo';
import { openDataDetail } from './DataDetail';
import { CardEmpty, emptyCopy } from './CardEmpty';
import { asleepMinutes, parseStages, type SleepStage, type StagePeriod } from './SleepStagesRing';
import {
  STAGE_LABELS,
  SleepTimeline,
  clockLabel,
  parseClock,
  sleepStageInfoRows,
  smoothStages,
  stageIndexAt,
  stageStarts,
} from './SleepTimeline';
import type { InfoRowSpec } from '../../ModalInfoRow';
import { useStepHaptics } from '../../useStepHaptics';
import {
  PERIOD_LABELS,
  aggregateOf,
  formatDuration,
  formatNumber,
  headlineValue,
  niceTicks,
  pillText,
  pointLabel,
  valueLabel,
  xLabels,
} from './chartAxis';

// As the trend card: a 24pt axis column, a 6pt gap, an 80pt plot and a 12pt label row.
const AXIS_WIDTH = 24;
const AXIS_GAP = 6;
const PLOT_HEIGHT = 80;
/** The figure and chart the empty state stands in for, so the card keeps its height. */
const BODY_HEIGHT = 40 + layoutTokens.gap + PLOT_HEIGHT + 6 + 12;
const PLOT_TOP = 2;
const ENTER_MS = 320;
const ENTER_SHIFT = 6;
/** Bars other than the one being dragged over recede to this. */
const IDLE_BAR_OPACITY = 0.45;

/** The colours a bar or a stacked segment can take, named by role rather than value. The sleep
 * stages' own colours are here too, so a stage looks the same on every sleep chart. */
type BarColor = 'brand' | 'brandSoft' | 'accent' | 'accentSoft' | 'muted' | SleepStage;
const BAR_COLORS: BarColor[] = ['brand', 'brandSoft', 'accent', 'accentSoft', 'muted', 'deep', 'rem', 'light', 'awake'];
/** Stacked segments with no colours given, bottom up: Deep, Light, REM, Awake. */
const DEFAULT_SEGMENT_COLORS: BarColor[] = ['brand', 'brandSoft', 'accent', 'accentSoft'];

interface Segment {
  label: string;
  color: BarColor;
}

/**
 * A measure as bars across the period (Figma 4517:25, 4522:253): sleep by night, phone use by hour,
 * or anything else. A bar is one number, or a list of numbers stacked bottom up and named in
 * `segments` (with a legend).
 *
 * `title`, `unit`, `info`, `summary` and the figures are the blueprint's, and `values`, `value`,
 * `labels`, `highlight` and `reference` can be written per Day / Week / Month to follow the data
 * filter. Without a `value`, the headline is the last bar under Day, else the bars' average (or
 * total, with `aggregate: "total"`). `valueFormat: "duration"` reads the figures as minutes ("7h 20m"). `highlight` picks
 * bars out in the brand; `reference` draws a dashed line (an average, say). `size: "small"` is the
 * 1×1 version (Figma 4664:1127, 4664:1173): the figure and the bars, without axis or legend.
 */
export function BarCardNode(props: NodeProps) {
  return isSmall(props.node) ? <SmallBarCard {...props} /> : <BarCard {...props} />;
}

function SmallBarCard({ node: blueprintNode, context }: NodeProps) {
  const range = useDataRange();
  const node = useRangedNode(blueprintNode);
  const brandColors = context.theme.brandColors;
  const tokens = getColorTokens(context.colorScheme ?? 'light', brandColors);
  const text = tokens.text.primary;
  const colorOf = barColors(
    context.colorScheme ?? 'light',
    text,
    brandColors?.brand ?? tokens.button.background,
    brandColors?.accent ?? DEFAULT_ACCENT,
  );

  const title = typeof node.title === 'string' ? node.title : 'Bars';
  const unit = typeof node.unit === 'string' ? node.unit : '';
  const duration = node.valueFormat === 'duration';
  const aggregate = aggregateOf(node.aggregate, 'average');
  const periodLabel = valueLabel(node.periodLabel, aggregate, range);
  const bars = parseBars(node.values);
  const stacked = bars.some((bar) => bar.length > 1);
  const segments = stacked ? parseSegments(node.segments, Math.max(...bars.map((b) => b.length))) : [];
  const highlight = new Set(
    Array.isArray(node.highlight) ? node.highlight.filter((i): i is number => typeof i === 'number') : [],
  );
  const totals = bars.map((bar) => bar.reduce((sum, v) => sum + v, 0));
  // A night's stages in order (Day only) draw as a timeline rather than one bar, under time asleep.
  const { stages } = nightOf(node, range);
  const empty = bars.length === 0 && stages.length <= 1 ? emptyCopy(node, title, range, { small: true }) : null;
  const value =
    typeof node.value === 'number'
      ? node.value
      : stages.length > 1
        ? asleepMinutes(stages)
        : headlineValue(totals, range, aggregate);
  const format = (v: number) => (duration ? formatDuration(v) : formatNumber(v));
  const [plotHeight, setPlotHeight] = useState(0);
  const enterStyle = useRiseStyle(range);
  const top = Math.max(1, ...totals);
  // Many bars (a day's hours) sit closer, with tighter corners.
  const dense = bars.length > 12;

  return (
    <SmallDataCard
      context={context}
      title={title}
      viewPath={typeof node.viewPath === 'string' && node.viewPath ? node.viewPath : undefined}
      showOpenButton={node.showOpenButton}
      info={typeof node.info === 'string' && node.info ? node.info : undefined}
      infoRows={stageInfo(node, segments)}
      accessibilityLabel={`${title}, ${PERIOD_LABELS[range]}${periodLabel ? `, ${periodLabel}` : ''}: ${empty ? `${empty.headline}. ${empty.message}` : `${value != null ? format(value) : 'no data'}${!duration && unit ? ` ${unit}` : ''}`}`}
      value={
        empty ? (
          <Text style={[smallText.small, { color: text }]}>
            {PERIOD_LABELS[range]}
          </Text>
        ) : value != null && (
          <View style={smallText.valueRow}>
            <RisingText style={[smallText.value, { color: text }]} numberOfLines={1}>
              {format(value)}
            </RisingText>
            {!duration && !!unit && <Text style={[smallText.small, { color: text }]}>{unit}</Text>}
          </View>
        )
      }
    >
      {empty ? (
        <CardEmpty headline={empty.headline} color={text} small />
      ) : (
        <Animated.View
          style={[styles.smallPlot, enterStyle]}
          onLayout={(e) => setPlotHeight(e.nativeEvent.layout.height)}
        >
          {stages.length > 1 ? (
            // Out of flow, so the timeline sized from this view can't push it taller.
            <View style={StyleSheet.absoluteFill}>
              {plotHeight > 0 && (
                <SleepTimeline stages={stages} colors={stageColors(colorOf)} text={text} height={plotHeight} compact />
              )}
            </View>
          ) : (
            plotHeight > 0 && (
              // Out of flow too: bars drawn to this view's measured height would otherwise count
              // towards it, and any rounding grows the card a little on every layout.
              <View style={[StyleSheet.absoluteFill, styles.smallBars, { gap: dense ? 2 : 4 }]}>
                {bars.map((bar, i) => {
                  const height = Math.max(2, (totals[i] / top) * plotHeight);
                  return (
                    <View key={i} style={[styles.smallBar, { height, borderRadius: dense ? 2 : 4 }]}>
                      {stacked ? (
                        bar.map((part, s) => (
                          <View
                            key={s}
                            style={{
                              height: totals[i] > 0 ? (part / totals[i]) * height : 0,
                              backgroundColor: colorOf[segments[s]?.color ?? 'muted'],
                            }}
                          />
                        ))
                      ) : (
                        <View
                          style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: colorOf[highlight.has(i) ? 'brand' : plainBarColor(node.barColor)] },
                          ]}
                        />
                      )}
                    </View>
                  );
                })}
              </View>
            )
          )}
        </Animated.View>
      )}
    </SmallDataCard>
  );
}

/** The night a sleep card draws under Day: the blueprint's own `stages` and `bedtime`. */
function nightOf(node: Record<string, unknown>, range: DataRange) {
  if (range !== 'day') return { stages: [] as StagePeriod[], bedtime: undefined as number | undefined };
  return { stages: parseStages(node.stages), bedtime: parseClock(node.bedtime) };
}

function barColors(mode: ThemeMode, text: string, brand: string, accent: string): Record<BarColor, string> {
  return {
    brand,
    brandSoft: withAlpha(brand, 0.4),
    accent,
    accentSoft: withAlpha(accent, 0.4),
    muted: withAlpha(text, 0.2),
    ...sleepStageColors(mode, brand),
  };
}

function stageColors(colorOf: Record<BarColor, string>): Record<SleepStage, string> {
  return { deep: colorOf.deep, rem: colorOf.rem, light: colorOf.light, awake: colorOf.awake };
}

const STAGE_COLORS: BarColor[] = ['deep', 'rem', 'light', 'awake'];

/** The sleep stages explained under the ⓘ, on a card that shows sleep (a night, or stage-coloured parts). */
function stageInfo(node: Record<string, unknown>, segments: Segment[]): InfoRowSpec[] | undefined {
  const sleep = parseStages(node.stages).length > 0 || segments.some((s) => STAGE_COLORS.includes(s.color));
  return sleep ? sleepStageInfoRows() : undefined;
}

function BarCard({ node: blueprintNode, context }: NodeProps) {
  const range = useDataRange();
  const node = useRangedNode(blueprintNode);

  const mode: ThemeMode = context.colorScheme ?? 'light';
  const brandColors = context.theme.brandColors;
  const tokens = getColorTokens(mode, brandColors);
  const text = tokens.text.primary;
  const muted = withAlpha(text, 0.55);
  const brand = brandColors?.brand ?? tokens.button.background;
  const accent = brandColors?.accent ?? DEFAULT_ACCENT;
  const colorOf = barColors(mode, text, brand, accent);

  const title = typeof node.title === 'string' ? node.title : 'Bars';
  const unit = typeof node.unit === 'string' ? node.unit : '';
  const duration = node.valueFormat === 'duration';
  const aggregate = aggregateOf(node.aggregate, 'average');
  const info = typeof node.info === 'string' && node.info ? node.info : undefined;
  const viewPath = typeof node.viewPath === 'string' && node.viewPath ? node.viewPath : undefined;
  const showOpenButton = node.showOpenButton;
  const { showInfo, showOpen } = headerIcons(info, viewPath, showOpenButton);
  const summary = typeof node.summary === 'string' ? node.summary : '';
  const reference = typeof node.reference === 'number' ? node.reference : undefined;

  const bars = parseBars(node.values);
  const stacked = bars.some((bar) => bar.length > 1);
  const segments = stacked ? parseSegments(node.segments, Math.max(...bars.map((b) => b.length))) : [];
  const highlight = new Set(
    Array.isArray(node.highlight) ? node.highlight.filter((i): i is number => typeof i === 'number') : [],
  );
  const totals = bars.map((bar) => bar.reduce((sum, v) => sum + v, 0));
  const labels = xLabels(range, bars.length, node.labels);
  // A night's stages in order (Day only) draw as a timeline: one stacked bar can't show when each
  // stage happened.
  const { stages, bedtime } = nightOf(node, range);
  const timeline = stages.length > 1;
  const empty = bars.length === 0 && !timeline ? emptyCopy(node, title, range) : null;
  // Dragging moves over the periods as drawn, so what's named is what's lit.
  const drawn = smoothStages(stages);
  const starts = stageStarts(drawn);
  const count = timeline ? drawn.length : bars.length;
  // Bars after the last one with data are periods still to come, so the scrub stops before them.
  const lastFilled = totals.reduce((last, total, i) => (total > 0 ? i : last), -1);
  const lastPickable = timeline ? count - 1 : lastFilled;

  const [plotWidth, setPlotWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const scrubbing = activeIndex != null && activeIndex < count;

  const headline =
    typeof node.value === 'number'
      ? node.value
      : timeline
        ? asleepMinutes(stages)
        : headlineValue(totals, range, aggregate);
  // On the timeline the figure is the stage under the finger's length, named as a unit is, then its times.
  const value = scrubbing ? (timeline ? drawn[activeIndex].minutes : totals[activeIndex]) : headline;
  const scrubStage = scrubbing && timeline ? drawn[activeIndex] : null;
  const pointName = !scrubbing
    ? null
    : scrubStage
      ? bedtime != null
        ? `${clockLabel(bedtime + starts[activeIndex])}–${clockLabel(bedtime + starts[activeIndex] + scrubStage.minutes)}`
        : null
      : pointLabel(range, activeIndex, bars.length, node.labels);
  const format = (v: number) => (duration ? formatDuration(v) : formatNumber(v));

  // From 0, as a bar's height is its size. Durations tick in whole hours or round minutes.
  const top = Math.max(0, ...totals, reference ?? 0);
  const ticks = duration ? durationTicks(top) : niceTicks(0, top, [3, 4]);
  const scaleTop = ticks[ticks.length - 1] || 1;
  const yFor = (v: number) => PLOT_HEIGHT - (v / scaleTop) * (PLOT_HEIGHT - PLOT_TOP);

  // A week's seven bars get room between them; a day's 24 hours sit closer, with tighter corners.
  const gap = bars.length > 12 ? 3 : 8;
  const slot = bars.length > 0 ? plotWidth / bars.length : 0;
  const barWidth = Math.max(2, slot - gap);
  const radius = Math.min(bars.length > 12 ? 3 : 8, barWidth / 2);

  // A new period's bars fade and rise in, as the trend card's line does.
  const reduceMotion = useReducedMotion();
  const enter = useSharedValue(1);
  const lastRange = useRef(range);
  useEffect(() => {
    if (lastRange.current === range) return;
    lastRange.current = range;
    if (reduceMotion) return;
    enter.value = withSequence(
      withTiming(0, { duration: 0 }),
      withTiming(1, { duration: ENTER_MS, easing: Easing.out(Easing.cubic) }),
    );
  }, [range, reduceMotion, enter]);
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * ENTER_SHIFT }],
  }));

  // Dragging picks a bar: the headline and its label follow it; letting go returns to the headline figure.
  const { setLocked } = useScrollLock();
  const tick = useStepHaptics();
  const live = useRef({
    width: 0,
    count: 0,
    lastPickable: -1,
    index: null as number | null,
    setLocked,
    tick,
    indexAt: (fraction: number, n: number) => Math.floor(fraction * n),
  });
  live.current = {
    ...live.current,
    width: plotWidth,
    count,
    lastPickable,
    setLocked,
    tick,
    // Bars share the width evenly; a stage is as wide as it was long.
    indexAt: timeline ? (fraction) => stageIndexAt(drawn, fraction) : (fraction, n) => Math.floor(fraction * n),
  };
  const scrubResponder = useMemo(() => {
    const pick = (x: number) => {
      const { width, count, lastPickable, index, indexAt } = live.current;
      if (width <= 0 || lastPickable < 0) return;
      const next = Math.min(lastPickable, Math.max(0, indexAt(x / width, count)));
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

  return (
    <View style={[styles.card, { backgroundColor: tokens.card.stats.background }, cardShadow]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[styles.small, styles.title, { color: text }]} numberOfLines={1}>
            {title}
          </Text>
          {showInfo && info && <CardInfo
              title={title}
              info={info}
              color={muted}
              context={context}
              rows={stageInfo(node, segments)}
            />}
        </View>
        {showOpen && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${title}`}
            onPress={() => openDataDetail(context, title, viewPath)}
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

      {empty ? (
        <CardEmpty headline={empty.headline} message={empty.message} color={text} minHeight={BODY_HEIGHT} />
      ) : (
        <View style={styles.summary}>
          {value != null && (
            <View style={styles.valueRow}>
              <RisingText style={[styles.value, { color: text }]} still={scrubbing}>
                {format(value)}
              </RisingText>
              {!duration && !!unit && <Text style={[styles.small, { color: text }]}>{unit}</Text>}
              {scrubStage && <Text style={[styles.small, { color: text }]}>{STAGE_LABELS[scrubStage.stage]}</Text>}
              {/* A dragged-over bar's label sits beside the figure, so nothing above it moves. */}
              {pointName && (
                <Text style={[styles.small, { color: muted }]}>· {pointName}</Text>
              )}
            </View>
          )}
        </View>
      )}
      {!!summary && !empty && (
        <Text style={[styles.small, { color: text }]}>{pillText(summary)}</Text>
      )}

      {empty ? null : timeline ? (
        <Animated.View
          style={enterStyle}
          accessible
          accessibilityLabel={`${title} through the night: ${stages
            .map((s) => `${STAGE_LABELS[s.stage]} ${formatDuration(s.minutes)}`)
            .join(', ')}`}
        >
          <SleepTimeline
            stages={stages}
            colors={stageColors(colorOf)}
            text={text}
            height={PLOT_HEIGHT}
            start={bedtime}
            activeIndex={scrubbing ? activeIndex : null}
            idleOpacity={IDLE_BAR_OPACITY}
            onPlotWidth={setPlotWidth}
            panHandlers={scrubResponder.panHandlers}
          />
        </Animated.View>
      ) : bars.length > 0 && (
        <View
          style={styles.chart}
          accessible
          accessibilityLabel={`${title} chart: ${totals.map(format).join(', ')}${!duration && unit ? ` ${unit}` : ''}`}
        >
          <View style={styles.axis}>
            {[...ticks].reverse().map((t) => (
              <Text key={t} style={[styles.tick, { color: muted, top: yFor(t) - 6 }]}>
                {duration ? formatDurationTick(t, scaleTop) : formatNumber(t)}
              </Text>
            ))}
          </View>

          <Animated.View style={[styles.plotColumn, enterStyle]}>
            <View
              style={styles.plot}
              // The plot, not a bar under the finger, takes the touch, so `locationX` is across the plot.
              pointerEvents="box-only"
              onLayout={(e) => setPlotWidth(e.nativeEvent.layout.width)}
              {...scrubResponder.panHandlers}
            >
              {ticks.map((t, i) => (
                <View
                  key={t}
                  style={[
                    styles.grid,
                    { top: yFor(t), backgroundColor: withAlpha(text, i === 0 ? 0.16 : 0.07) },
                  ]}
                />
              ))}

              {plotWidth > 0 &&
                bars.map((bar, i) => {
                  const height = PLOT_HEIGHT - yFor(totals[i]);
                  const dimmed = scrubbing && i !== activeIndex;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.bar,
                        {
                          left: i * slot + gap / 2,
                          width: barWidth,
                          height,
                          borderRadius: radius,
                          opacity: dimmed ? IDLE_BAR_OPACITY : 1,
                        },
                      ]}
                    >
                      {stacked ? (
                        // Bottom up, each segment its share of the bar.
                        bar.map((part, s) => (
                          <View
                            key={s}
                            style={{
                              height: totals[i] > 0 ? (part / totals[i]) * height : 0,
                              backgroundColor: colorOf[segments[s]?.color ?? 'muted'],
                            }}
                          />
                        ))
                      ) : (
                        <View
                          style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: colorOf[highlight.has(i) ? 'brand' : plainBarColor(node.barColor)] },
                          ]}
                        />
                      )}
                    </View>
                  );
                })}

              {plotWidth > 0 && reference != null && (
                <Svg width={plotWidth} height={PLOT_HEIGHT} style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Line
                    x1={0}
                    y1={yFor(reference)}
                    x2={plotWidth}
                    y2={yFor(reference)}
                    stroke={withAlpha(text, 0.6)}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                </Svg>
              )}
            </View>

            <View style={styles.labels}>
              {labels.map((label, i) => (
                <Text
                  key={i}
                  style={[
                    styles.label,
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

      {/* The timeline names its rows, so it needs no legend. */}
      {segments.length > 0 && !timeline && !empty && (
        <View style={styles.legend}>
          {segments.map((segment) => (
            <View key={segment.label} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: colorOf[segment.color] }]} />
              <Text style={[styles.legendLabel, { color: withAlpha(text, 0.6) }]}>{segment.label}</Text>
            </View>
          ))}
        </View>
      )}

    </View>
  );
}

/** A single-value bar's colour: `barColor` if the blueprint names one, else the brand. */
function plainBarColor(raw: unknown): BarColor {
  return BAR_COLORS.includes(raw as BarColor) ? (raw as BarColor) : 'brand';
}

/** Each bar as its parts, bottom up: a plain number is a bar of one. */
function parseBars(raw: unknown): number[][] {
  if (!Array.isArray(raw)) return [];
  return raw.map((bar) =>
    Array.isArray(bar)
      ? bar.filter((v): v is number => typeof v === 'number' && v >= 0)
      : typeof bar === 'number' && bar >= 0
        ? [bar]
        : [0],
  );
}

/** The stacked segments' names and colours; any left unnamed fall back to the default order. */
function parseSegments(raw: unknown, count: number): Segment[] {
  const given = Array.isArray(raw) ? raw : [];
  return Array.from({ length: count }, (_, i) => {
    const entry = given[i] as { label?: unknown; color?: unknown } | string | undefined;
    const label =
      typeof entry === 'string' ? entry : typeof entry?.label === 'string' ? entry.label : `Part ${i + 1}`;
    const color =
      typeof entry === 'object' && BAR_COLORS.includes(entry?.color as BarColor)
        ? (entry.color as BarColor)
        : DEFAULT_SEGMENT_COLORS[i % DEFAULT_SEGMENT_COLORS.length];
    return { label, color };
  });
}

/** Ticks for minutes: whole hours past two hours (0, 3, 6, 9 h), round minutes below (0, 15, 30). */
function durationTicks(topMinutes: number): number[] {
  if (topMinutes >= 120) {
    const hours = topMinutes / 60;
    const step = Math.max(1, Math.ceil(hours / 3));
    return [0, 1, 2, 3].map((i) => i * step * 60);
  }
  for (const step of [5, 10, 15, 20, 30]) {
    if (step * 2 >= topMinutes) return [0, step, step * 2];
    if (step * 3 >= topMinutes) return [0, step, step * 2, step * 3];
  }
  return [0, 30, 60, 90];
}

function formatDurationTick(minutes: number, top: number): string {
  if (top >= 120) return `${minutes / 60}h`;
  return minutes === 0 ? '0' : `${minutes}m`;
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
  bar: {
    position: 'absolute',
    bottom: 0,
    overflow: 'hidden',
    flexDirection: 'column-reverse',
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
  smallPlot: {
    flex: 1,
    minHeight: 32,
  },
  smallBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  smallBar: {
    flex: 1,
    overflow: 'hidden',
    flexDirection: 'column-reverse',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  legendLabel: textStyle(10, 12, 'regular'),
});
