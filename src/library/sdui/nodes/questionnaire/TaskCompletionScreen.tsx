import React, { useEffect } from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  SensorType,
  interpolate,
  useAnimatedSensor,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
  type AnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import WellDoneIllustration from '../../../../theme/icons/welldoneillustration.svg';
import BlobAsterisk from '../../../../theme/icons/blobasterisk.svg';
import BlobFlower from '../../../../theme/icons/blobflower.svg';
import BlobPortal from '../../../../theme/icons/blobportal.svg';
import BlobHole from '../../../../theme/icons/blobhole.svg';
import {
  fontFamily,
  layout as layoutTokens,
  mix,
  readableTextColor,
  tracking,
  withAlpha,
  type ThemeColorOverrides,
  type ThemeMode,
} from '../../../../theme/theme';
import { PillButton } from '../../PillButton';
import { ProgressRing, RING_SIZE } from '../../ProgressRing';
import { useTopInset } from '../../useTopInset';
import { useBottomInset } from '../../useBottomInset';

/** Intrinsic size of `welldoneillustration.svg`, used to keep its aspect ratio when scaled to fit. */
const ILLUSTRATION_WIDTH = 323;
const ILLUSTRATION_HEIGHT = 231;

/** Brand → page in dark mode. Not the theme's 0.9, which lands a mid-tone brand on near-black. */
const DARK_SURFACE_DARKEN = 0.35;

/** The reveal: a circle opening from the centre, covering the questions rather than replacing them. */
const REVEAL_MS = 420;

/** The page's contents, held back until the reveal has something to sit on. */
const CONTENT_DELAY = REVEAL_MS - 80;
const CONTENT_MS = 260;

/** The copy follows a beat behind the illustration, so the page has an order to be read in. */
const COPY_DELAY = CONTENT_DELAY + CONTENT_MS;
const COPY_MS = 300;
const COPY_RISE = 14;

/** Beats: the wheel opens, the figure rolls, the wheel collapses. Delays are absolute, not chained. */
const RING_IN_DELAY = COPY_DELAY + COPY_MS;

/** Underdamped, so the ring overshoots slightly and settles — it arrives rather than appears. */
const RING_IN_SPRING = { damping: 11, stiffness: 170, mass: 0.7 } as const;

/** The figure rolls, not counts: the change is one increment, and a one-tick count-up is nothing. */
const SLIDE_DELAY = RING_IN_DELAY + 220;
const SLIDE_MS = 460;

/**
 * The wheel collapses into the pill (Figma 4108:3553) — a cross-fade between two layers on the same
 * centre, not a morph, which React Native cannot do from a circle to a padded row.
 */
const COLLAPSE_DELAY = SLIDE_DELAY + SLIDE_MS + 220;
const COLLAPSE_MS = 420;

/** How small the wheel gets before it is gone. Far enough down to read as collapsing into the pill. */
const COLLAPSE_TO = 0.28;

/** The pill starts a little under size, so it settles outward as the wheel falls away. */
const PILL_FROM = 0.82;

/** The pill's own geometry, from the design. */
const PILL_RING = 26;
const PILL_RING_STROKE = 3.5;
const PILL_BAND = 4;

/** The pill's band: padding outside the fill, never a border — RN paints the background under it. */
const PILL_BAND_ALPHA = 0.5;

/**
 * One slot of the roll, and so its travel. Figures are centred by flexbox, not `lineHeight` — iOS
 * puts a line's extra leading above the glyph, so line height cannot centre.
 */
const ROLL_LINE = 44;

/**
 * The drifting shapes (Figma 4106:3531–3534). Positions are screen fractions, several off the edge so
 * the field reads as continuing. No two `ms` match, or they would fall into step and pulse as one.
 */
