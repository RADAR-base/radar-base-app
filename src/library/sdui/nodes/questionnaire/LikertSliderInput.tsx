import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { SelectChoice } from '../../../../types';
import {
  cardShadow,
  fontFamily,
  mix,
  readableTextColor,
  tracking,
  withAlpha,
} from '../../../../theme/theme';
import { useStepHaptics } from '../../useStepHaptics';
import { likertRamp, type PositiveEnd } from './likertScale';
import { plainLabel, richLabel } from './richLabel';

import LikertWorst from '../../../../theme/icons/likertworstemoji.svg';
import LikertBad from '../../../../theme/icons/likertbademoji.svg';
import LikertNeutral from '../../../../theme/icons/likertneutralemoji.svg';
import LikertGood from '../../../../theme/icons/likertgoodemoji.svg';
import LikertBest from '../../../../theme/icons/likertbestemoji.svg';

interface LikertSliderInputProps {
  /** The scale's steps, in the order the definition lists them — worst end first. */
  choices: SelectChoice[];
  /** The chosen choice's `code`, or undefined until the participant answers. */
  value?: string;
  onChange: (code: string) => void;
  primaryColor: string;
  textColor: string;
  /** Manifest accent. Unused for the faces, which carry the scale's own ramp — see `likertRamp`. */
  accentColor?: string;
  /** The track the faces sit on. */
  surfaceColor?: string;
  /**
   * The page behind the control, which the preview's shadow is cast from.
   *
   * The preview is a bare glyph — a filled circle with the features punched out — and a shadow on a
   * transparent wrapper is not portable: iOS derives one from the layer's alpha and gets the circle
   * right, while Android's `boxShadow` follows the view's box and would draw a square behind a round
   * face. A disc of the page's own colour sitting behind the glyph casts the right shape on both,
   * and is invisible where it shows through the features, because it is already what was there.
   */
  backgroundColor?: string;
  /**
   * Which end of the scale is the good one — see `matchLikertScale`, which decides it.
   *
   * Severity is authored best-first ("Not at all" … "Severe") and agreement best-last ("Strongly
   * disagree" … "Strongly agree"), so the faces and the colour ramp are laid along the choices in
   * one direction or the other. Without this a severity scale would put the happy face on "Severe".
   */
  positiveEnd: PositiveEnd;
  /**
   * Asked to hold the page still for the duration of a drag, and to let it go again.
   *
   * Claiming the gesture is not enough on its own. `onShouldBlockNativeResponder` is Android-only,
   * and on iOS the enclosing `ScrollView` is a native view whose own pan recogniser can cancel the
   * touches out from under the JS responder — which arrives here as `onPanResponderTerminate`, not
   * as anything this can refuse. Turning the scroller off for the length of the gesture is the only
   * thing that actually stops the page moving under the finger.
   */
  onScrollLock?: (locked: boolean) => void;
}

/**
 * The five faces, worst to best (Figma 3769:5916). A four-point scale drops the middle one: with no
 * midpoint to sit on, a neutral face would claim a step that the scale says is already leaning.
 */
const FACES = [LikertWorst, LikertBad, LikertNeutral, LikertGood, LikertBest];
const FACES_NO_MIDPOINT = [LikertWorst, LikertBad, LikertGood, LikertBest];

/**
 * The design's geometry, transcribed from a 361pt-wide frame.
 *
 * The track is a 60pt pill and the handle an 85pt disc, so the handle stands 12.5pt proud of the
 * track top and bottom — that overhang is what makes it read as sitting *on* the scale rather than
 * in it, and it is why the row reserves the handle's height rather than the track's.
 */
const TRACK_HEIGHT = 60;
const HANDLE_SIZE = 85;
const FACE_SIZE = 30;
/** The face inside the handle, scaled by the handle's own ratio to the track's faces. */
const HANDLE_FACE = 46;
/**
 * The preview above the scale.
 *
 * The face *is* the preview — no disc behind it. The glyph is a filled circle with the eyes and
 * mouth punched out of it, so colouring the path gives a coloured disc with the page showing through
 * the features, which is the design's composition with one view instead of two.
 */
