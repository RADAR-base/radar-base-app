import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Line, Path } from 'react-native-svg';

import type { QuestionRange, SelectChoice } from '../../../../types';
import { questionScale } from './questionScale';
import { useStepHaptics } from '../../useStepHaptics';
import { DragHint } from './DragHint';
import SliderHandleIcon from '../../../../theme/icons/sliderhandle.svg';
import { fontFamily, tracking, readableTextColor, withAlpha } from '../../../../theme/theme';

interface ArcSliderInputProps {
  range?: QuestionRange;
  /** The scale's own steps, when the definition names them — their labels caption the ends. */
  choices?: SelectChoice[];
  value: number | undefined;
  onChange: (value: number) => void;
  primaryColor: string;
  textColor: string;
  /** Manifest accent — the arc and the handle. Falls back to `primaryColor`. */
  accentColor?: string;
  /**
   * The page's own background, so the step marks can be cut out of the track rather than painted on
   * it. Resolved by the host from the theme and its brand colours; falls back to white.
   */
  backgroundColor?: string;
}

/** Figma 3595:4165. Thickness of the arc, matching the straight slider's track. */
const ARC_STROKE = 24;

/**
 * How far round the arc sweeps, in degrees, centred on the top.
 *
 * Past 180 the ends curl back under themselves, which buys travel without buying width — the scale
 * gets longer while the control stays the same size across. Keep it under ~300: beyond that the ends
 * approach each other and which one a touch belongs to stops being obvious.
 */
const ARC_SWEEP = 240;
/** The arc runs from `ARC_START` down to `ARC_END`, measured anticlockwise from the right. */
const ARC_START = 90 + ARC_SWEEP / 2;
const ARC_END = 90 - ARC_SWEEP / 2;
const DEG = Math.PI / 180;

/** The handle, at rest and while held — the same as the straight slider's. */
const HANDLE_SIZE = 36;
const HANDLE_SIZE_PRESSED = 60;
const HANDLE_RING = 4;
const HANDLE_RING_ALPHA = 0.2;

/**
 * Step marks on the arc, drawn radially across its thickness. Hairline-thin to match the straight
 * slider's, so the two read as the same control bent into a different shape.
 */
const TICK_LENGTH = 12;
const TICK_WIDTH = 3;

/** Arc tint at rest (the accent, mostly transparent) and while held (a neutral grey). */
const TRACK_ALPHA = 0.25;
const TRACK_PRESSED = 'rgba(202, 203, 212, 0.5)';

/** Used when the host names no background. Most pages are light, so white is the safer guess. */
const TICK_FALLBACK = '#FFFFFF';

/** How long the handle takes to grow or settle back. */
const PRESS_MS = 120;

/** The kick the value gives as it turns over. */
const VALUE_POP = 1.22;
const VALUE_POP_MS = 90;
/**
 * How the value falls back after the kick.
 *
 * A spring rather than a second timing: it overshoots slightly and settles, which is what makes the
 * number feel struck rather than merely resized. Lightly damped, but quick — it has to be done before
 * the next step turns over, and a drag can cross several in a second.
 */
const VALUE_SETTLE = { damping: 9, stiffness: 260, mass: 0.5 } as const;

/**
 * How far into the next step the handle must travel before the readout follows it, as a fraction of
 * the gap between steps. Above a half, so the number doesn't flip the instant you pass the midpoint.
 */
const STEP_HYSTERESIS = 0.7;

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * The straight slider bent through 180° (Figma 3595:4165) — the same control, arced.
 *
 * Everything but the geometry is shared with `SliderInput`: the same accent track and fill, the same
 * handle and its ring, the same hysteresis while dragging and snap on release. The value sits in the
 * bowl of the arc, where an arc puts a large empty space anyway, and the ends are named beneath.
 *
 * Worth it over the straight one where the scale is the whole question: the arc reaches both ends
 * within a thumb's sweep rather than the width of the screen, and the value sits in the middle of
 * that sweep rather than at the top of the page.
 */