const BACKDROP_SHAPES = [
  { Shape: BlobAsterisk, x: -0.24, y: 0.03, size: 0.72, dx: 26, dy: 19, spin: 14, ms: 9_000, delay: 0 },
  { Shape: BlobHole, x: 0.74, y: -0.02, size: 0.4, dx: 21, dy: 29, spin: 10, ms: 12_100, delay: 1_400 },
  { Shape: BlobFlower, x: 0.62, y: 0.34, size: 0.56, dx: 22, dy: 27, spin: -16, ms: 13_700, delay: 2_100 },
  { Shape: BlobPortal, x: -0.08, y: 0.7, size: 0.34, dx: 29, dy: 20, spin: -14, ms: 9_800, delay: 300 },
  { Shape: BlobAsterisk, x: 0.62, y: 0.78, size: 0.62, dx: 19, dy: 24, spin: 12, ms: 14_500, delay: 1_800 },
] as const;

/** Low enough to sit under body text — noticed once the reader has finished reading, as paper is. */
const BACKDROP_ALPHA = 0.12;

/** Slide at full lean, for size 1. Each shape scales it by `size` — larger travels further. */
const TILT_RANGE = 34;

/** The lean that reaches full offset (~23°). Small: a held phone only moves through a few degrees. */
const TILT_LIMIT = 0.4;

/** The reading is noisy at rest, so every frame's target goes through a spring — smoothing, and weight. */
const TILT_SPRING = { damping: 18, stiffness: 52, mass: 1.1 } as const;
const TILT_INTERVAL = 16;

/** The field fades up once the reveal has finished, so nothing is seen outside the opening circle. */
const BACKDROP_DELAY = REVEAL_MS;
const BACKDROP_MS = 600;

interface DriftingShapeProps {
  spec: (typeof BACKDROP_SHAPES)[number];
  screenWidth: number;
  screenHeight: number;
  color: string;
  /** Reduced motion: the shape is placed but never moves. */
  still: boolean;
  /** The phone's lean, already smoothed and in points. Shared by every shape. */
  tiltX: SharedValue<number>;
  tiltY: SharedValue<number>;
}

/**
 * One shape, owning its animation — a component, not styles in a loop, so each view keeps its own
 * `useAnimatedStyle` for life. Reassigning animated styles between views is what made `StepSlider` flash.
 */
function DriftingShape({
  spec,
  screenWidth,
  screenHeight,
  color,
  still,
  tiltX,
  tiltY,
}: DriftingShapeProps) {
  const t = useSharedValue(0);

  useEffect(() => {
    if (still) return;
    // Reversing rather than repeating, so it wanders back and forth instead of snapping to the start.
    t.value = withDelay(
      spec.delay,
      withRepeat(withTiming(1, { duration: spec.ms, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still]);

  const style = useAnimatedStyle(() => ({
    // Drift and tilt are summed, not chained: the shape keeps wandering on its own cycle while the
    // whole field leans with the phone, so neither reads as having interrupted the other.
    transform: [
      { translateX: interpolate(t.value, [0, 1], [-spec.dx, spec.dx]) + tiltX.value * spec.size },
      { translateY: interpolate(t.value, [0, 1], [-spec.dy, spec.dy]) + tiltY.value * spec.size },
      // Only the blobs turn. On a circle it would be invisible; on a lopsided form the slow rotation
      // is what makes it look like it is breathing rather than sliding.
      { rotate: `${interpolate(t.value, [0, 1], [-spec.spin, spec.spin])}deg` },
    ],
  }));

  const size = spec.size * screenWidth;
  const { Shape } = spec;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.backdropShape,
        { left: spec.x * screenWidth, top: spec.y * screenHeight },
        style,
      ]}
    >
      {/* `color`, not `fill`: the exports use `currentColor`, which react-native-svg resolves from it. */}
      <Shape width={size} height={size} color={color} />
    </Animated.View>
  );
}

/** Success haptic as the page opens. `expo-haptics` is optional, hence the lazy `require`. */
function markTheMoment() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const Haptics = require('expo-haptics');
    void Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Success);
  } catch {
    // No haptics available — not worth surfacing.
  }
}