const PREVIEW_SIZE = 150;
/** The gap between the preview and the scale, from the design (194 − 150). */
const PREVIEW_GAP = 44;

/** The hairline between one step and the next. */
const TICK_WIDTH = 2;
const TICK_HEIGHT = 16;
const TICK_ALPHA = 0.25;

/** How far an unselected face is knocked back toward the track, so the chosen one carries the row. */
const UNSELECTED_MIX = 0.45;

/** How the handle travels, and how the press reads — matched to `ScaleInput`'s own. */
const LAND_SPRING = { damping: 14, stiffness: 110, mass: 0.9 } as const;
const PRESS_MS = 120;

/**
 * The ring the handle wears while it is held: 4pt of its own colour at a fifth, as every other
 * handle in the app does (`SliderInput`, `ArcSliderInput`, and the chip in `ScaleInput`).
 *
 * A band of padding, not a border. React Native paints a background *under* a border, so a
 * translucent stroke over the handle's own fill would simply vanish into it; grown outside the shape
 * as padding, the band has only the track behind it and reads as the halo it is meant to be.
 */
const HANDLE_RING = 4;
const HANDLE_RING_ALPHA = 0.2;

/**
 * The kick the preview gives as the answer changes — `ScaleInput`'s own numbers, so a value landing
 * feels the same wherever it lands. Overshoot on a timing, settle on a lightly damped spring.
 */
const PREVIEW_POP = 1.12;
const PREVIEW_POP_MS = 90;
const PREVIEW_SETTLE = { damping: 9, stiffness: 260, mass: 0.5 } as const;

/** Declared once: a new array each render makes the row re-register its actions every time. */
const ADJUST_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }] as const;

/**
 * A Likert scale drawn as a slider rather than a list of radio rows (Figma 3769:5916).
 *
 * Shown instead of `RadioInput` when the choices are an ordered run of degrees — see `matchLikertScale`,
 * which decides that from the labels. The control is the scale itself: a track carrying a face per
 * step, a handle that lands on the chosen one, and a large preview of it above.
 *
 * Both gestures, as the other sliders take them: tap a step to choose it, or drag the handle along
 * and let it settle. Each face carries its own colour from the theme's ramp, so the scale grades from
 * one end to the other and the answer is legible before the label is read.
 */
