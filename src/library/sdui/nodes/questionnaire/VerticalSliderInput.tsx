import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  interpolate,
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
import { useBottomInset } from '../../useBottomInset';
import SliderHandleIcon from '../../../../theme/icons/sliderhandle.svg';
import ArrowDownIcon from '../../../../theme/icons/arrowdown.svg';
import {
  fontFamily,
  tracking,
  layout as layoutTokens,
  readableTextColor,
  withAlpha,
} from '../../../../theme/theme';

interface VerticalSliderInputProps {
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
  /**
   * Everything between the slider and the bottom of the window — the host's footer, the safe-area
   * inset it clears, and any padding between the two.
   *
   * The slider sizes itself against the screen, so anything it isn't told about will overlap it.
   * Defaults to a safe-area inset plus the questionnaire screen's Back/Next row.
   */
  bottomReserve?: number;
}

/**
 * The track's thickness.
 *
 * 24, matching `SliderInput` and `ArcSliderInput`, rather than the design's 30. At 30 the same 36pt
 * handle stood only 3pt proud of the bar instead of 6, which read as a smaller handle — and a handle
 * sitting *on* the track rather than in it is what makes it look grabbable.
 */
const TRACK_THICKNESS = 24;
const TRACK_RADIUS = layoutTokens.radiusPill;

/** The handle, at rest and while held. Shared with `SliderInput` and `ArcSliderInput`. */
const HANDLE_SIZE = 36;
const HANDLE_SIZE_PRESSED = 60;
const HANDLE_RING = 4;
const HANDLE_RING_ALPHA = 0.2;

/** The column the track sits in, wide enough for the handle at its largest. */
const TRACK_AREA_WIDTH = HANDLE_SIZE_PRESSED;

/**
 * Step marks across the track — the same 3 × 12 the other two sliders use, turned on their side.
 *
 * Narrower than the design's 5 × 15, which was drawn against its own 30pt bar; on a 24pt track that
 * proportion is heavy, and the three sliders should mark their scales identically.
 */
const TICK_THICKNESS = 3;
const TICK_LENGTH = 12;

/**
 * Track tint behind the fill.
 *
 * Unlike `SliderInput`, this does *not* go neutral grey while held. The design answers a drag by
 * warming the whole page toward the accent instead, and greying the one element the finger is on would
 * pull against that.
 */
const TRACK_ALPHA = 0.25;

/**
 * The step arrows above and below the value (Figma 4019:2472).
 *
 * Deliberately the handle's own constants rather than the design's 34: these are the same kind of
 * thing as the handle — an accent circle you press — so they grow by the same amount, ring by the same
 * amount and take the same time. The glyph inside stays put as the circle grows, exactly as the
 * handle's chevrons do.
 */
const ARROW_GLYPH = 20;
/**
 * The value column as a wheel (Figma 3250:3596, and the picker it's modelled on).
 *
 * The numbers don't swap — they roll. Each sits a row apart and the whole column follows the drag, so
 * the neighbour above grows and darkens into the centre as the value it represents becomes the answer,
 * and the old one shrinks away. That continuity is what a number that merely changes can't give: it
 * shows the scale moving *past* you rather than a figure being replaced.
 *
 * `ROW` is the design's 65pt spacing. `WHEEL_REACH` is how many steps either side are drawn — two is
 * enough to fill the height at the sizes below, and every one drawn costs an animated style.
 */
const ROW = 65;
const WHEEL_REACH = 2;
/** How faint a neighbour is at a full row from the centre, and how small. */
const NEIGHBOUR_ALPHA = 0.28;
const NEIGHBOUR_SIZE = 40;
/** The value's own type size, matched to the other two sliders. */
const VALUE_SIZE = 88;

/**
 * The step's name under the value, and the space above the value that balances it.
 *
 * Only the caption sits below the number, so without the matching space above, the value rides high
 * between the two arrows — the block is symmetric but what's *in* it isn't. Reserving the caption's
 * own height at the top puts the number on the middle of the space it occupies.
 */
const CAPTION_GAP = 8;
const CAPTION_LINE = 20;
const VALUE_TOP_SPACE = CAPTION_GAP + CAPTION_LINE;

