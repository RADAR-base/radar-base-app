import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { QuestionRange, SelectChoice } from '../../../../types';
import { questionScale } from './questionScale';
import { useStepHaptics } from '../../useStepHaptics';
import { DragHint } from './DragHint';
import { GooChip } from './GooChip';
import { fontFamily, tracking, readableTextColor, withAlpha } from '../../../../theme/theme';

interface ScaleInputProps {
  range?: QuestionRange;
  /** The scale's own steps, when the definition names them — their labels caption the value. */
  choices?: SelectChoice[];
  value: number | undefined;
  onChange: (value: number) => void;
  primaryColor: string;
  textColor: string;
  /** Manifest accent — the track, and the chip marking the answer. Falls back to `primaryColor`. */
  accentColor?: string;
  /** The page's own background; the unselected chips are cut out of the track with it. */
  backgroundColor?: string;
}

/** Figma 4015:2262. The track's padding, the gap between chips, and its pill radius. */
const TRACK_PAD = 9;
const CHIP_GAP = 9;
const TRACK_RADIUS = 48;
const TRACK_ALPHA = 0.25;

/**
 * The chip marking the answer is a shade larger than the rest, and square-cornered rather than round.
 *
 * Both differences are the design's: the answer reads as a different *kind* of thing from the options
 * around it, not merely a tinted one, which survives at chip sizes too small for colour alone to carry.
 */
const SELECTED_GROW = 3;
const SELECTED_RADIUS = 12;

/**
 * How far the chip squashes between one number and the next (Figma 4047:3107).
 *
 * Dragging across a row of discrete numbers has nothing to animate — the answer either changes or it
 * doesn't — so the chip carries the motion instead: it compresses as it leaves a number and springs
 * back as it arrives at the next. The scale is what makes a drag feel continuous over a control that
 * isn't.
 */
const SQUASH_Y = 0.64;
const STRETCH_X = 1.12;

/**
 * How the chip travels to a number, and how it behaves once it gets there.
 *
 * `LAND_SPRING` carries it into place — lightly damped, so it eases in and overshoots a hair instead
 * of stopping dead. `LAND_DIP` and `LAND_SWELL` are the arrival itself: it compresses briefly as it
 * meets the number, then springs out past full size and settles, which is what reads as the blob
 * merging into the number and filling out rather than being swapped for it.
 */
const LAND_SPRING = { damping: 14, stiffness: 110, mass: 0.9 } as const;

/**
 * How strongly a nearby number pulls the blob while it is being dragged.
 *
 * Without it the blob is pinned rigidly under the finger and only moves to a number on release, so the
 * whole of the sticking happens in one jump at the end. Letting the nearest number draw it in — hardest
 * when it is almost there, nothing at all midway between two — means the blob is already most of the
 * way home before the finger lifts, and the settle has little left to do.
 *
 * Well under 1: at 1 the blob would lock to the number and stop tracking the finger, which reads as
 * the control ignoring you.
 */
const MAGNET = 0.55;
const LAND_DIP = 0.88;
const LAND_MS = 70;
const LAND_SWELL = { damping: 9, stiffness: 220, mass: 0.6 } as const;

/** The smallest a chip may get before the row stops being tappable. */
const MIN_CHIP = 22;

/**
 * The design's chip size, and the row height that follows from it.
 *
 * Capping the chip is what keeps the row a *fixed* height: without it the chips grow to fill whatever
 * width the track has, so a five-step scale would be twice as tall as a ten-step one — and, worse, the
 * row's height would be unknown until the track had been measured. During a page transition the
 * incoming question mounts unmeasured, so it rendered a collapsed row and then jumped to size as the
 * measurement landed. A fixed height means the row occupies its final space from the first frame.
 */
const MAX_CHIP = 30;
const ROW_HEIGHT = MAX_CHIP + TRACK_PAD * 2;