export function LikertSliderInput({
  choices,
  value,
  onChange,
  primaryColor,
  textColor,
  surfaceColor,
  backgroundColor,
  positiveEnd,
  onScrollLock,
}: LikertSliderInputProps) {
  const steps = choices.length;
  /**
   * Faces and colours indexed by *choice*, not by position on the ramp.
   *
   * Both run unhappy-to-happy; reversing them for a best-first scale is what puts the happy face on
   * "Not at all" and the unhappy one on "Severe". Done once here so nothing downstream has to
   * remember which way round this scale runs.
   */
  const scale = useMemo(() => {
    const base = steps === 4 ? FACES_NO_MIDPOINT : FACES;
    const colors = likertRamp(steps);
    return positiveEnd === 'first'
      ? { faces: [...base].reverse(), colors: [...colors].reverse() }
      : { faces: base, colors };
  }, [steps, positiveEnd]);
  const { faces, colors } = scale;

  const track = surfaceColor ?? withAlpha(primaryColor, 0.1);

  const tick = useStepHaptics();

  /** The chosen step, or −1 before the participant has answered. */
  const index = choices.findIndex(c => c.code === value);
  const selected = index >= 0 ? index : -1;
  /** Live for the gesture handlers, which are built once and never rebuilt. */
  const indexRef = useRef(selected);
  indexRef.current = selected;

  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setWidth(w);
  }, []);

  /**
   * The centre of a step, in track coordinates.
   *
   * The end steps are inset by half a handle rather than sitting at the track's edges: the handle is
   * wider than a step's share of the track, so centring it on 0 would hang it off the side.
   */
  const centerOf = useCallback(
    (i: number, w: number) => {
      if (steps <= 1) return w / 2;
      const inset = HANDLE_SIZE / 2;
      return inset + ((w - HANDLE_SIZE) * i) / (steps - 1);
    },
    [steps],
  );

  const handleX = useSharedValue(0);
  const press = useSharedValue(0);
  const pop = useSharedValue(1);
  const settled = useRef<string>('');

  /**
   * Park the handle on the answer whenever the answer or the measurement changes.
   *
   * In an effect rather than in the render body: writing a shared value while rendering runs twice
   * under StrictMode, which starts the spring, throws it away and starts it again.
   *
   * Keyed on both, because they mean different things. A new *answer* should travel — that movement
   * is the feedback. A new *width* (a rotation, a re-measure) should not: the handle simply belongs
   * somewhere else now, and springing to it would read as the control answering by itself.
   */
  useEffect(() => {
    if (width <= 0) return;
    const target = centerOf(Math.max(0, selected), width) - HANDLE_SIZE / 2;
    const sameWidth = settled.current.split(':')[1] === String(width);
    const animate = settled.current !== '' && sameWidth;
    settled.current = `${selected}:${width}`;
    handleX.value = animate ? withSpring(target, LAND_SPRING) : target;
  }, [selected, width, centerOf, handleX]);

  /**
   * What the gesture handlers need, read at event time rather than captured.
   *
   * `choices` is a fresh array on every render — `parseChoices` rebuilds it — so a `commit` that
   * closed over it would change identity every render, and with it the `PanResponder`. Rebuilding
   * the responder in the middle of a drag is not something to rely on: the handlers the responder
   * system holds are the ones from the render that granted the gesture.
   */
  const live = useRef({ choices, onChange, steps, onScrollLock });
  live.current = { choices, onChange, steps, onScrollLock };

  const commit = useCallback(
    (next: number) => {
      const { choices: cs, onChange: fire, steps: n } = live.current;
      const clamped = Math.min(n - 1, Math.max(0, next));
      if (clamped !== indexRef.current) {
        indexRef.current = clamped;
        // A tick per step crossed, however it was crossed — dragged, tapped, or stepped by a screen
        // reader — so every route to a value feels the same. Silent if the host has no `expo-haptics`.
        tick();
      }
      fire(cs[clamped].code);
    },
    [tick],
  );

  /**
   * The step under a touch, from a coordinate already relative to this row.
   *
   * Everything drawn inside the row is `pointerEvents="none"`, so the row is always the touch target
   * and `locationX` is measured from its own left edge. That is deliberate: reading window
   * coordinates instead would mean knowing where the row *is*, and this control lives inside
   * `StepSlider`, which parks panels off-screen and slides them in with a transform. A transform
   * fires no layout event, so any position measured at layout time is a screen-width stale — which
   * is exactly what made every touch resolve to the same clamped step.
   */
  const stepFromX = useCallback((x: number) => {
    const { steps: n } = live.current;
    const w = widthRef.current;
    if (w <= 0 || n <= 1) return 0;
    const inset = HANDLE_SIZE / 2;
    const span = w - HANDLE_SIZE;
    const t = span <= 0 ? 0 : (x - inset) / span;
    return Math.round(t * (n - 1));
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Claimed at the capture phase and never given up, as the other sliders do: a horizontal drag
        // is exactly what the page pager reads as a page turn, and it would take the gesture mid-drag.
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: e => {
          live.current.onScrollLock?.(true);
          press.value = withTiming(1, { duration: PRESS_MS });
          commit(stepFromX(e.nativeEvent.locationX));
        },
        onPanResponderMove: e => {
          commit(stepFromX(e.nativeEvent.locationX));
        },
        onPanResponderRelease: () => {
          live.current.onScrollLock?.(false);
          press.value = withTiming(0, { duration: PRESS_MS });
        },
        // Records on termination too: the handle keeps wherever it settled, so leaving the answer
        // behind would put the control and the record in plain disagreement.
        onPanResponderTerminate: () => {
          // Released on termination too, or a cancelled gesture leaves the page locked for good.
          live.current.onScrollLock?.(false);
          press.value = withTiming(0, { duration: PRESS_MS });
          // Only what the handle is already showing. `onPanResponderGrant` has always run by now, so
          // there is a step to keep; the guard is for the case where it somehow hasn't, where
          // committing would put a step in the record that nobody chose.
          if (indexRef.current >= 0) commit(indexRef.current);
        },
      }),
    [commit, press, stepFromX],
  );

  /**
   * The preview kicks whenever the answer changes — but only when it *changes*.
   *
   * Seeded with whatever is selected at mount, so a question returned to with an answer already on
   * it sits still; it is the act of choosing that earns the animation, not the fact of having chosen.
   * Clearing back to nothing is not a choice either, so that doesn't kick.
   */
  const poppedFor = useRef(selected);
  useEffect(() => {
    if (poppedFor.current === selected) return;
    poppedFor.current = selected;
    if (selected < 0) return;
    pop.value = withSequence(
      withTiming(PREVIEW_POP, { duration: PREVIEW_POP_MS }),
      withSpring(1, PREVIEW_SETTLE),
    );
  }, [selected, pop]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  // Unmounting mid-drag — a page turn, a submit — leaves no responder to fire `onPanResponderRelease`,
  // so the lock is lifted here as well. Safe to call when nothing is locked.
  useEffect(() => () => live.current.onScrollLock?.(false), []);

  const handleStyle = useAnimatedStyle(() => {
    const band = HANDLE_RING * press.value;
    const size = HANDLE_SIZE + band * 2;
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      // Grown about its own centre: the band is added on both sides, so the box has to start half a
      // band earlier and higher, or the handle drifts down-right as it is held.
      top: -band,
      transform: [{ translateX: handleX.value - band }],
    };
  });

  const answered = selected >= 0;
  /**
   * The face inside the handle, checked against the step it is sitting on rather than assumed white.
   *
   * The ramp runs red through amber to green, and white on the amber steps is under 2:1 — the face
   * all but disappears at the middle of every scale. This keeps white where it reads and flips to
   * near-black where it doesn't.
   */
  const handleInk = answered
    ? readableTextColor(colors[selected], { preferred: '#FFFFFF' })
    : '#FFFFFF';
  /**
   * Before an answer, the middle face in a flat grey — not the first step's.
   *
   * Showing the end of the scale would read as that end having been chosen, and on a severity scale
   * the first step is the *happy* face, so an untouched question would announce that all is well.
   */
  const PreviewFace = answered ? faces[selected] : faces[Math.floor(steps / 2)];
  const previewColor = answered ? colors[selected] : withAlpha(textColor, 0.2);
  const label = answered ? choices[selected].label : undefined;

  return (
    <View style={styles.container}>
      <View style={styles.preview}>
        <Animated.View style={popStyle}>
          {/* Behind the glyph, never in front: it is the page's colour, so it reads as nothing at
              all — it exists only to give the shadow a circle to follow. Omitted when the host names
              no background, since guessing the colour would put a visible disc behind the face. */}
          {backgroundColor ? (
            <View
              style={[styles.previewShadow, cardShadow, { backgroundColor }]}
              pointerEvents="none"
            />
          ) : null}
          <PreviewFace width={PREVIEW_SIZE} height={PREVIEW_SIZE} color={previewColor} />
        </Animated.View>
        <Text style={[styles.previewLabel, { color: answered ? textColor : withAlpha(textColor, 0.5) }]}>
          {label ? richLabel(label) : 'Choose a point on the scale'}
        </Text>
      </View>

      <View
        style={styles.row}
        onLayout={onLayout}
        {...panResponder.panHandlers}
        // The whole control is one adjustable value, which is what it is: a slider, not five buttons.
        // The faces inside take no touches (see below), so this is also the only accessible element,
        // and increment/decrement is how someone who can't aim at a point on a track moves it.
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={choices.map(c => c.label).join(', ')}
        accessibilityValue={{
          min: 1,
          max: steps,
          now: answered ? selected + 1 : undefined,
          text: answered ? plainLabel(choices[selected].label) : undefined,
        }}
        accessibilityActions={ADJUST_ACTIONS}
        onAccessibilityAction={event => {
          const from = answered ? selected : -1;
          if (event.nativeEvent.actionName === 'increment') commit(from + 1);
          else if (event.nativeEvent.actionName === 'decrement') commit(Math.max(0, from - 1));
        }}
      >
        {/* Nothing drawn inside takes a touch. The row is the control, and making it the only touch
            target is what keeps `locationX` measured from the track's own left edge — see
            `stepFromX`. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={styles.trackWrap}>
            <View style={[styles.track, cardShadow, { backgroundColor: track }]} />
          </View>

          {choices.map((choice, i) => {
            if (i === 0) return null;
            const left = (centerOf(i - 1, width) + centerOf(i, width)) / 2 - TICK_WIDTH / 2;
            return (
              <View
                key={`tick-${choice.code}`}
                style={[styles.tick, { left, backgroundColor: withAlpha(textColor, TICK_ALPHA) }]}
              />
            );
          })}

          {choices.map((choice, i) => {
            const Face = faces[i];
            // The chosen step is drawn by the handle instead, which is larger and sits over it.
            if (i === selected) return null;
            return (
              <View key={choice.code} style={[styles.slot, { left: centerOf(i, width) - FACE_SIZE / 2 }]}>
                <Face
                  width={FACE_SIZE}
                  height={FACE_SIZE}
                  // Knocked toward the track rather than faded: a translucent face would show the
                  // track's own colour through its eyes and mouth, which reads as a smudge.
                  color={mix(colors[i], track, UNSELECTED_MIX)}
                />
              </View>
            );
          })}

          {/* Only once there is an answer. An empty handle parked on the first step covers that
              step's face and reads as though it were already chosen — which is the opposite of
              what an unanswered scale should say. */}
          {width > 0 && answered && (
            <Animated.View
              style={[
                styles.handle,
                { backgroundColor: withAlpha(colors[selected], HANDLE_RING_ALPHA) },
                handleStyle,
              ]}
            >
              {/* Fixed, and centred by the parent — so the ring is simply whatever the grown parent
                  leaves visible around it. No padding to animate, nothing to keep in step. */}
              <View style={[styles.handleCore, cardShadow, { backgroundColor: colors[selected] }]}>
                <PreviewFace width={HANDLE_FACE} height={HANDLE_FACE} color={handleInk} />
              </View>
            </Animated.View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  preview: {
    alignItems: 'center',
    marginBottom: PREVIEW_GAP,
  },
  previewShadow: {
    position: 'absolute',
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: PREVIEW_SIZE / 2,
  },
  previewLabel: {
    marginTop: 16,
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    letterSpacing: tracking.semiBold,
    includeFontPadding: false,
  },
  // The handle's height, not the track's: it stands proud of the track at both edges, and a row sized
  // to the track would clip it.
  row: {
    width: '100%',
    height: HANDLE_SIZE,
    justifyContent: 'center',
  },
  /** Centres the track in the row, which is the taller of the two — see `row`. */
  trackWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  tick: {
    position: 'absolute',
    // Centred on the *track*, which is itself centred in the taller row. Without an explicit `top` an
    // absolutely-positioned child pins to the top of its container — here the full-height row, not the
    // track — which puts the separators above the bar rather than across it.
    top: (HANDLE_SIZE - TICK_HEIGHT) / 2,
    width: TICK_WIDTH,
    height: TICK_HEIGHT,
    borderRadius: TICK_WIDTH,
  },
  slot: {
    position: 'absolute',
    top: (HANDLE_SIZE - FACE_SIZE) / 2,
    width: FACE_SIZE,
    height: FACE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Size, radius and padding are animated — see `handleStyle`. Only the placement lives here.
  handle: {
    position: 'absolute',
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleCore: {
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