/**
 * Fallback for a host that doesn't say: the questionnaire screen's Back / Next row — a 52pt button
 * plus 16pt of padding — and the 28pt of margin between the input and it.
 */
const DEFAULT_FOOTER = 52 + 16 + 28;

/**
 * Breathing room kept above and below the slider inside its budget.
 *
 * Without it the track runs the full distance from the question text to the footer, which reads as
 * wedged between the two. Taking a little off each end leaves the block centred in the space rather
 * than spanning it.
 */
const TRACK_INSET = 32;

/**
 * The shortest the track is allowed to get while climbing toward the middle of the screen.
 *
 * Centring costs travel: the block can only rise by giving up height at its foot, and matching the
 * screen's middle exactly left a 134pt track — accurate, and far too cramped to drag a seven-point
 * scale on. The block rises as far as it can without cutting below this, then stops.
 */
const MIN_TRACK_LENGTH = 240;

/**
 * Gap between the value block and the slider, and between the slider and its end labels.
 *
 * Tighter than the design's 32: the value reads as belonging to the handle beside it, and at 32 the
 * two sat as separate columns with the page's own margin between them.
 */
const BLOCK_GAP = 16;
const LABEL_GAP = 9;
/** Height the end labels take, so the track can be sized around them. Their line height. */
const END_LABEL_HEIGHT = 18;

/** Used when the host names no background. Most pages are light, so white is the safer guess. */
const TICK_FALLBACK = '#FFFFFF';

/** How long the handle takes to grow or settle back. */
const PRESS_MS = 120;

/**
 * How far a finger must travel before the block treats it as a drag rather than a tap.
 *
 * Small enough that a real drag is claimed immediately — before an enclosing ScrollView can read it as
 * a scroll — and large enough that pressing a step arrow isn't mistaken for one.
 */
const DRAG_SLOP = 4;

/** The kick the value gives as it turns over, and how it falls back. */
const VALUE_POP = 1.12;
const VALUE_POP_MS = 90;
const VALUE_SETTLE = { damping: 9, stiffness: 260, mass: 0.5 } as const;

/**
 * How far into the next step the handle must travel before the value follows it, as a fraction of the
 * gap between steps. Above a half, so the number doesn't flip under your thumb mid-decision.
 */
const STEP_HYSTERESIS = 0.7;

/**
 * The straight slider turned on its end (Figma 3997:4140) — the value beside the track, not above it.
 *
 * Worth it over the horizontal one where the scale is the whole question: a thumb sweeps up and down
 * more comfortably than across, and the value sits level with the handle rather than at the top of the
 * page. The scale climbs: **minimum at the foot, maximum at the top**, so raising the handle raises
 * the answer.
 *
 * Everything but the axis is shared with `SliderInput`: the same accent track and fill, the same
 * handle and ring, the same marks that show only while it's held, the same hysteresis while dragging
 * and snap to the nearest step on release.
 */