/**
 * How large a chip's numeral is, as a share of the chip, and the bounds it stays inside.
 *
 * Not the design's flat 12: that was drawn against a 30pt chip and looks lost in one, let alone the
 * larger chips a short scale gets. Scaling with the chip keeps the numeral looking the same size
 * relative to its circle at any step count, and the ceiling stops a two-digit value outgrowing it.
 */
const CHIP_TEXT_RATIO = 0.52;
const CHIP_TEXT_MIN = 13;
const CHIP_TEXT_MAX = 18;

/** The ring the blob wears while the row is held — the accent at a fifth, as every handle does. */
const RING_ALPHA = 0.2;

/** How long the chip takes to settle onto a step, and the kick the value gives as it turns over. */
const PRESS_MS = 120;
const VALUE_POP = 1.12;
const VALUE_POP_MS = 90;
const VALUE_SETTLE = { damping: 9, stiffness: 260, mass: 0.5 } as const;

/**
 * How far into the next step the drag must travel before the value follows it. Above a half, so the
 * number doesn't flip the instant you pass the midpoint.
 */
const STEP_HYSTERESIS = 0.7;

/** How far a finger must travel before the row treats it as a drag rather than a tap on a chip. */
const DRAG_SLOP = 4;

/** The value's own type size, matched to the other sliders rather than the design's 96. */
const VALUE_SIZE = 88;

/** The distance from the value down to the row of numbers. */
const BLOCK_GAP = 24;
const CAPTION_GAP = 8;
const CAPTION_LINE = 20;
const VALUE_TOP_SPACE = CAPTION_GAP + CAPTION_LINE;

/**
 * A scale shown as its actual numbers (Figma 4015:2262), rather than as a bar.
 *
 * The other sliders abstract the scale into a track and report where you are on it; this one puts the
 * steps themselves on screen. Worth it on short, named scales — a seven- or ten-point question where
 * seeing every option at once, and being able to hit one directly, beats sliding to it.
 *
 * It takes both gestures for that reason: tap a number to choose it, or drag across the row and let it
 * snap. The dragging half behaves like the other sliders — the same hysteresis before the value turns
 * over, the same snap to the nearest step on release.
 */