export interface TaskCompletionScreenProps {
  /** The assessment's name, shown where the question count sits during the questionnaire. */
  taskName: string;
  /** The study's own debrief, when the assessment defines one. Sits above the generic thank-you. */
  endText?: string;
  onHome: () => void;
  onCalendar: () => void;
  /**
   * Today's completed tasks and today's scheduled total — the task that opened this screen included,
   * since the host marks it complete off the same event.
   *
   * A total of zero hides the tally: with nothing scheduled there is no progress to show, and a ring
   * with no denominator would have to invent one.
   */
  tasksCompleted?: number;
  tasksTotal?: number;
  /**
   * The two colours the screen inverts between — the questionnaire's brand and its page background.
   *
   * Passed in rather than re-derived from the theme so this screen and the questions it replaces are
   * working from the same pair. Everything else on the screen (muted header text, the progress track,
   * the buttons' accent) is derived from these two, so the inversion can't be half-applied.
   */
  brandColor: string;
  backgroundColor: string;
  mode?: ThemeMode;
  brandColors?: ThemeColorOverrides;
  /** The slide-in transform. Owned by the caller so both halves of the push stay in step. */
  style?: StyleProp<AnimatedStyle<ViewStyle>>;
}

/**
 * The questionnaire's "Well done" screen (Figma 3273:1821). Not a screen the host swaps to — it keeps
 * the questionnaire's header, count reading "Done", so finishing ends the same screen.
 */