export function VerticalSliderInput({
  range,
  choices,
  value,
  onChange,
  primaryColor,
  textColor,
  accentColor,
  backgroundColor,
  bottomReserve,
}: VerticalSliderInputProps) {
  const accent = accentColor ?? primaryColor;

  /** A tick per step crossed, however the value was moved. */
  const tick = useStepHaptics();

  // `range` when the definition bounds the scale, its choices when they enumerate it — see
  // `questionScale` for why the definitions need both readings.
  const scale = useMemo(() => questionScale(range, choices), [range, choices]);
  const values = scale.values;
  const steps = values.length;

  /**
   * How far down the window the slider begins.
   *
   * Taken from the window rather than from our own box, which is the whole point: a control that sizes
   * itself from its parent while the parent sizes itself from the control has no stable answer, and
   * the two platforms pick different ones — iOS resolved `flex: 1` against the page and filled it,
   * Android resolved it against our own (initially empty) content and stayed collapsed at ~150pt.
   *
   * This value doesn't depend on our height at all. Only the question text above us moves it.
   */
  const [top, setTop] = useState(0);
  const { height: windowHeight } = useWindowDimensions();
  const safeArea = useBottomInset();
  const frame = useRef<View>(null);

  /**
   * Everything between where we start and the bottom of the screen, less what the host keeps there.
   *
   * Zero until the frame has been located. Without that guard the first render takes `top` as 0 and
   * sizes itself against the whole window — some 700pt rather than 470 — then snaps down a frame later
   * when the measurement lands. Mounting is exactly when a page slide is running, so the correction
   * happened mid-transition and read as the question jumping as it arrived.
   */
  const measured = top > 0;
  const reserve = bottomReserve ?? safeArea + DEFAULT_FOOTER;
  const available = measured ? Math.max(0, windowHeight - top - reserve) : 0;

  /**
   * How far the block has to rise to sit on the screen's middle rather than its own, and how long the
   * track is once the end labels and that rise have taken their share.
   *
   * Centring inside the budget puts the slider halfway between the question text and the footer, which
   * is below the middle of the screen — the title only takes space at the top. Giving up twice the
   * rise at the foot of the box moves the centred block up by exactly that much.
   */
  const { lift, trackLength } = useMemo(() => {
    const forLabels = (END_LABEL_HEIGHT + LABEL_GAP) * 2;
    /** How much height the block can give up before the track gets too short to drag. */
    const spare = Math.max(0, (available - forLabels - MIN_TRACK_LENGTH) / 2);
    const wanted = top + available / 2 - windowHeight / 2;
    const rise = Math.max(0, Math.min(wanted, spare));
    /**
     * Whichever is larger: the rise that centres it, or the inset that keeps it off the question text
     * and the footer. They do the same job at the two ends, so they don't stack.
     */
    const margin = Math.min(Math.max(TRACK_INSET, rise), spare);
    return {
      lift: rise,
      trackLength: Math.max(0, available - margin * 2 - forLabels),
    };
  }, [top, available, windowHeight]);

  const [index, setIndex] = useState(() => {
    if (value == null) return 0;
    const found = values.indexOf(value);
    return found >= 0 ? found : 0;
  });
  const [pressed, setPressed] = useState(false);
  /**
   * Whether the participant has worked out that the whole block is draggable.
   *
   * The track sits in one gutter but the gesture spans the page, which is what makes it reachable with
   * either hand — and is invisible unless it's said. Once they've dragged, the hint has done its job.
   */
  const [dragged, setDragged] = useState(false);

  /** The handle's centre, in points from the top of the track. On the UI thread, so a drag never
   *  waits on React. */
  const offset = useSharedValue(0);
  const press = useSharedValue(0);

  /** Travel available to the handle — the track less its own size, so it stops flush at each end. */
  const travel = Math.max(0, trackLength - HANDLE_SIZE);

  const indexRef = useRef(index);
  indexRef.current = index;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const travelRef = useRef(travel);
  travelRef.current = travel;

  /**
   * Where on the track a step sits.
   *
   * The scale climbs: step 0 is the minimum and sits at the bottom, so a step's distance from the top
   * *falls* as its value rises.
   */
  const positionOf = (i: number) => {
    const span = stepsRef.current > 1 ? i / (stepsRef.current - 1) : 0;
    return HANDLE_SIZE / 2 + (1 - span) * travelRef.current;
  };

  /** Put the handle on a step, animating unless we're placing it for the first time. */
  const settle = (nextIndex: number, animate: boolean) => {
    const y = positionOf(nextIndex);
    offset.value = animate ? withTiming(y, { duration: PRESS_MS }) : y;
  };

  /** True between grabbing the handle and letting go. */
  const dragging = useRef(false);
  /**
   * Put the handle where the value says, when the value changed from outside a drag — arriving on the
   * question, or an answer restored from before.
   *
   * Skipped while dragging: the value follows the handle during a drag, never the other way round, or
   * the handle would be yanked back to the step instead of staying under the finger.
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
  const settleKey = `${index}:${travel}`;
  useEffect(() => {
    if (settledFor.current === settleKey || travel <= 0) return;
    settledFor.current = settleKey;
    if (!dragging.current) settle(index, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settleKey]);

  /** Where the handle sat when the current drag began. */
  const dragStart = useRef(0);

  /** Where the handle is now, as a fractional step. */
  function exactStep(): number {
    const limit = travelRef.current;
    if (limit <= 0) return 0;
    return (1 - (offset.value - HANDLE_SIZE / 2) / limit) * (stepsRef.current - 1);
  }

  /** Place the handle `y` points down the track, and update the value if it has passed a step. */
  function setHandle(y: number) {
    const limit = travelRef.current;
    if (limit <= 0) return;
    offset.value = Math.min(HANDLE_SIZE / 2 + limit, Math.max(HANDLE_SIZE / 2, y));

    const exact = exactStep();
    const from = indexRef.current;
    const delta = exact - from;
    let next = from;
    if (Math.abs(delta) >= 1) {
      // A jump rather than a nudge — a tap further down the track. Follow it straight there.
      next = Math.round(exact);
    } else if (delta > STEP_HYSTERESIS) {
      next = from + 1;
    } else if (delta < -STEP_HYSTERESIS) {
      next = from - 1;
    }
    next = Math.min(stepsRef.current - 1, Math.max(0, next));

    // Only when it crosses into another step — a `setState` per pixel would re-render the value dozens
    // of times a second for no visible gain.
    if (next !== from) {
      indexRef.current = next;
      setIndex(next);
      tick();
    }
  }

  /**
   * Where the track's top edge sits inside the row.
   *
   * The whole row takes the drag, so a touch arrives in the row's coordinates and has to be shifted
   * into the track's before it means anything.
   */
  const trackTop = useMemo(() => {
    const contentHeight = available - lift * 2;
    const column = trackLength + (END_LABEL_HEIGHT + LABEL_GAP) * 2;
    return Math.max(0, (contentHeight - column) / 2) + END_LABEL_HEIGHT + LABEL_GAP;
  }, [available, lift, trackLength]);
  const trackTopRef = useRef(trackTop);
  trackTopRef.current = trackTop;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        /**
         * Claimed on *movement*, not on touch down.
         *
         * A capture handler runs before its descendants, so capturing the touch down swallowed every
         * tap in the block — including the step arrows, which could never fire. Waiting for a few
         * points of travel separates the two gestures: a tap belongs to whatever is under it, a drag
         * belongs to the slider.
         *
         * The move capture still has to be there. This slider is dragged *down the page*, which is
         * exactly what an enclosing ScrollView reads as a scroll, and without taking it at the capture
         * phase the page slides away under the finger. Refusing termination keeps it once taken.
         */
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponderCapture: (_e, gesture) => Math.abs(gesture.dy) > DRAG_SLOP,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: e => {
          dragging.current = true;
          setPressed(true);
          setDragged(true);
          press.value = withTiming(1, { duration: PRESS_MS });
          // Jump to wherever they touched, centring the handle under the finger. The touch is in the
          // row's coordinates — the whole row is grabbable, not just the track — so it shifts into the
          // track's first.
          setHandle(e.nativeEvent.locationY - trackTopRef.current);
          dragStart.current = offset.value;
        },
        onPanResponderMove: (_e, gesture) => {
          // Tracked as a delta from where the drag began rather than from the touch's current
          // position: `locationY` is only meaningful while the finger is inside the view, and a drag
          // that runs past either end of the track would otherwise jump.
          setHandle(dragStart.current + gesture.dy);
        },
        onPanResponderRelease: () => {
          dragging.current = false;
          setPressed(false);
          press.value = withTiming(0, { duration: PRESS_MS });
          // Resolve to the *nearest* step now, not to whatever hysteresis settled on: let go
          // three-quarters of the way to the next step and that is plainly the one you meant.
          const final = Math.min(stepsRef.current - 1, Math.max(0, Math.round(exactStep())));
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

  // The value kicks each time it turns over, so it reads as responding to the handle rather than
  // quietly swapping. Keyed on the step, so it fires once per change however fast the drag is.
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
      // The ring is a *band of padding*, not a border. React Native paints a view's background under
      // its border, so a translucent border over the handle's own fill would render invisible.
      padding: HANDLE_RING * press.value,
      // Centred across the track and on its resting position down it, so the handle swells around
      // itself rather than lurching aside when grabbed.
      left: (TRACK_AREA_WIDTH - size) / 2,
      transform: [{ translateY: offset.value - size / 2 }],
    };
  });
  // The handle proper, inside the ring. Its radius follows the band so the two stay concentric.
  const handleCoreStyle = useAnimatedStyle(() => {
    const size = HANDLE_SIZE + (HANDLE_SIZE_PRESSED - HANDLE_SIZE) * press.value;
    return { borderRadius: (size - HANDLE_RING * press.value * 2) / 2 };
  });
  // Filled from the handle down to the foot of the track — the part of the scale already climbed.
  const fillStyle = useAnimatedStyle(() => ({ top: offset.value }));
  // The step marks are guidance for the drag, so they're only up while there is one — otherwise they
  // clutter a scale nobody is touching.
  const ticksStyle = useAnimatedStyle(() => ({ opacity: press.value }));

  /**
   * Locate the frame in the window.
   *
   * `onLayout` fires whenever the page above us settles or changes size; `measureInWindow` then gives
   * our position on screen, which `onLayout`'s own coordinates — relative to the parent — can't.
   */
  const onMeasure = useCallback(() => {
    frame.current?.measureInWindow((_x, y) => {
      if (Number.isFinite(y)) setTop(current => (Math.abs(y - current) > 1 ? y : current));
    });
  }, []);

  /**
   * Measure before the first paint as well as on layout.
   *
   * `onLayout` fires *after* the frame has been painted, so on its own the slider shows one empty
   * frame and then appears — during a page slide that lands mid-transition and reads as a flicker.
   * `useLayoutEffect` runs before paint, which is the same reason the questionnaire screen uses one to
   * lay in its own slide offset.
   *
   * It doesn't remove the gap entirely: `measureInWindow` answers through a callback, so the value can
   * still arrive a frame late. It closes the common case, and `measured` keeps the uncommon one blank
   * rather than wrong.
   */
  useLayoutEffect(() => {
    onMeasure();
  }, [onMeasure, windowHeight, reserve]);

  /**
   * The neighbouring values, ghosted in while the scale is being moved.
   *
   * Tied to `press` like everything else in the drag state, so they arrive with the handle's growth
   * and leave with it. Faint on purpose — they are context for the number in the middle, not choices
   * in their own right.
   */
  /**
   * Where the wheel is between steps, as a shared value the slots can read.
   *
   * `index` is React state and the drag is on the UI thread, so the worklets can't see it. Mirroring it
   * here lets each slot work out its own distance from the centre without crossing threads.
   */
  const settledIndex = useSharedValue(index);
  useEffect(() => {
    settledIndex.value = index;
  }, [index, settledIndex]);

  /**
   * The handle's position as a fractional step, on the UI thread.
   *
   * `exactStep()` does the same arithmetic on the JS side for the drag handlers; this is the version
   * the wheel's slots read every frame. Both need `travel`, which is layout, so it's mirrored into a
   * shared value rather than closed over.
   */
  const travelShared = useSharedValue(travel);
  const stepsShared = useSharedValue(steps);
  // Written in an effect, not during render — see the note on the settle below.
  useEffect(() => {
    travelShared.value = travel;
    stepsShared.value = steps;
  }, [travel, steps, travelShared, stepsShared]);
  const exactShared = useDerivedValue(() => {
    const limit = travelShared.value;
    if (limit <= 0) return settledIndex.value;
    return (1 - (offset.value - HANDLE_SIZE / 2) / limit) * (stepsShared.value - 1);
  });

  /**
   * A count of steps taken in each direction, which the arrows pulse on.
   *
   * Counters rather than a flag: dragging fast crosses several steps in a row, and a flag would have
   * to be cleared between them. A number that only ever goes up gives each crossing its own effect.
   */
  const [pulses, setPulses] = useState({ up: 0, down: 0 });
  const lastIndex = useRef(index);
  useEffect(() => {
    const was = lastIndex.current;
    if (index === was) return;
    lastIndex.current = index;
    setPulses(p => (index > was ? { ...p, up: p.up + 1 } : { ...p, down: p.down + 1 }));
  }, [index]);

  /**
   * Move one step, for the arrow buttons.
   *
   * The arrows exist because a drag is not the only way anyone will try to use this: they make the
   * direction of the scale explicit, and give a precise single step to someone who finds dragging
   * fiddly. Guarded at the ends so the value can't run off the scale.
   */
  const step = (by: number) => {
    const next = Math.min(steps - 1, Math.max(0, indexRef.current + by));
    if (next === indexRef.current) return;
    indexRef.current = next;
    setIndex(next);
    tick();
    settledFor.current = `${next}:${travelRef.current}`;
    settle(next, true);
    onChange(valuesRef.current[next]);
  };

  const onAccent = readableTextColor(accent, { preferred: '#FFFFFF' });
  // Stronger than the end labels: this one names the answer, they only caption the scale.
  const stepLabelColor = withAlpha(textColor, 0.75);
  // The ends step forward while dragging, so the scale reads as live rather than decorative.
  const endLabelColor = withAlpha(textColor, pressed ? 0.75 : 0.55);
  // The page's own background, so a mark reads as a gap cut through the track rather than a line
  // painted on it — and stays legible over the accent fill as well as the tint behind it.
  const tickColor = backgroundColor ?? TICK_FALLBACK;
  // The value takes the accent while held, alongside the ends stepping forward.
  const valueColor = pressed ? accent : textColor;

  return (
    <View style={styles.container}>
      {/* The drag lives on the whole row, not on the track alone.

          A track pinned to the right gutter is a stretch for a left thumb, and a 60pt strip at the
          edge of the screen is a small target for either hand. Taking the gesture here means the
          handle can be driven from anywhere across the page — including the open space under the
          value — while staying where the design puts it. */}
      <View
        ref={frame}
        style={[styles.body, { height: available, paddingBottom: lift * 2 }]}
        onLayout={onMeasure}
        {...panResponder.panHandlers}
      >
        {!measured ? null : (
          <>
            {/* The value, level with the track rather than above it, with whatever the definition calls
            that step beneath — the design's "Current" over "subtext" (Figma 4019:2472). */}
            <View style={styles.readout}>
              <StepArrow
                direction="up"
                accent={accent}
                onAccent={onAccent}
                disabled={index >= steps - 1}
                onPress={() => step(1)}
                pulse={pulses.up}
              />

              {/* The wheel. One slot per nearby step, each working out its own distance from the
                  centre, so the column rolls with the drag instead of the number swapping. */}
              <Animated.View style={[styles.stack, valueStyle]}>
                {Array.from({ length: WHEEL_REACH * 2 + 1 }, (_, slot) => {
                  const away = slot - WHEEL_REACH;
                  const at = index + away;
                  if (at < 0 || at > steps - 1) return null;
                  return (
                    <WheelSlot
                      key={at}
                      away={away}
                      text={String(values[at])}
                      color={valueColor}
                      settledIndex={settledIndex}
                      exact={exactShared}
                      press={press}
                    />
                  );
                })}
              </Animated.View>

              <Text style={[styles.subtext, { color: stepLabelColor }]} numberOfLines={2}>
                {scale.stepLabels?.[index] ?? ' '}
              </Text>

              <StepArrow
                direction="down"
                accent={accent}
                onAccent={onAccent}
                disabled={index <= 0}
                onPress={() => step(-1)}
                pulse={pulses.down}
              />

              {/* Says what isn't otherwise visible: the track sits in a gutter but the drag spans the
                  page, which is what makes it reachable with either hand. */}
              <DragHint
                text="Drag up or down to adjust"
                dragged={dragged}
                accent={accent}
                color={endLabelColor}
                style={styles.hint}
              />
            </View>

            <View style={styles.sliderColumn}>
              <Text style={[styles.endLabel, { color: endLabelColor }]} numberOfLines={1}>
                {scale.maxLabel ?? values[steps - 1]}
              </Text>

              <View style={[styles.trackArea, { height: trackLength }]}>
                <View
                  style={[styles.track, { backgroundColor: withAlpha(accent, TRACK_ALPHA) }]}
                  pointerEvents="none"
                >
                  {/* How far up the scale the answer sits, drawn behind the marks. */}
                  <Animated.View style={[styles.fill, { backgroundColor: accent }, fillStyle]} />

                  {/* One mark per step, on the travel the handle actually gets, so each sits under the
                  handle's centre at that step. */}
                  <Animated.View style={[styles.ticksLayer, ticksStyle]} pointerEvents="none">
                    {trackLength > 0
                      ? Array.from({ length: steps }, (_, i) => (
                          <View
                            key={i}
                            style={[
                              styles.tick,
                              {
                                top: positionOf(i) - TICK_THICKNESS / 2,
                                backgroundColor: tickColor,
                              },
                            ]}
                          />
                        ))
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
                    {/* The glyph is a stacked pair of chevrons, which already point the way this handle
                    travels — unlike the straight slider's, which turns them a quarter. */}
                    <SliderHandleIcon width={13} height={21} color={onAccent} />
                  </Animated.View>
                </Animated.View>
              </View>

              <Text style={[styles.endLabel, { color: endLabelColor }]} numberOfLines={1}>
                {scale.minLabel ?? values[0]}
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

/**
 * One number on the wheel.
 *
 * Its distance from the centre is `away − (exact − settled)`: the slot's own offset, less how far the
 * drag has carried the column since the value last turned over. When the value does turn over, `away`
 * shifts by one and `settled` shifts with it, so the two cancel and the number keeps moving rather
 * than jumping — which is the whole point of a wheel over a number that swaps.
 *
 * Size is a `scale` transform on one 88pt line rather than an animated `fontSize`: font size is a
 * layout property and would re-measure the text every frame.
 */
function WheelSlot({
  away,
  text,
  color,
  settledIndex,
  exact,
  press,
}: {
  away: number;
  text: string;
  color: string;
  settledIndex: SharedValue<number>;
  exact: SharedValue<number>;
  press: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const drift = exact.value - settledIndex.value;
    const distance = away - drift;
    const near = Math.min(Math.abs(distance), WHEEL_REACH);
    return {
      transform: [
        { translateY: -distance * ROW },
        { scale: interpolate(near, [0, 1], [1, NEIGHBOUR_SIZE / VALUE_SIZE], 'clamp') },
      ],
      /**
       * Faded by distance, and further faded while at rest.
       *
       * At rest only the centre shows — the neighbours are context for a drag, and a column of numbers
       * standing there unprompted reads as a list to choose from. Under the finger they all come up.
       */
      opacity:
        interpolate(near, [0, 1, WHEEL_REACH], [1, NEIGHBOUR_ALPHA, 0], 'clamp') *
        (press.value + (1 - press.value) * (1 - Math.min(Math.abs(distance), 1))),
    };
  });

  return (
    <Animated.Text style={[styles.wheelValue, { color }, style]} numberOfLines={1}>
      {text}
    </Animated.Text>
  );
}

/**
 * One of the two step arrows, which answers a press the way the handle answers a drag.
 *
 * It carries its own `press` value rather than sharing the slider's: these are pressed instead of the
 * track, not as well as it, so a growing arrow and a growing handle would be two things reacting to
 * one touch.
 */
function StepArrow({
  direction,
  accent,
  onAccent,
  disabled,
  onPress,
  pulse,
}: {
  direction: 'up' | 'down';
  accent: string;
  onAccent: string;
  disabled: boolean;
  onPress: () => void;
  /**
   * Bumped every time the value moves this way, however it was moved.
   *
   * Dragging the track is the same event as pressing the arrow, so the arrow answers for both: it
   * swells and settles on each step, which points out which way the scale just went.
   */
  pulse: number;
}) {
  const press = useSharedValue(0);
  const firstPulse = useRef(true);
  useEffect(() => {
    if (firstPulse.current) {
      // Arriving on the question isn't a step — don't pulse on mount.
      firstPulse.current = false;
      return;
    }
    press.value = withSequence(
      withTiming(1, { duration: PRESS_MS / 2 }),
      withTiming(0, { duration: PRESS_MS }),
    );
  }, [pulse, press]);

  const ringStyle = useAnimatedStyle(() => {
    const size = HANDLE_SIZE + (HANDLE_SIZE_PRESSED - HANDLE_SIZE) * press.value;
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      // The ring is a band of padding, not a border — see the handle's own note.
      padding: HANDLE_RING * press.value,
    };
  });
  const coreStyle = useAnimatedStyle(() => {
    const size = HANDLE_SIZE + (HANDLE_SIZE_PRESSED - HANDLE_SIZE) * press.value;
    return { borderRadius: (size - HANDLE_RING * press.value * 2) / 2 };
  });

  return (
    <Pressable
      onPressIn={() => {
        press.value = withTiming(1, { duration: PRESS_MS });
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: PRESS_MS });
      }}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={direction === 'up' ? 'Increase' : 'Decrease'}
      accessibilityState={{ disabled }}
      // At the end of the scale it stays in place and fades, so the column doesn't resize when the
      // answer reaches a limit.
      style={[styles.arrowHit, disabled && styles.arrowDisabled]}
    >
      <Animated.View
        style={[
          styles.arrowRing,
          { backgroundColor: withAlpha(accent, HANDLE_RING_ALPHA) },
          ringStyle,
        ]}
      >
        <Animated.View style={[styles.arrowCore, { backgroundColor: accent }, coreStyle]}>
          <View style={direction === 'up' ? styles.arrowUp : undefined}>
            <ArrowDownIcon width={ARROW_GLYPH} height={ARROW_GLYPH} color={onAccent} />
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  /**
   * The value and the slider side by side, centred against each other.
   *
   * Given an explicit height measured down to the footer, not `flex: 1` — see the note on `top`. Its
   * bottom padding is what lifts the centred contents onto the middle of the screen; see `lift`.
   */
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BLOCK_GAP,
  },
  readout: {
    flex: 1,
    alignItems: 'center',
    // The design's spacing between the arrows and the value block.
    gap: 16,
  },
  /** The value with its two ghosted neighbours, stacked. */
  /**
   * The wheel's window.
   *
   * Holds exactly one line: every slot is absolutely placed within it and offset by its own distance
   * from the centre, so the column can roll without the block changing height.
   */
  stack: {
    height: VALUE_SIZE,
    // Balances the caption below it — see `VALUE_TOP_SPACE`.
    marginTop: VALUE_TOP_SPACE,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  wheelValue: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: VALUE_SIZE,
    lineHeight: VALUE_SIZE,
    // Fixed-width digits. Proportional ones give `1` far wider side bearings than `4`, so a centred
    // numeral looks off-centre — and the column would shift sideways as it rolled.
    fontVariant: ['tabular-nums'],
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  /**
   * Sized for the circle at its largest, so growing on press doesn't shift the column.
   *
   * The same reservation the track area makes for the handle — the circle swells inside a box that
   * was always this big, rather than pushing the value up and down each time it's pressed.
   */
  arrowHit: {
    alignItems: 'center',
    justifyContent: 'center',
    width: HANDLE_SIZE_PRESSED,
    height: HANDLE_SIZE_PRESSED,
  },
  arrowDisabled: {
    opacity: 0.3,
  },
  arrowRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowCore: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  /** The exported asset points down; the upper arrow is the same glyph turned over. */
  arrowUp: {
    transform: [{ rotate: '180deg' }],
  },
  current: {
    // Matched to `SliderInput` and `ArcSliderInput`, so the three read as one control in three shapes.
    // Larger than the design's 40, which was sized for its own screen rather than this family.
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
   * What the definition calls the step, under the value.
   *
   * Always rendered, even when the step has no name — most scales name only their ends, and letting
   * the line collapse would bounce the value as the handle crossed into an unnamed step.
   */
  subtext: {
    marginTop: CAPTION_GAP,
    fontSize: 16,
    lineHeight: CAPTION_LINE,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    letterSpacing: tracking.semiBold,
    includeFontPadding: false,
  },
  sliderColumn: {
    alignItems: 'center',
    gap: LABEL_GAP,
  },
  endLabel: {
    fontSize: 14,
    // Taller than the font size so descenders aren't clipped on Android.
    lineHeight: END_LABEL_HEIGHT,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  /** Clear of the step name above it. The pill itself is `DragHint`'s. */
  hint: {
    marginTop: 20,
  },
  /** Holds the track and the handle over it. Not clipped, so the handle can stand proud of the bar. */
  trackArea: {
    width: TRACK_AREA_WIDTH,
    alignItems: 'center',
  },
  track: {
    width: TRACK_THICKNESS,
    flex: 1,
    borderRadius: TRACK_RADIUS,
    // Keeps the fill's square end clipped to the pill.
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: TRACK_RADIUS,
  },
  /**
   * Fades the marks in and out as a group while the handle is held.
   *
   * The marks set no `left`, so they take their placement across the track from this layer — it has to
   * centre them the way the track itself would, or they pin to one edge.
   */
  ticksLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
  },
  tick: {
    position: 'absolute',
    width: TICK_LENGTH,
    height: TICK_THICKNESS,
    borderRadius: TICK_THICKNESS / 2,
  },
  handle: {
    position: 'absolute',
    top: 0,
  },
  handleCore: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
