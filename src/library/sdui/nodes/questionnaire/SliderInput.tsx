import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { QuestionRange, SelectChoice } from '../../../../types';
import { questionScale } from './questionScale';
import { useStepHaptics } from '../../useStepHaptics';
import { DragHint } from './DragHint';
import SliderHandleIcon from '../../../../theme/icons/sliderhandle.svg';
import {
  fontFamily,
  tracking,
  layout as layoutTokens,
  readableTextColor,
  withAlpha,
} from '../../../../theme/theme';

interface SliderInputProps {
  range?: QuestionRange;
  /** The scale's own steps, when the definition names them — their labels caption the value. */
  choices?: SelectChoice[];
  value: number | undefined;
  onChange: (value: number) => void;
  primaryColor: string;
  textColor: string;
  /** Manifest accent — the track fill and the handle. Falls back to `primaryColor`. */
  accentColor?: string;
  /**
   * The page's own background, so the step marks can be cut out of the track rather than painted on
   * it. Resolved by the host from the theme and its brand colours; falls back to white.
   */
  backgroundColor?: string;
}

/** Figma 3767:5523. Track height, and the radius that makes it a pill. Slightly under the design's
 *  30, which sat heavy against the handle — the gap between the two is what makes the handle read as
 *  sitting on the bar rather than being part of it. */
const TRACK_HEIGHT = 24;
const TRACK_RADIUS = layoutTokens.radiusPill;

/**
 * The handle, at rest and while held. Both are circles — the radius is half the size.
 *
 * Matched to `ArcSliderInput`: the two are the same control in different geometry, so a handle that
 * grew by a different amount here would give that away the moment you touched one after the other.
 */
const HANDLE_SIZE = 36;
const HANDLE_SIZE_PRESSED = 60;

/**
 * The row the track sits in, tall enough for the handle at its largest.
 *
 * The handle stands proud of the bar — that's what makes it read as a grabbable thing rather than
 * part of the track — so it cannot live inside the track, which clips its children to keep the fill's
 * square end inside the pill. It sits over the track in this row instead, where nothing crops it.
 */
const TRACK_AREA_HEIGHT = HANDLE_SIZE_PRESSED;

/**
 * How far the handle reaches past the track's ends when held, and the inset that leaves room for it.
 *
 * The handle grows around its own centre, so at either extreme half the growth lands outside the
 * track. The page clips there, so the slider is inset by that much: the overhang then falls inside
 * the page's own padding instead of being cut off mid-grab.
 */
const HANDLE_OVERHANG = (HANDLE_SIZE_PRESSED - HANDLE_SIZE) / 2;

/** The ring that appears around the handle while it's held: 4pt of the accent at a fifth. */
const HANDLE_RING = 4;
const HANDLE_RING_ALPHA = 0.2;

/** Step marks along the track. Hairline-thin, so they guide the handle without competing with it. */
const TICK_WIDTH = 3;
const TICK_HEIGHT = 12;

/** Track tint at rest (the accent, mostly transparent) and while held (a neutral grey). */
const TRACK_ALPHA = 0.25;
const TRACK_PRESSED = 'rgba(202, 203, 212, 0.5)';

/** Used when the host names no background. Most pages are light, so white is the safer guess. */
const TICK_FALLBACK = '#FFFFFF';

/**
 * The step name below the value, and the space reserved above it to match.
 *
 * Only the caption hangs beneath the number, so without the same height above it the value rides high
 * in its block — balanced box, unbalanced contents. The same reserve `VerticalSliderInput` makes.
 *
 * Kept as the sum of its parts so changing the caption's line height moves both ends together.
 */
const CAPTION_GAP = 8;
const CAPTION_LINE = 20;
const VALUE_TOP_SPACE = CAPTION_GAP + CAPTION_LINE;

/** The gap from the end labels down to the drag hint. */
const HINT_GAP = 20;

/**
 * The gap below the Min/Max labels' row — measured from the *handle's* reach, not the bar's edge.
 *
 * The row holding the track is as tall as the handle at its largest, and that is the right thing to
 * clear: pulled up tight against the bar instead, the labels end up under the handle whenever it sits
 * at one of the ends, which is exactly where the end labels are.
 *
 * 2 matches `ArcSliderInput`, whose own gap is small for the same reason — its box already reserves a
 * half-handle below the band, and the gap is what sits beneath *that*.
 */
const LABEL_GAP = 2;

/** How long the handle takes to grow or settle back. */
const PRESS_MS = 120;