export function TaskCompletionScreen({
  taskName,
  endText,
  onHome,
  onCalendar,
  tasksCompleted = 0,
  tasksTotal = 0,
  brandColor,
  backgroundColor,
  mode,
  brandColors,
  style,
}: TaskCompletionScreenProps) {
  /**
   * The palette, inverted: the brand becomes the page, and the page becomes the ink.
   *
   * Finishing is the one moment in the questionnaire that should not look like the questionnaire. The
   * questions are quiet by design — neutral page, brand reserved for the progress bar and the answer —
   * so flipping the two at the end is the loudest thing this screen can do without adding ornament,
   * and it lands in full because the done screen slides in as its own layer.
   *
   * `readableTextColor` rather than the page colour outright: a brand and a page background that were
   * only ever used *apart* need not contrast when stacked. Where they do, the page colour is returned
   * unchanged and the inversion is exact; where they don't, this falls back to whatever reads.
   */
  const surface = mode === 'dark' ? mix(brandColor, '#000000', DARK_SURFACE_DARKEN) : brandColor;
  /**
   * The ink candidate is the manifest's *brand* background, not the page background handed in.
   *
   * In dark mode the page background has itself been taken most of the way to black, so preferring it
   * here would ask for near-black ink on a dark surface, fail the contrast check, and fall back to
   * plain white — correct, but off-brand, and different from what light mode shows. The brand
   * background is the colour the brand was actually chosen against, and it reads on the surface in
   * both modes, so the pairing survives the switch.
   */
  const ink = readableTextColor(surface, {
    preferred: brandColors?.background ?? backgroundColor,
  });
  const inkMuted = withAlpha(ink, 0.7);
  const inkTrack = withAlpha(ink, 0.3);

  const { width, height } = useWindowDimensions();
  const topInset = useTopInset();
  // Just the home indicator, no extra gutter — matching the questionnaire's own footer, so the
  // buttons don't shift as the screens swap. The safe-area inset is already ~34pt on a notched
  // phone, and adding the design's 16 on top left them floating clear of the edge.
  const bottomInset = useBottomInset();

  // Scaled to fit the page, never past its natural size — enlarging an illustration only softens it.
  const illustrationWidth = Math.min(width - 64, ILLUSTRATION_WIDTH);
  const illustrationHeight = (illustrationWidth * ILLUSTRATION_HEIGHT) / ILLUSTRATION_WIDTH;

  /**
   * The reveal circle's diameter: the screen's diagonal, plus a margin.
   *
   * The diagonal is the minimum that covers the corners at scale 1; the margin is there because the
   * window dimensions and the box this is drawn in need not agree to the point — a parent's padding,
   * a safe-area inset, a rounded display — and being a few points short leaves the circle's own edge
   * curving across the screen. Oversizing costs nothing, since the excess is clipped.
   */
  const revealSize = Math.ceil(Math.sqrt(width * width + height * height) * 1.08);

  /** The circle opening out of the centre. 0 = a point, 1 = past every corner. */
  const reveal = useSharedValue(0);
  /** Everything on the page, held back until the reveal has laid a surface down. */
  const content = useSharedValue(0);
  /** Title and copy reveal. */
  const copy = useSharedValue(0);
  /** The tally, which arrives after the copy has settled. */
  const tally = useSharedValue(0);
  /**
   * How far round the ring has swept, 0..1 — today's completed tasks over today's scheduled total.
   *
   * Drives the same `ProgressRing` the data wheel card draws, so a ring is built the same way and
   * means the same thing wherever it appears: how much of a whole is done. It closes only when the
   * day's last task is the one just finished, which is the point — a ring that always completed would
   * say nothing.
   */
  const sweep = useSharedValue(0);
  /** The wheel's scale as it opens: 0 → 1. Independent of the collapse, which follows. */
  const ringScale = useSharedValue(0);
  /** 0 = the old figure showing, 1 = the new one. Drives the roll. */
  const slide = useSharedValue(0);
  /** 0 = the wheel is showing, 1 = it has collapsed into the pill. Drives both layers. */
  const collapse = useSharedValue(0);
  /** The drifting field behind everything, held back until the circle has finished opening. */
  const backdrop = useSharedValue(0);

  /**
   * The figures the roll moves between.
   *
   * `from` is one lower because exactly one task — this one — was just completed. Deriving it from the
   * current value rather than remembering a previous one keeps this screen stateless: it is handed a
   * total and shows the step that produced it, whenever that total happens to settle.
   */
  const rollTo = tasksCompleted;
  const rollFrom = Math.max(0, tasksCompleted - 1);

  const sweepTarget = tasksTotal > 0 ? Math.min(1, rollTo / tasksTotal) : 0;
  const sweepFrom = tasksTotal > 0 ? Math.min(1, rollFrom / tasksTotal) : 0;

  const reducedMotion = useReducedMotion();

  /**
   * The phone's own attitude, read on the UI thread.
   *
   * `useAnimatedSensor` writes straight into a shared value from the native sensor, so the reading
   * never crosses to JS — a tilt that had to round-trip through the bridge at 60Hz would stutter
   * under any other work. Reanimated ships this; there is no extra dependency and no native rebuild.
   *
   * On a device without a gyroscope — the simulator, most notably — the sensor simply never updates
   * and every reading stays at zero, which leaves the field drifting as though this were absent.
   */
  const attitude = useAnimatedSensor(SensorType.ROTATION, { interval: TILT_INTERVAL });

  /**
   * The lean, converted to points and smoothed.
   *
   * `roll` is the tilt left and right, `pitch` forward and back. Both are clamped before scaling, so
   * turning the phone right over parks the field at its limit instead of flinging it off-screen, and
   * the spring does the rest: it filters the sensor's jitter at rest and gives the movement weight,
   * so the shapes lag the phone slightly rather than being nailed to it.
   */
  const tiltX = useDerivedValue(() => {
    if (reducedMotion) return 0;
    const roll = Math.max(-TILT_LIMIT, Math.min(TILT_LIMIT, attitude.sensor.value.roll));
    return withSpring((roll / TILT_LIMIT) * TILT_RANGE, TILT_SPRING);
  });

  const tiltY = useDerivedValue(() => {
    if (reducedMotion) return 0;
    const pitch = Math.max(-TILT_LIMIT, Math.min(TILT_LIMIT, attitude.sensor.value.pitch));
    return withSpring((pitch / TILT_LIMIT) * TILT_RANGE, TILT_SPRING);
  });

  useEffect(() => {
    if (reducedMotion) {
      // The celebration is the one thing here that must not insist. A page expanding out of the middle
      // of the screen is exactly what trips vestibular sensitivity, so this path simply arrives.
      reveal.value = 1;
      content.value = withTiming(1, { duration: CONTENT_MS });
      copy.value = withTiming(1, { duration: COPY_MS });
      tally.value = withTiming(1, { duration: COPY_MS });
      // Shown at its final fill rather than drawn to it: the sweep is the motion, not the value.
      sweep.value = sweepTarget;
      return;
    }

    reveal.value = withTiming(
      1,
      {
        // Decelerating hard: fast out of the centre, easing as it reaches the corners, so the page
        // feels thrown open rather than inflated at a constant rate.
        duration: REVEAL_MS,
        easing: Easing.out(Easing.cubic),
      },
      finished => {
        'worklet';
        if (finished) scheduleOnRN(markTheMoment);
      },
    );

    // Overlaps the tail of the reveal by CONTENT_DELAY's margin — waiting for it to finish outright
    // leaves a beat of empty colour, which reads as a stall rather than a pause.
    content.value = withDelay(CONTENT_DELAY, withTiming(1, { duration: CONTENT_MS }));

    copy.value = withDelay(COPY_DELAY, withTiming(1, { duration: COPY_MS }));

    // Beat one: the block fades in as the ring springs open.
    tally.value = withDelay(RING_IN_DELAY, withTiming(1, { duration: COPY_MS }));
    ringScale.value = withDelay(RING_IN_DELAY, withSpring(1, RING_IN_SPRING));

    // Beat two: the figure rolls, and the arc moves with it. They describe the same increment, so they
    // share a delay and a duration and land on the same frame. The arc is parked at the *previous*
    // fraction first, or it would sweep from nothing and overstate the step.
    slide.value = withDelay(
      SLIDE_DELAY,
      withTiming(1, { duration: SLIDE_MS, easing: Easing.out(Easing.cubic) }),
    );
    sweep.value = sweepFrom;
    sweep.value = withDelay(
      SLIDE_DELAY,
      withTiming(sweepTarget, { duration: SLIDE_MS, easing: Easing.out(Easing.cubic) }),
    );

    // Beat three: the wheel collapses into the pill. One value drives both layers, so they cannot
    // drift apart — whatever the wheel gives up, the pill takes.
    collapse.value = withDelay(
      COLLAPSE_DELAY,
      withTiming(1, { duration: COLLAPSE_MS, easing: Easing.inOut(Easing.cubic) }),
    );

    backdrop.value = withDelay(BACKDROP_DELAY, withTiming(1, { duration: BACKDROP_MS }));
    // The sweep figures are dependencies because today's numbers can arrive after this screen does —
    // the host marks the task complete off the same event that opened it. The other timings are
    // constants, so re-running simply restarts the same sequence against the settled figures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, sweepTarget, sweepFrom]);

  const copyStyle = useAnimatedStyle(() => ({
    opacity: copy.value,
    transform: [{ translateY: (1 - copy.value) * COPY_RISE }],
  }));

  const tallyStyle = useAnimatedStyle(() => ({
    opacity: tally.value,
    transform: [{ translateY: (1 - tally.value) * COPY_RISE }],
  }));

  /**
   * The wheel: it springs open on `ringScale`, then shrinks away on `collapse`.
   *
   * The two are multiplied rather than sequenced, so the collapse works from wherever the spring
   * happened to leave it — including mid-bounce, if the participant finishes fast enough to overlap
   * the beats.
   */
  const wheelStyle = useAnimatedStyle(() => ({
    opacity: ringScale.value * (1 - collapse.value),
    transform: [{ scale: ringScale.value * (1 - collapse.value * (1 - COLLAPSE_TO)) }],
  }));

  /** The pair of figures, lifted by exactly one line so the old leaves as the new arrives. */
  const rollStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -slide.value * ROLL_LINE }],
  }));

  /** The pill: the inverse of the wheel, settling outward from just under size as it takes over. */
  const pillStyle = useAnimatedStyle(() => ({
    opacity: collapse.value,
    transform: [{ scale: PILL_FROM + collapse.value * (1 - PILL_FROM) }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  const revealStyle = useAnimatedStyle(() => ({ transform: [{ scale: reveal.value }] }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: content.value }));

  return (
    <Animated.View style={[styles.screen, style]}>
      {/* The page, as a circle grown from the centre — the only thing painting the background, so the
          questionnaire shows through until it is covered.

          Positioned in points off the window, not at `left/top: 50%`: a percentage resolves against the
          parent's *padding* box, which would shift the circle off the screen's real centre. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.reveal,
          {
            width: revealSize,
            height: revealSize,
            borderRadius: revealSize / 2,
            left: (width - revealSize) / 2,
            top: (height - revealSize) / 2,
            backgroundColor: surface,
          },
          revealStyle,
        ]}
      />

      {/* The drifting field. A sibling of the reveal circle, not a child — a child would scale with it
          and grow from a point rather than being uncovered. Fades up only once the circle has
          finished, or a shape would be seen floating over the questionnaire. */}
      <Animated.View pointerEvents="none" style={[styles.screen, backdropStyle]}>
        {BACKDROP_SHAPES.map((spec, i) => (
          <DriftingShape
            key={i}
            spec={spec}
            screenWidth={width}
            screenHeight={height}
            color={withAlpha(ink, BACKDROP_ALPHA)}
            still={reducedMotion}
            tiltX={tiltX}
            tiltY={tiltY}
          />
        ))}
      </Animated.View>

      <Animated.View style={[styles.body, { paddingTop: topInset + 16 }, contentStyle]}>
        <View style={styles.headerBlock}>
          <View style={styles.countRow}>
            <Text style={[styles.countText, { color: inkMuted }]} numberOfLines={1}>
              {taskName}
            </Text>
            <Text style={[styles.countText, styles.countRight, { color: inkMuted }]}>Done</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: inkTrack }]}>
            <View style={[styles.progressFill, { backgroundColor: ink }]} />
          </View>
        </View>

        <View style={styles.doneBody}>
          <WellDoneIllustration width={illustrationWidth} height={illustrationHeight} />

          <Animated.View style={[styles.copyBlock, copyStyle]}>
            <Text style={[styles.doneTitle, { color: ink }]}>Well done</Text>
            {/* The study's own debrief when the assessment defines one, else the generic thanks. */}
            <Text style={[styles.doneSubtitle, { color: inkMuted }]}>
              {endText || 'Thank you for your continuous support!'}
            </Text>
          </Animated.View>

          {/* Today's progress. Hidden when nothing is scheduled — see `tasksTotal`. */}
          {tasksTotal > 0 ? (
            <Animated.View style={[styles.tally, tallyStyle]}>
              {/* Two layers on the same centre, both driven by `collapse`. The box keeps the wheel's
                  height throughout — animating the layout would shove the copy and footer around. */}
              <Animated.View style={[styles.centreLayer, wheelStyle]} pointerEvents="none">
                <View style={styles.ring}>
                  <View style={styles.centreLayer}>
                    <ProgressRing progress={sweep} color={ink} />
                  </View>

                  {/* Over the ring rather than inside the `Svg`, so the figures stay real text. Both
                      are stacked in a window one slot tall with the overflow clipped; lifting the pair
                      by one slot takes the old out of view as the new comes in. */}
                  <View style={styles.centreLayer}>
                    <View style={styles.roll}>
                      <Animated.View style={rollStyle}>
                        <View style={styles.rollSlot}>
                          <Text style={[styles.tallyValue, { color: ink }]}>{rollFrom}</Text>
                        </View>
                        <View style={styles.rollSlot}>
                          <Text style={[styles.tallyValue, { color: ink }]}>{rollTo}</Text>
                        </View>
                      </Animated.View>
                    </View>
                  </View>
                </View>
              </Animated.View>

              {/* The pill it collapses into (Figma 4108:3553): the same ring at 26pt, the figure, and
                  the label — on a solid fill, so its contents take the *page's* colour back. */}
              <Animated.View style={[styles.centreLayer, pillStyle]} pointerEvents="none">
                {/* The band is an outer box, not a border: React Native paints `backgroundColor` under
                    the border, so a translucent band over the fill would be invisible. Outside, it has
                    only the page behind it. Same trick the slider handles use. */}
                <View
                  style={[styles.pillBand, { backgroundColor: withAlpha(ink, PILL_BAND_ALPHA) }]}
                >
                  <View style={[styles.pill, { backgroundColor: ink }]}>
                    <ProgressRing
                      progress={sweep}
                      color={surface}
                      size={PILL_RING}
                      stroke={PILL_RING_STROKE}
                    />
                    <View style={styles.pillText}>
                      <Text style={[styles.tallyValue, { color: surface }]}>{rollTo}</Text>
                      <Text style={[styles.pillLabel, { color: surface }]}>
                        {tasksCompleted === 1 ? 'Task Completed' : 'Tasks Completed'}
                      </Text>
                    </View>
                  </View>
                </View>
              </Animated.View>
            </Animated.View>
          ) : null}
        </View>
      </Animated.View>

      <Animated.View style={[styles.footer, { paddingBottom: bottomInset }, contentStyle]}>
        <View style={styles.footerButton}>
          <PillButton
            variant="outline"
            label="Home"
            onPress={onHome}
            mode={mode}
            brandColors={brandColors}
            accentColor={ink}
          />
        </View>
        <View style={styles.footerButton}>
          <PillButton
            variant="primary"
            label="Calendar"
            onPress={onCalendar}
            mode={mode}
            brandColors={brandColors}
            accentColor={ink}
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFill,
  },
  backdropShape: {
    position: 'absolute',
  },
  reveal: {
    position: 'absolute',
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 16,
  },
  headerBlock: {
    width: '100%',
    gap: 16,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  countText: {
    flex: 1,
    fontSize: layoutTokens.headingFontSize,
    lineHeight: layoutTokens.headingLineHeight,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  countRight: {
    textAlign: 'right',
  },
  progressTrack: {
    width: '100%',
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  // No radius of its own — the track clips it.
  progressFill: {
    width: '100%',
    height: '100%',
  },
  doneBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  copyBlock: {
    alignItems: 'center',
    gap: 16,
  },
  doneTitle: {
    fontSize: 40,
    lineHeight: 46,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  tally: {
    height: RING_SIZE,
    alignSelf: 'stretch',
    marginTop: 12,
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
  },
  /** A layer filling its parent with its contents centred — the ring, the figures, the pill. */
  centreLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roll: {
    height: ROLL_LINE,
    overflow: 'hidden',
    alignItems: 'center',
  },
  rollSlot: {
    height: ROLL_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBand: {
    padding: PILL_BAND,
    borderRadius: layoutTokens.radiusPill + PILL_BAND,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layoutTokens.gap,
    paddingHorizontal: 16,
    paddingVertical: layoutTokens.gap,
    borderRadius: layoutTokens.radiusPill,
  },
  pillText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pillLabel: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  tallyValue: {
    fontSize: 32,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
    fontVariant: ['tabular-nums'],
  },
  doneSubtitle: {
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layoutTokens.gap,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  footerButton: {
    flex: 1,
  },
});