export function ScaleInput({
  range,
  choices,
  value,
  onChange,
  primaryColor,
  textColor,
  accentColor,
  backgroundColor,
}: ScaleInputProps) {
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
  const [dragged, setDragged] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);

  /**
   * How big each chip is, and how far apart their centres sit.
   *
   * Sized from the measured track rather than the design's fixed 30: ten 30pt chips with 9pt gaps come
   * to 399pt, which doesn't fit a phone. The row divides what it's given instead, and the gap shrinks
   * with it once the chips reach {@link MIN_CHIP}.
   */
  const { chip, pitch, gap } = useMemo(() => {
    if (trackWidth <= 0 || steps < 1) return { chip: 0, pitch: 0, gap: CHIP_GAP };
    const inner = trackWidth - TRACK_PAD * 2;
    const roomy = Math.min(MAX_CHIP, (inner - CHIP_GAP * (steps - 1)) / steps);
    if (roomy >= MIN_CHIP) {
      // Spare width goes into the gaps, not the chips — the design draws 30pt circles, spread.
      const spare = (inner - roomy * steps) / Math.max(1, steps - 1);
      return { chip: roomy, pitch: roomy + spare, gap: spare };
    }
    // Too many steps for a full gap: give the chips their floor and share what's left between them.
    const tight = Math.max(0, (inner - MIN_CHIP * steps) / Math.max(1, steps - 1));
    return { chip: MIN_CHIP, pitch: MIN_CHIP + tight, gap: tight };
  }, [trackWidth, steps]);

  /** The numeral's size, scaled to the chip it sits in — see `CHIP_TEXT_RATIO`. */
  const chipFont = Math.max(
    CHIP_TEXT_MIN,
    Math.min(CHIP_TEXT_MAX, Math.round(chip * CHIP_TEXT_RATIO)),
  );

  const ready = chip > 0;

  const indexRef = useRef(index);
  indexRef.current = index;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const valuesRef = useRef(values);
  valuesRef.current = values;
  /**
   * Layout mirrored into refs, because the drag handlers are built once.
   *
   * `PanResponder` is memoised with no dependencies, so it keeps the very first render's copy of these
   * functions — and on that render the track hadn't been measured, so `chip` was 0. Reading it straight
   * from the closure left every position half a chip out for the rest of the question's life.
   */
  const pitchRef = useRef(pitch);
  pitchRef.current = pitch;
  const chipRef = useRef(chip);
  chipRef.current = chip;

  /** The chip's centre, in points from the track's left edge. On the UI thread. */
  const offset = useSharedValue(0);
  const press = useSharedValue(0);
  /**
   * Layout mirrored for the worklets, written in an effect rather than during render.
   *
   * Same reason as the settle below: a render-phase write reaches the UI thread at an arbitrary moment,
   * and with two panels rendering through a page slide these were reassigned repeatedly while the blob
   * was mid-animation.
   */
  const pitchShared = useSharedValue(pitch);
  const chipShared = useSharedValue(chip);
  useEffect(() => {
    pitchShared.value = pitch;
    chipShared.value = chip;
  }, [pitch, chip, pitchShared, chipShared]);

  /** Where a step's chip sits. */
  const positionOf = (i: number) => TRACK_PAD + i * pitchRef.current + chipRef.current / 2;

  const settle = (nextIndex: number, animate: boolean) => {
    const x = positionOf(nextIndex);
    // A spring, not a timing: the chip arrives by easing into the number and overshooting a hair,
    // which is what reads as landing rather than being placed. A 120ms linear-ish move to the same
    // point is the "snappy" feel — it stops dead the instant it arrives.
    offset.value = animate ? withSpring(x, LAND_SPRING) : x;
  };

  /** True between grabbing the row and letting go. */
  const dragging = useRef(false);
  const settledFor = useRef('');
  /**
   * Placed in an effect, never during render.
   *
   * Writing a shared value while rendering is unsupported. React may render a component more than once
   * for a single commit, and during a page slide `StepSlider` has two panels mounted and rendering
   * together — so the blob was written several times per frame from the JS thread while the UI thread
   * was mid-animation. That is the distortion and flicker on a question change.
   *
   * Still skipped while dragging: the value follows the blob then, never the other way round.
   */
  const settleKey = `${index}:${pitch}:${chip}`;
  useEffect(() => {
    if (settledFor.current === settleKey || !ready) return;
    settledFor.current = settleKey;
    if (!dragging.current) settle(index, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settleKey]);

  const dragStart = useRef(0);

  /** Where the chip is now, as a fractional step. */
  function exactStep(): number {
    if (pitchRef.current <= 0) return 0;
    return (offset.value - TRACK_PAD - chipRef.current / 2) / pitchRef.current;
  }

  /** Place the chip `x` points along the row, and move the value if it has passed a step. */
  function setChip(x: number) {
    if (pitchRef.current <= 0) return;
    const first = positionOf(0);
    const last = positionOf(stepsRef.current - 1);
    const free = Math.min(last, Math.max(first, x));

    /**
     * Drawn toward the number it is nearest, rather than pinned to the finger.
     *
     * `away` is 0 on a number and 1 exactly between two; smoothstepping it and inverting gives a pull
     * that fades in as the blob closes on a number and vanishes in the middle of a gap. The blob
     * therefore eases into each step on the way past instead of arriving all at once on release.
     */
    const rawStep = (free - TRACK_PAD - chipRef.current / 2) / pitchRef.current;
    const nearest = Math.round(rawStep);
    const away = Math.min(1, Math.abs(rawStep - nearest) * 2);
    const pull = MAGNET * (1 - away * away * (3 - 2 * away));
    offset.value = free + (positionOf(nearest) - free) * pull;

    const exact = exactStep();
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
    next = Math.min(stepsRef.current - 1, Math.max(0, next));

    if (next !== from) {
      indexRef.current = next;
      setIndex(next);
      tick();
    }
  }

  /** Choose a step outright — the row's other gesture. */
  const select = (next: number) => {
    if (next === indexRef.current) return;
    indexRef.current = next;
    setIndex(next);
    settledFor.current = `${next}:${pitch}:${chip}`;
    settle(next, true);
    onChange(valuesRef.current[next]);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        /**
         * Claimed on movement, not on touch down.
         *
         * A capture handler runs before its descendants, so capturing the touch down would swallow
         * every tap on a chip. Waiting for a few points of travel separates the two gestures this row
         * accepts: a tap belongs to the chip under it, a drag belongs to the row.
         */
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponderCapture: (_e, gesture) => Math.abs(gesture.dx) > DRAG_SLOP,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: e => {
          dragging.current = true;
          setDragged(true);
          press.value = withTiming(1, { duration: PRESS_MS });
          setChip(e.nativeEvent.locationX);
          dragStart.current = offset.value;
        },
        onPanResponderMove: (_e, gesture) => {
          // A delta from where the drag began: `locationX` is only meaningful while the finger is
          // inside the view, and a drag past either end would otherwise jump.
          setChip(dragStart.current + gesture.dx);
        },
        onPanResponderRelease: () => {
          dragging.current = false;
          press.value = withTiming(0, { duration: PRESS_MS });
          // The nearest step, not whatever hysteresis settled on: let go three-quarters of the way to
          // the next number and that is plainly the one you meant.
          const final = Math.min(stepsRef.current - 1, Math.max(0, Math.round(exactStep())));
          if (final !== indexRef.current) {
            indexRef.current = final;
            setIndex(final);
          }
          settledFor.current = `${final}:${pitchRef.current}:${chipRef.current}`;
          settle(final, true);
          onChange(valuesRef.current[final]);
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
          press.value = withTiming(0, { duration: PRESS_MS });
          settle(indexRef.current, true);
        },
      }),
    // Handlers read live values through refs, so they never need rebuilding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // The value kicks each time it turns over, so it reads as responding to the drag.
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

  /**
   * How far the chip is from a number, 0 on one and 1 exactly between two.
   *
   * Multiplied by `press` so the squash only happens under a finger — a chip that deformed when the
   * value was set by a tap would be animating something the participant didn't do.
   */
  const between = useDerivedValue(() => {
    const pitchNow = pitchShared.value;
    if (pitchNow <= 0) return 0;
    const exact = (offset.value - TRACK_PAD - chipShared.value / 2) / pitchNow;
    const raw = press.value * Math.abs(exact - Math.round(exact)) * 2;
    /**
     * Smoothstep, so the deformation eases in and out instead of tracking the finger linearly.
     *
     * Straight off the position, the chip is at its roundest for only an instant as it passes a
     * number and changes shape fastest exactly where it crosses — which is the part that read as
     * snapping. This flattens the curve at both ends: it lingers round on a number, lingers squashed
     * between two, and does its changing in the middle where the eye isn't looking for an edge.
     */
    return raw * raw * (3 - 2 * raw);
  });

  /**
   * The swell as the chip arrives on a number.
   *
   * Springs past 1 and settles back, so the blob reads as merging into the number and filling out
   * rather than simply stopping there. Fired on every crossing, however the value was moved.
   */
  const land = useSharedValue(1);
  const firstLand = useRef(true);
  useEffect(() => {
    if (firstLand.current) {
      // Arriving on the question isn't a landing.
      firstLand.current = false;
      return;
    }
    land.value = withSequence(
      withTiming(LAND_DIP, { duration: LAND_MS }),
      withSpring(1, LAND_SWELL),
    );
  }, [index, land]);

  /**
   * The chip's live geometry, as shared values the goo canvas can read.
   *
   * Skia takes Reanimated values directly, so the blob is drawn from the same numbers the view-based
   * chip uses and neither crosses to the JS thread.
   */
  const chipWidth = useDerivedValue(() => {
    const base = chipShared.value + SELECTED_GROW;
    return base * interpolate(between.value, [0, 1], [1, STRETCH_X]) * land.value;
  });
  const chipHeight = useDerivedValue(() => {
    const base = chipShared.value + SELECTED_GROW;
    return base * interpolate(between.value, [0, 1], [1, SQUASH_Y]) * land.value;
  });
  const chipRadius = useDerivedValue(() =>
    interpolate(between.value, [0, 1], [SELECTED_RADIUS, chipHeight.value / 2]),
  );
  /**
   * The blob's position as a fractional step, on the UI thread.
   *
   * Every chip reads it to work out how near the blob is, which is what lets the faces fade rather
   * than switch. The same arithmetic `exactStep()` does for the drag handlers on the JS side.
   */
  const exactShared = useDerivedValue(() => {
    const pitchNow = pitchShared.value;
    if (pitchNow <= 0) return 0;
    return (offset.value - TRACK_PAD - chipShared.value / 2) / pitchNow;
  });

  /** The number the chip is nearest — the blob it fuses with as it arrives. */
  const chipTarget = useDerivedValue(() => {
    const pitchNow = pitchShared.value;
    if (pitchNow <= 0) return offset.value;
    const exact = (offset.value - TRACK_PAD - chipShared.value / 2) / pitchNow;
    return TRACK_PAD + Math.round(exact) * pitchNow + chipShared.value / 2;
  });

  const onTrackLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (Math.abs(width - trackWidth) > 1) setTrackWidth(width);
  };

  /** Whatever reads on the accent — the answer's number sits straight on the blob. */
  const onAccent = readableTextColor(accent, { preferred: '#FFFFFF' });
  const chipBg = backgroundColor ?? '#FFFFFF';
  const stepLabelColor = withAlpha(textColor, 0.75);
  const endLabelColor = withAlpha(textColor, 0.55);

  return (
    <View style={styles.container}>
      <View style={styles.readout}>
        <Animated.Text
          style={[styles.value, { color: textColor }, valueStyle]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {values[index]}
        </Animated.Text>
        <Text style={[styles.caption, { color: stepLabelColor }]} numberOfLines={2}>
          {scale.stepLabels?.[index] ?? ' '}
        </Text>
      </View>

      <View style={styles.scaleBlock}>
        <View
          style={[styles.track, { backgroundColor: withAlpha(accent, TRACK_ALPHA) }]}
          onLayout={onTrackLayout}
          {...panResponder.panHandlers}
        >
          {/* The answer, drawn under the numbers so the selected one reads over it.
              A blob rather than a view: it fuses with the number it is arriving at. */}
          {ready ? (
            <GooChip
              centre={offset}
              target={chipTarget}
              width={chipWidth}
              height={chipHeight}
              radius={chipRadius}
              restSize={chip}
              midline={ROW_HEIGHT / 2}
              rowWidth={trackWidth}
              rowHeight={ROW_HEIGHT}
              colour={accent}
              press={press}
              ringColour={withAlpha(accent, RING_ALPHA)}
            />
          ) : null}

          <View style={styles.chips}>
            {Array.from({ length: steps }, (_, i) => (
              <Pressable
                key={i}
                onPress={() => select(i)}
                accessibilityRole="radio"
                accessibilityState={{ selected: i === index }}
                accessibilityLabel={scale.stepLabels?.[i] ?? String(values[i])}
                style={[
                  styles.chip,
                  {
                    width: chip,
                    height: chip,
                    marginRight: i === steps - 1 ? 0 : gap,
                  },
                ]}
              >
                {/* The face is the chip's own child rather than its background, so it can fade with
                    the blob's distance — see `Chip`. */}
                <Chip
                  index={i}
                  exact={exactShared}
                  text={String(values[i])}
                  size={chip}
                  fontSize={chipFont}
                  faceColor={chipBg}
                  restColor={textColor}
                  activeColor={onAccent}
                />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.endLabels}>
          <Text style={[styles.endLabel, { color: endLabelColor }]} numberOfLines={1}>
            {scale.minLabel ?? values[0]}
          </Text>
          <Text style={[styles.endLabel, { color: endLabelColor }]} numberOfLines={1}>
            {scale.maxLabel ?? values[steps - 1]}
          </Text>
        </View>

        <DragHint
          text="Tap a number, or drag across"
          dragged={dragged}
          accent={accent}
          color={endLabelColor}
          style={styles.hint}
        />
      </View>
    </View>
  );
}

/**
 * One number on the row: its white face, and the number itself.
 *
 * Both are driven by how near the blob is, not by which step is selected. That difference is the whole
 * behaviour — keyed to the selected index, a chip's face vanishes the instant the value turns over and
 * reappears the instant it turns back, so the blob looked stuck to a number and the chip it left sat
 * empty until hysteresis caught up. Keyed to distance, the face fades back in as the blob peels away
 * and fades out as it arrives, and the number colours over at the same rate.
 *
 * `near` is 1 when the blob is centred on this chip and 0 once it is a full step away.
 */
function Chip({
  index,
  exact,
  text,
  size,
  fontSize,
  faceColor,
  restColor,
  activeColor,
}: {
  index: number;
  exact: SharedValue<number>;
  text: string;
  size: number;
  fontSize: number;
  faceColor: string;
  restColor: string;
  activeColor: string;
}) {
  const near = useDerivedValue(() => {
    const away = Math.abs(exact.value - index);
    return Math.max(0, Math.min(1, 1 - away));
  });

  const faceStyle = useAnimatedStyle(() => ({ opacity: 1 - near.value }));
  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(near.value, [0, 1], [restColor, activeColor]),
  }));

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.face, { backgroundColor: faceColor, borderRadius: size / 2 }, faceStyle]}
      />
      <Animated.Text
        style={[styles.chipText, { fontSize, lineHeight: fontSize + 2 }, textStyle]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {text}
      </Animated.Text>
    </>
  );
}