export function ArcSliderInput({
  range,
  choices,
  value,
  onChange,
  primaryColor,
  textColor,
  accentColor,
  backgroundColor,
}: ArcSliderInputProps) {
  const accent = accentColor ?? primaryColor;

  /** A tick per step crossed, however the value was moved. */
  const tick = useStepHaptics();

  // `range` when the definition bounds the scale, its choices when they enumerate it — see
  // `questionScale` for why the definitions need both readings.
  const scale = useMemo(() => questionScale(range, choices), [range, choices]);
  const values = scale.values;
  const steps = values.length;

  const [index, setIndex] = useState(() => {
    if (value == null) return 0;
    const found = values.indexOf(value);
    return found >= 0 ? found : 0;
  });
  const [pressed, setPressed] = useState(false);
  /** Whether the participant has dragged yet — the hint retires once they have. */
  const [dragged, setDragged] = useState(false);
  const [width, setWidth] = useState(0);

  /** How far round the arc the handle is, 0 at the left end and 1 at the right. */
  const progress = useSharedValue(0);
  const press = useSharedValue(0);

  /**
   * The arc's geometry, from the measured width.
   *
   * Inset by half the handle at its largest: the handle rides *on* the arc, so without that margin
   * its outer half would fall outside the box and be clipped.
   */
  const geometry = useMemo(() => {
    const inset = HANDLE_SIZE_PRESSED / 2;
    const radius = Math.max(0, width / 2 - inset);
    // How far the ends hang below the centre. Zero at 180°, growing as the sweep curls under.
    const drop = ARC_SWEEP > 180 ? radius * Math.sin((ARC_SWEEP / 2 - 90) * DEG) : 0;
    return {
      radius,
      cx: width / 2,
      cy: inset + radius,
      /** The arc's own height, plus the handle hanging past it at top and bottom. */
      height: inset * 2 + radius + drop,
      length: radius * ARC_SWEEP * DEG,
    };
  }, [width]);

  const indexRef = useRef(index);
  indexRef.current = index;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const valuesRef = useRef(values);
  valuesRef.current = values;

  /** Put the handle on a step, animating unless we're placing it for the first time. */
  const settle = (nextIndex: number, animate: boolean) => {
    const t = stepsRef.current > 1 ? nextIndex / (stepsRef.current - 1) : 0;
    progress.value = animate ? withTiming(t, { duration: PRESS_MS }) : t;
  };
  /** True between grabbing the handle and letting go. */
  const dragging = useRef(false);
  /**
   * Put the handle where the value says, when the value changed from outside a drag — arriving on the
   * question, or an answer restored from before.
   *
   * Skipped while dragging. The readout ticks over as the handle passes each step, and settling on
   * that would drag the handle back to the step instead of leaving it under the finger — the value
   * follows the handle during a drag, never the other way round.
   */
  const settledFor = useRef('');
  /**
   * Placed in an effect, never during render.
   *
   * Writing a shared value while rendering is unsupported. React may render a component more than once
   * for a single commit, and during a page slide `StepSlider` has two panels mounted and rendering
   * together — so the handle was written several times per frame from the JS thread while the UI thread
   * was mid-animation. That is the distortion and flicker every slider showed on a question change. An
   * effect runs once per commit, after render, which is the only safe place for it.
   *
   * Still skipped while dragging: the value follows the handle then, never the other way round.
   */
  const settleKey = `${index}:${steps}`;
  useEffect(() => {
    if (settledFor.current === settleKey) return;
    settledFor.current = settleKey;
    if (!dragging.current) settle(index, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settleKey]);

  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;

  /**
   * Turn a touch into a position on the arc.
   *
   * The angle from the arc's centre is what matters, not the distance — dragging inside or outside
   * the band still reads as "this far round", which is what a thumb sweeping an arc actually does.
   */
  function setFromTouch(x: number, y: number) {
    const { cx, cy } = geometryRef.current;
    if (geometryRef.current.radius <= 0) return;
    // Degrees anticlockwise from the right, the same frame the arc is defined in. `atan2` returns
    // (-180, 180], so anything below the right-hand end is lifted a turn to keep the arc contiguous.
    let deg = Math.atan2(cy - y, x - cx) / DEG;
    if (deg < ARC_END) deg += 360;
    const raw = (ARC_START - deg) / ARC_SWEEP;
    // Off the ends entirely — in the gap beneath the arc. Hold whichever end the finger is nearest
    // rather than letting it wrap round to the other one.
    const t = raw < 0 || raw > 1 ? (x < cx ? 0 : 1) : raw;
    progress.value = t;

    const total = stepsRef.current;
    const exact = t * (total - 1);
    const from = indexRef.current;
    const delta = exact - from;
    let next = from;
    if (Math.abs(delta) >= 1) {
      next = Math.round(exact);
    } else if (delta > STEP_HYSTERESIS) {
      next = from + 1;
    } else if (delta < -STEP_HYSTERESIS) {
      next = from - 1;
    }
    next = Math.min(total - 1, Math.max(0, next));
    if (next !== from) {
      indexRef.current = next;
      setIndex(next);
      tick();
    }
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Claimed at the capture phase, before the enclosing ScrollView can take it. Dragging the arc
        // means moving vertically, which a ScrollView reads as a scroll and steals — so the page slid
        // away under the finger instead of the handle moving. Refusing termination keeps it: once the
        // drag is ours it stays ours until the finger lifts.
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: e => {
          dragging.current = true;
          setPressed(true);
          setDragged(true);
          press.value = withTiming(1, { duration: PRESS_MS });
          setFromTouch(e.nativeEvent.locationX, e.nativeEvent.locationY);
        },
        onPanResponderMove: e => {
          setFromTouch(e.nativeEvent.locationX, e.nativeEvent.locationY);
        },
        onPanResponderRelease: () => {
          dragging.current = false;
          setPressed(false);
          press.value = withTiming(0, { duration: PRESS_MS });
          // Resolve to the nearest step, not to whatever the readout settled on under hysteresis.
          const total = stepsRef.current;
          const exact = progress.value * (total - 1);
          const final = Math.min(total - 1, Math.max(0, Math.round(exact)));
          if (final !== indexRef.current) {
            indexRef.current = final;
            setIndex(final);
            tick();
          }
          // Claim the key too, so the render that follows doesn't see a "new" value and snap the
          // handle there instantly, cutting this animation short.
          settledFor.current = `${final}:${stepsRef.current}`;
          settle(final, true);
          onChange(valuesRef.current[final]);
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
          setPressed(false);
          press.value = withTiming(0, { duration: PRESS_MS });
          settle(indexRef.current, true);
        },
      }),
    // Handlers read live values through refs, so they never need rebuilding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // The value kicks each time it turns over, so the number reads as responding to the handle.
  const valueScale = useSharedValue(1);
  const firstValue = useRef(true);
  useEffect(() => {
    if (firstValue.current) {
      firstValue.current = false;
      return;
    }
    valueScale.value = withSequence(
      withTiming(VALUE_POP, { duration: VALUE_POP_MS }),
      withSpring(1, VALUE_SETTLE),
    );
  }, [index, valueScale]);
  const valueStyle = useAnimatedStyle(() => ({ transform: [{ scale: valueScale.value }] }));

  const { radius, cx, cy, height, length } = geometry;

  /** A point on the arc at `t`, 0 at the start end and 1 at the finish. */
  const pointAt = (t: number) => {
    const a = (ARC_START - t * ARC_SWEEP) * DEG;
    return { x: cx + radius * Math.cos(a), y: cy - radius * Math.sin(a) };
  };

  /** The whole arc, one end to the other over the top. */
  const arcPath = useMemo(() => {
    const from = pointAt(0);
    const to = pointAt(1);
    // The large-arc flag is what lets this exceed a half turn at all.
    const largeArc = ARC_SWEEP > 180 ? 1 : 0;
    return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${largeArc} 1 ${to.x} ${to.y}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cx, cy, radius]);

  // The step marks are guidance for the drag, so they're only up while there is one — otherwise they
  // clutter a scale nobody is touching.
  /**
   * Faded as a *view* rather than through `animatedProps` on an SVG group.
   *
   * `useAnimatedProps` only reaches the element after mount, so the group painted at full opacity
   * until the first press — the marks were on show before anyone touched the arc. `useAnimatedStyle`
   * applies during the initial render, so the layer starts hidden.
   */
  const ticksStyle = useAnimatedStyle(() => ({ opacity: press.value }));

  // How much of the arc is filled, as a dash that grows from the left end.
  const fillProps = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - progress.value),
  }));

  const handleStyle = useAnimatedStyle(() => {
    const size = HANDLE_SIZE + (HANDLE_SIZE_PRESSED - HANDLE_SIZE) * press.value;
    const angle = (ARC_START - progress.value * ARC_SWEEP) * DEG;
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      padding: HANDLE_RING * press.value,
      left: cx + radius * Math.cos(angle) - size / 2,
      top: cy - radius * Math.sin(angle) - size / 2,
    };
  });
  const handleCoreStyle = useAnimatedStyle(() => {
    const size = HANDLE_SIZE + (HANDLE_SIZE_PRESSED - HANDLE_SIZE) * press.value;
    return { borderRadius: (size - HANDLE_RING * press.value * 2) / 2 };
  });
  /**
   * The glyph turns with the arc, so its chevrons always point along the direction of travel.
   *
   * It is drawn vertically (one chevron up, one down), and the tangent runs vertically at the ends
   * and horizontally at the top — so the turn is the negative of the handle's own angle round the
   * arc: 0° at the right end, -90° (flat) at the top, -180° at the left.
   */
  const glyphStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-(ARC_START - progress.value * ARC_SWEEP)}deg` }],
  }));

  const onMeasure = (e: LayoutChangeEvent) => {
    const measured = e.nativeEvent.layout.width;
    if (Math.abs(measured - width) > 1) setWidth(measured);
  };

  const current = values[index];
  const onAccent = readableTextColor(accent, { preferred: '#FFFFFF' });
  const endLabelColor = withAlpha(textColor, 0.55);
  // Stronger than the end labels: this one names the answer, they only caption the scale.
  const stepLabelColor = withAlpha(textColor, 0.75);
  const trackColor = pressed ? TRACK_PRESSED : withAlpha(accent, TRACK_ALPHA);
  // The page's own background, so a mark reads as a gap cut through the track rather than a line
  // painted on it — and stays legible over the accent fill as well as the tint behind it.
  const tickColor = backgroundColor ?? TICK_FALLBACK;

  return (
    <View style={styles.container} onLayout={onMeasure}>
      <View style={[styles.arcArea, { height }]} {...panResponder.panHandlers}>
        {radius > 0 ? (
          <Svg width={width} height={height}>
            {/* The scale itself. */}
            <Path
              d={arcPath}
              stroke={trackColor}
              strokeWidth={ARC_STROKE}
              strokeLinecap="round"
              fill="none"
            />
            {/* How far round the answer sits, drawn over it. */}
            <AnimatedPath
              d={arcPath}
              stroke={accent}
              strokeWidth={ARC_STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={length}
              animatedProps={fillProps}
            />
          </Svg>
        ) : null}

        {/* One mark per step, laid across the band rather than along it. Drawn in its own overlay so
            the fade can ride on a view's style — see `ticksStyle`. */}
        {radius > 0 ? (
          <Animated.View style={[styles.ticksLayer, ticksStyle]} pointerEvents="none">
            <Svg width={width} height={height}>
              {Array.from({ length: steps }, (_, i) => {
                const t = steps > 1 ? i / (steps - 1) : 0;
                const angle = (ARC_START - t * ARC_SWEEP) * DEG;
                // Round caps hang half a stroke width past each end, so the line is drawn one stroke
                // width short to paint the same `TICK_LENGTH` the straight slider's marks measure.
                const half = (TICK_LENGTH - TICK_WIDTH) / 2;
                const inner = radius - half;
                const outer = radius + half;
                return (
                  <Line
                    key={i}
                    x1={cx + inner * Math.cos(angle)}
                    y1={cy - inner * Math.sin(angle)}
                    x2={cx + outer * Math.cos(angle)}
                    y2={cy - outer * Math.sin(angle)}
                    stroke={tickColor}
                    strokeWidth={TICK_WIDTH}
                    strokeLinecap="round"
                  />
                );
              })}
            </Svg>
          </Animated.View>
        ) : null}

        {/* The value, in the bowl of the arc — the space an arc leaves empty anyway. */}
        <View style={[styles.readout, { top: cy - radius / 2 }]} pointerEvents="none">
          <Animated.Text style={[styles.current, { color: textColor }, valueStyle]}>
            {current}
          </Animated.Text>
          <Text style={[styles.currentLabel, { color: stepLabelColor }]} numberOfLines={1}>
            {scale.stepLabels?.[index] ?? ' '}
          </Text>

          {/* The arc reads the angle from its centre, so the whole area is draggable — not just the
              band. That is the least obvious of the three, and the most worth saying. */}
          <DragHint
            text="Drag around to adjust"
            dragged={dragged}
            accent={accent}
            color={endLabelColor}
            style={styles.hint}
          />
        </View>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.handle,
            { backgroundColor: withAlpha(accent, HANDLE_RING_ALPHA) },
            handleStyle,
          ]}
        >
          <Animated.View style={[styles.handleCore, { backgroundColor: accent }, handleCoreStyle]}>
            <Animated.View style={glyphStyle}>
              <SliderHandleIcon width={13} height={21} color={onAccent} />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </View>

      <View style={styles.endLabels}>
        <Text style={[styles.endLabel, { color: endLabelColor }]}>
          {scale.minLabel ?? values[0]}
        </Text>
        <Text style={[styles.endLabel, { color: endLabelColor }]}>
          {scale.maxLabel ?? values[steps - 1]}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Clear of the step name above it. */
  hint: {
    marginTop: 20,
  },
  container: {
    // Small, because the arc's box already reserves room below its ends for the handle — most of the
    // space under the arc is that reserve, not this.
    gap: 2,
  },
  /** Overlays the arc exactly, carrying the marks so their fade can be a view style. */
  ticksLayer: {
    ...StyleSheet.absoluteFill,
  },
  arcArea: {
    width: '100%',
  },
  readout: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  current: {
    // Matched to the straight slider's, so the two read as the same control.
    fontSize: 88,
    // Matches the font size: a lone numeral has no descender to clear.
    lineHeight: 88,
    textAlign: 'center',
    // Fixed-width digits. Proportional ones give `1` far wider side bearings than `4`, so a centred
    // numeral looks off-centre — and the value would shift sideways as it changed.
    fontVariant: ['tabular-nums'],
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  /**
   * What the definition calls the step under the value.
   *
   * Always rendered, even when the step has no name — most scales name only their ends, and letting
   * the row collapse would bounce the value up and down as the handle crossed into an unnamed step.
   */
  currentLabel: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    letterSpacing: tracking.semiBold,
    includeFontPadding: false,
  },
  handle: {
    position: 'absolute',
  },
  handleCore: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  endLabel: {
    fontSize: 14,
    // Taller than the font size so descenders aren't clipped on Android.
    lineHeight: 18,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
});