/**
 * The kick the value gives as it turns over, and how long each half of it takes.
 *
 * Small on purpose: dragging across a seven-point scale fires this six times in a second or two, so
 * anything larger reads as thrashing rather than as the number keeping up with the handle.
 */
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
 * the gap between steps.
 *
 * Above a half, so the number doesn't flip the instant you pass the midpoint — at a half it changes
 * under your thumb while you are still deciding, which reads as the slider fighting you. The handle
 * itself always moves freely; this only governs what the readout says.
 */
const STEP_HYSTERESIS = 0.7;

/**
 * A REDCap `range` question — a value picked by dragging along a scale (Figma 3767:5523).
 *
 * Replaces a row of numbered buttons, which fell apart past a handful of steps and gave no sense of
 * the scale as a continuum. The value is shown large above the track, captioned by whatever the
 * definition calls that step, with the ends named beneath.
 *
 * The handle is driven on the UI thread while the *label* is React state, so dragging stays smooth
 * however busy the JS thread is — state only changes when the value crosses into a new step, not on
 * every pixel of travel.
 */
export function SliderInput({
  range,
  choices,
  value,
  onChange,
  primaryColor,
  textColor,
  accentColor,
  backgroundColor,
}: SliderInputProps) {
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
  const [trackWidth, setTrackWidth] = useState(0);

  // Live position of the handle, in points from the track's left edge. On the UI thread, so a drag
  // never waits on React.
  const offset = useSharedValue(0);
  const press = useSharedValue(0);

  /** Travel available to the handle — the track less its own width, so it stops flush at each end. */
  const travel = Math.max(0, trackWidth - HANDLE_SIZE);
  const indexRef = useRef(index);
  indexRef.current = index;
  const travelRef = useRef(travel);
  travelRef.current = travel;
  const valuesRef = useRef(values);
  valuesRef.current = values;

  // Keep the handle with the value when it changes from outside a drag (first render, or a value
  // restored from a previous answer).
  const settle = (nextIndex: number, animate: boolean) => {
    const x = steps > 1 ? (nextIndex / (steps - 1)) * travelRef.current : 0;
    offset.value = animate ? withTiming(x, { duration: PRESS_MS }) : x;
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
  const settledFor = useRef<string>('');
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
  const key = `${index}:${travel}`;
  useEffect(() => {
    if (settledFor.current === key || travel <= 0) return;
    settledFor.current = key;
    if (!dragging.current) settle(index, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

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
          // Jump to wherever they touched, centring the handle under the finger.
          setHandle(e.nativeEvent.locationX - HANDLE_SIZE / 2);
          dragStart.current = offset.value;
        },
        onPanResponderMove: (_e, gesture) => {
          // Tracked as a delta from where the drag began rather than from the touch's current
          // position: `locationX` is only meaningful while the finger is inside the view, and a drag
          // that runs past either end of the track would otherwise jump.
          setHandle(dragStart.current + gesture.dx);
        },
        onPanResponderRelease: () => {
          dragging.current = false;
          setPressed(false);
          press.value = withTiming(0, { duration: PRESS_MS });
          // Resolve to the *nearest* step now, not to whatever the readout settled on under
          // hysteresis: let go three-quarters of the way to the next step and that is plainly the one
          // you meant, even though the number hadn't turned over yet.
          const final = Math.min(steps - 1, Math.max(0, Math.round(exactStep())));
          if (final !== indexRef.current) {
            indexRef.current = final;
            setIndex(final);
            tick();
          }
          // Claim the key too, so the render that follows doesn't see a "new" value and snap the
          // handle there instantly, cutting this animation short.
          settledFor.current = `${final}:${travelRef.current}`;
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

  /** Where the handle sat when the current drag began. */
  const dragStart = useRef(0);

  /** Where the handle is now, as a fractional step. */
  function exactStep(): number {
    const limit = travelRef.current;
    if (limit <= 0) return 0;
    return (offset.value / limit) * (steps - 1);
  }

  /** Place the handle `x` points along the track, and update the readout if it has moved on. */
  function setHandle(x: number) {
    const limit = travelRef.current;
    if (limit <= 0) return;
    offset.value = Math.min(limit, Math.max(0, x));

    const exact = exactStep();
    const from = indexRef.current;
    const delta = exact - from;
    let next = from;
    if (Math.abs(delta) >= 1) {
      // A jump rather than a nudge — a tap further along the track, say. Follow it straight there.
      next = Math.round(exact);
    } else if (delta > STEP_HYSTERESIS) {
      next = from + 1;
    } else if (delta < -STEP_HYSTERESIS) {
      next = from - 1;
    }
    next = Math.min(steps - 1, Math.max(0, next));

    // Only when it crosses into another step — a `setState` per pixel would re-render the readout
    // dozens of times a second for no visible gain.
    if (next !== from) {
      indexRef.current = next;
      setIndex(next);
      tick();
    }
  }

  // The ring is a *band of padding*, not a border. React Native paints a view's background under its
  // border, so the design's translucent border over the handle's own fill would render invisible —
  // the same reason the radio options and the speech passage card are built in two layers.
  // The value kicks each time it turns over, so the number reads as responding to the handle rather
  // than quietly swapping. Keyed on the step, so it fires once per change however fast the drag is.
  const valueScale = useSharedValue(1);
  const firstValue = useRef(true);
  useEffect(() => {
    if (firstValue.current) {
      // Arriving on the question isn't a change — don't pop on mount.
      firstValue.current = false;
      return;
    }
    valueScale.value = withSequence(
      withTiming(VALUE_POP, { duration: VALUE_POP_MS }),
      withSpring(1, VALUE_SETTLE),
    );
  }, [index, valueScale]);
  const valueStyle = useAnimatedStyle(() => ({ transform: [{ scale: valueScale.value }] }));

  const handleStyle = useAnimatedStyle(() => {
    const size = HANDLE_SIZE + (HANDLE_SIZE_PRESSED - HANDLE_SIZE) * press.value;
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      padding: HANDLE_RING * press.value,
      // Centred on the bar vertically and on its resting position horizontally as it grows, so it
      // swells around itself rather than lurching down and to one side when grabbed.
      top: (TRACK_AREA_HEIGHT - size) / 2,
      transform: [{ translateX: offset.value - (size - HANDLE_SIZE) / 2 }],
    };
  });
  // The handle proper, inside the ring. Its radius follows the band so the two stay concentric.
  const handleCoreStyle = useAnimatedStyle(() => {
    const size = HANDLE_SIZE + (HANDLE_SIZE_PRESSED - HANDLE_SIZE) * press.value;
    return { borderRadius: (size - HANDLE_RING * press.value * 2) / 2 };
  });
  const fillStyle = useAnimatedStyle(() => ({
    width: offset.value + HANDLE_SIZE / 2,
  }));
  // The step marks are guidance for the drag, so they're only up while there is one — otherwise they
  // clutter a scale nobody is touching.
  const ticksStyle = useAnimatedStyle(() => ({ opacity: press.value }));

  const onTrackLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (Math.abs(width - trackWidth) > 1) setTrackWidth(width);
  };

  const current = values[index];
  const { minLabel, maxLabel } = scale;
  const onAccent = readableTextColor(accent, { preferred: '#FFFFFF' });
  // Muted: the ends caption the scale, they aren't the answer. Derived from the text colour rather
  // than a fixed grey so it stays legible in both themes.
  const endLabelColor = withAlpha(textColor, 0.55);
  // Stronger than the end labels: this one names the answer, they only caption the scale.
  const stepLabelColor = withAlpha(textColor, 0.75);
  // The page's own background, so a mark reads as a gap cut through the track rather than a line
  // painted on it — and stays legible over the accent fill as well as the tint behind it.
  const tickColor = backgroundColor ?? TICK_FALLBACK;

  return (
    <View style={styles.container}>
      {/* The value, large, with whatever the definition calls that step beneath it. */}
      <View style={styles.readout}>
        <Animated.Text style={[styles.current, { color: textColor }, valueStyle]}>
          {current}
        </Animated.Text>
        <Text style={[styles.currentLabel, { color: stepLabelColor }]} numberOfLines={1}>
          {scale.stepLabels?.[index] ?? ' '}
        </Text>
      </View>

      <View style={styles.sliderBlock}>
        <View style={styles.trackArea} onLayout={onTrackLayout} {...panResponder.panHandlers}>
          <View
            style={[
              styles.track,
              { backgroundColor: pressed ? TRACK_PRESSED : withAlpha(accent, TRACK_ALPHA) },
            ]}
            pointerEvents="none"
          >
            {/* How far along the scale the answer sits, drawn behind the marks. */}
            <Animated.View style={[styles.fill, { backgroundColor: accent }, fillStyle]} />

            {/* One mark per step, inset from the ends so the first and last sit inside the pill. */}
            <Animated.View style={[styles.ticksLayer, ticksStyle]} pointerEvents="none">
              {trackWidth > 0
                ? Array.from({ length: steps }, (_, i) => {
                    // Laid out on the travel the handle actually gets, so every mark sits under the
                    // handle's centre at that step. The handle's own radius is what insets the first
                    // and last from the ends, which keeps the row symmetric at any track width.
                    const centre = HANDLE_SIZE / 2 + (steps > 1 ? (i / (steps - 1)) * travel : 0);
                    return (
                      <View
                        key={i}
                        style={[
                          styles.tick,
                          { left: centre - TICK_WIDTH / 2, backgroundColor: tickColor },
                        ]}
                      />
                    );
                  })
                : null}
            </Animated.View>
          </View>

          <Animated.View
            pointerEvents="none"
            style={[
              styles.handle,
              { backgroundColor: withAlpha(accent, HANDLE_RING_ALPHA) },
              handleStyle,
            ]}
          >
            <Animated.View
              style={[styles.handleCore, { backgroundColor: accent }, handleCoreStyle]}
            >
              {/* The glyph is drawn as a stacked pair of chevrons; a quarter turn makes them point
                  the way the handle actually travels. */}
              <View style={styles.handleGlyph}>
                <SliderHandleIcon width={13} height={21} color={onAccent} />
              </View>
            </Animated.View>
          </Animated.View>
        </View>

        <View style={styles.endLabels}>
          <Text style={[styles.endLabel, { color: endLabelColor }]}>{minLabel ?? values[0]}</Text>
          <Text style={[styles.endLabel, { color: endLabelColor }]}>
            {maxLabel ?? values[steps - 1]}
          </Text>
        </View>

        {/* Under the bar rather than under the value: it describes the track, and beneath the thing it
            talks about it doesn't come between the number and the scale it belongs to. */}
        <DragHint
          text="Drag left or right to adjust"
          dragged={dragged}
          accent={accent}
          color={endLabelColor}
          style={styles.hint}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Clear of the step name above it. */
  hint: {
    marginTop: HINT_GAP,
  },
  /**
   * Fills whatever the question text leaves, with the value at the top of that space and the track at
   * the bottom of it.
   *
   * Not centred as a block: that left the value stranded in the middle of the page with a void above
   * it. Spread apart, the value sits just under the question where the eye already is, and the track
   * lands in the lower third where a thumb can reach it one-handed — the gap between them is the
   * design's own (Figma has 80 here), rather than dead space above the lot.
   */
  container: {
    flex: 1,
    justifyContent: 'space-between',
    // Clear of the question above it. `space-between` pins the value to the top of this box, which
    // would otherwise sit it directly under the question text.
    paddingTop: 40,
    // Never closer than this, on a screen too short to spread them.
    gap: 40,
  },
  readout: {
    alignItems: 'center',
    // Balances what hangs beneath the value — see `VALUE_TOP_SPACE`.
    paddingTop: VALUE_TOP_SPACE,
  },
  current: {
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
    marginTop: CAPTION_GAP,
    fontSize: 16,
    lineHeight: CAPTION_LINE,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    letterSpacing: tracking.semiBold,
    includeFontPadding: false,
  },
  /**
   * The track, its end labels and the hint.
   *
   * Spaced by each child's own margin rather than a shared `gap`: the row above them carries slack the
   * gap knows nothing about, so the two ends need different numbers to look equal.
   */
  sliderBlock: {
    // Room for the handle to grow past the ends — see `HANDLE_OVERHANG`. Applied to the whole block
    // so the Min/Max labels stay aligned with the track's ends.
    marginHorizontal: HANDLE_OVERHANG,
  },
  /** Holds the track and the handle over it. Not clipped, so the handle can stand proud of the bar. */
  trackArea: {
    height: TRACK_AREA_HEIGHT,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_RADIUS,
    justifyContent: 'center',
    // Keeps the fill's square end clipped to the pill.
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: TRACK_RADIUS,
  },
  /**
   * Fades the marks in and out as a group while the handle is held.
   *
   * The marks set no `top`, so they take their vertical placement from this layer — it has to centre
   * them the way the track itself does, or they pin to the top of the bar.
   */
  ticksLayer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
  },
  tick: {
    position: 'absolute',
    width: TICK_WIDTH,
    height: TICK_HEIGHT,
    borderRadius: TICK_WIDTH / 2,
  },
  handle: {
    position: 'absolute',
    left: 0,
  },
  handleCore: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleGlyph: {
    transform: [{ rotate: '-90deg' }],
  },
  endLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    // Below the track row, so the labels clear the handle at either end — see `LABEL_GAP`.
    marginTop: LABEL_GAP,
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