const styles = StyleSheet.create({
  /**
   * The value at the top of the space and the scale at the bottom of it, the way `SliderInput` spreads
   * its own two halves.
   */
  /**
   * The value and the row as one block, centred in whatever the question text leaves.
   *
   * `space-between` put them at opposite ends of the space, so the distance between them wasn't the
   * `gap` at all — it was everything left over, and grew with the screen. Centring makes `BLOCK_GAP`
   * the real distance, and keeps the row within a thumb's reach since the chips are tap targets.
   */
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: BLOCK_GAP,
  },
  readout: {
    alignItems: 'center',
    // Balances the caption below the value, so the number sits on the middle of its block.
    paddingTop: VALUE_TOP_SPACE,
  },
  value: {
    fontSize: VALUE_SIZE,
    // Matches the font size: a lone numeral has no descender to clear.
    lineHeight: VALUE_SIZE,
    textAlign: 'center',
    // Fixed-width digits, so a centred numeral doesn't shift sideways as it changes.
    fontVariant: ['tabular-nums'],
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  caption: {
    marginTop: CAPTION_GAP,
    fontSize: 16,
    lineHeight: CAPTION_LINE,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    letterSpacing: tracking.semiBold,
    includeFontPadding: false,
  },
  scaleBlock: {
    gap: 9,
  },
  track: {
    height: ROW_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: TRACK_PAD,
    borderRadius: TRACK_RADIUS,
    // Not clipped: the chip stretches past its own width as it squashes.
    overflow: 'visible',
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** The white circle behind a number, faded by the blob's distance — see `Chip`. */
  face: {
    ...StyleSheet.absoluteFill,
  },
  chipText: {
    fontSize: 12,
    lineHeight: 14,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
    fontVariant: ['tabular-nums'],
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
  hint: {
    marginTop: 11,
  },
});
