import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

import MicIcon from '../../../../theme/icons/mic.svg';
import ReRecordIcon from '../../../../theme/icons/rerecord.svg';
import {
  fontFamily,
  tracking,
  layout as layoutTokens,
  mix,
  withAlpha,
  readableTextColor,
  type ThemeMode,
} from '../../../../theme/theme';

/** Which of the three screens the speech question is showing. */
export type SpeechPhase = 'idle' | 'recording' | 'recorded';

/** What an answered speech question stores. `uri` is filled in once real capture is wired up. */
export interface SpeechRecording {
  durationMs: number;
  recordedAt: number;
  uri?: string;
  /**
   * The take's amplitude envelope, `ENVELOPE_SIZE` samples of 0..1, so the review screen can draw
   * the shape of what was actually said rather than a stand-in.
   *
   * Optional: a recording made before this existed simply draws flat.
   */
  levels?: number[];
}

/** Recording red — a fixed semantic (design `#E84855`, the palette's red400 / `button.error`). It is
 *  deliberately NOT brand-tinted: "recording" should read the same in every study's theme. */
const RECORD_RED = '#E84855';

/**
 * The read-aloud passage card, drawn in the manifest's accent — the same fill a selected radio
 * option takes (Figma 3872:6306 and 3520:6463, both `color/sky/200`).
 *
 * Accent rather than a fixed teal so a study that themes the app gets a card that belongs to its
 * palette instead of one colour standing outside it.
 *
 * Dark mode is not in the design, which is light-only. The accent at full strength glares against a
 * dark page, so it's mixed most of the way to black and the text takes the accent instead — the same
 * pairing, inverted.
 */
function promptColorsFor(accent: string, mode: ThemeMode) {
  if (mode === 'dark') {
    const background = mix(accent, '#000000', 0.72);
    return { background, text: readableTextColor(background, { preferred: accent }) };
  }
  // White on the accent fill, per the design, and matching `RadioInput`'s selected label — the point
  // of moving this card to the accent is that the two read as the same surface, so they must agree on
  // the text too. Note the same deliberate contrast trade documented there: against the default sky
  // accent white measures 1.86:1, below WCAG AA's 4.5:1. `readableTextColor(accent, { preferred:
  // '#FFFFFF' })` would pick dark instead — change both together if that becomes a problem.
  return { background: accent, text: '#FFFFFF' };
}

/** The 4pt translucent ring around the card while recording (Figma 3520:6463 —
 *  `rgba(126,200,232,0.4)` on `color/sky/200`), the same treatment a selected radio option gets. */
const PROMPT_RING_WIDTH = 4;
const PROMPT_RING_ALPHA = 0.4;

/** Height the passage card takes when there's room for it (~9 lines at the 20/26 type scale, plus
 *  padding). A cap rather than a hard height: the card yields to the recording controls on a short
 *  screen, since it's the one thing here that scrolls and can afford to be smaller. */
const PROMPT_CARD_HEIGHT = 300;

/**
 * Floor for the card once it starts yielding — around four lines plus padding.
 *
 * The recording screen needs roughly 250pt below the card (waveform, timer, hint and the button),
 * so on a shorter phone the card gives up part of `PROMPT_CARD_HEIGHT` to keep the button on
 * screen. It still scrolls, so a shorter card costs reading window, never passage.
 */
const PROMPT_CARD_MIN_HEIGHT = 140;

const WAVEFORM_HEIGHT = 65;
/** Bar thickness, and the gap to the next one. Fixed rather than flexed so the bars stay hairline
 *  thin on any screen, and so one sample advances the row by a known distance (`BAR_STEP`). */
const BAR_WIDTH = 2;
const BAR_GAP = 4;
const BAR_STEP = BAR_WIDTH + BAR_GAP;
/** Height at silence — a visible baseline rather than a gap. */
const MIN_BAR_HEIGHT = 2;

/** The questionnaire page's horizontal padding, which the waveform spans inside. Used only to seed
 *  the bar count before `onLayout` confirms the real width — see `waveWidth`. */
const PAGE_INSET = 16;

/** How often a level arrives, and so how long one bar takes to travel its own width. */
const SAMPLE_MS = 120;

/**
 * Levels stored on the answer, resampled to the screen's bar count when drawn.
 *
 * Fixed so a recording looks the same on any device: the number of bars that fit depends on screen
 * width, but the envelope written to the answer must not.
 */
const ENVELOPE_SIZE = 80;

/**
 * How the waveform stays smooth while the data behind it changes several times a second.
 *
 * The obvious approach — hold levels in React state and `setState` per sample — cannot be made
 * smooth: it re-renders every bar on the JS thread ~8×/sec, and the row stalls whenever that thread
 * is busy. So the levels live in a *shared value* instead, written straight to the UI thread, and
 * each bar reads its own slot from there. Nothing re-renders while recording; only the numbers move.
 *
 * The row is a conveyor rather than a ring: bar `i` always reads slot `i % count`, the row draws
 * every slot twice, and one long linear scroll carries it left. New samples are written into the
 * slot about to enter from the right, so the data flows without the scroll ever restarting.
 */
function LiveBar({
  index,
  levels,
  count,
  color,
}: {
  index: number;
  levels: SharedValue<number[]>;
  /** Number of slots. The row renders `2 * count` bars, so slot `i` appears twice. */
  count: number;
  color: string;
}) {
  // Its own component because `useAnimatedStyle` is a hook and hooks can't run in a loop — the same
  // reason `RadioOption` is split out of `RadioInput`.
  //
  // Scaled, NOT resized. Animating `height` makes every sample relayout the whole row on the UI
  // thread, which is what made this stutter — the original scroll was smooth precisely because it
  // only ever moved a transform. The bar keeps a fixed height and `scaleY` squashes it, which the
  // compositor handles without touching layout.
  const style = useAnimatedStyle(() => {
    const level = levels.value[index % count] ?? 0;
    return { transform: [{ scaleY: Math.max(MIN_BAR_HEIGHT / WAVEFORM_HEIGHT, level) }] };
  });
  return <Animated.View style={[styles.bar, styles.liveBar, { backgroundColor: color }, style]} />;
}

/**
 * One bar of a recorded take: a fixed height from the stored envelope, coloured by whether the
 * playhead has passed it.
 *
 * Deliberately not the live meter — by playback the whole recording exists, so scrolling a rolling
 * window would be fiction. This is the shape of what they actually said, filling in as it plays.
 */
function PlaybackBar({
  index,
  count,
  level,
  progress,
  color,
  pendingColor,
}: {
  index: number;
  count: number;
  level: number;
  progress: SharedValue<number>;
  color: string;
  pendingColor: string;
}) {
  const style = useAnimatedStyle(() => ({
    backgroundColor: (index + 1) / count <= progress.value ? color : pendingColor,
  }));
  return (
    <Animated.View
      style={[styles.bar, { height: Math.max(MIN_BAR_HEIGHT, level * WAVEFORM_HEIGHT) }, style]}
    />
  );
}

/** Average `values` down to `size` buckets — the envelope kept on the answer. */
function downsample(values: number[], size: number): number[] {
  if (values.length === 0) return new Array(size).fill(0);
  return Array.from({ length: size }, (_, i) => {
    const start = Math.floor((i * values.length) / size);
    const end = Math.max(start + 1, Math.floor(((i + 1) * values.length) / size));
    let sum = 0;
    for (let j = start; j < end; j++) sum += values[j];
    return sum / (end - start);
  });
}

/** Transition timings. Matched to the questionnaire's own page slide so the two read as one system. */
const RISE_MS = 260;

const STOP_BUTTON_SIZE = 100;

/**
 * Recording ripple — the pulsing-button motion from the Figma community file (uDv7sa5DAorSoMpyO061GP
 * node 1:70). Its four variant frames show translucent discs growing out from the button and fading
 * as they go, with two in flight at the peak. That's rendered here as a continuous animation rather
 * than four steps, so it reads as one smooth ripple instead of a stepped loop.
 */
const RIPPLE_MS = 1800;
/** How far the disc grows. Reach beyond the button is `STOP_BUTTON_SIZE * (SCALE - 1) / 2` — 25pt
 *  here — and the button's own clearance (`stopWrap`'s margin plus the group's 16pt gap) has to be
 *  at least that, or the ripple laps over the hint pill above it. */
const RIPPLE_MAX_SCALE = 1.5;
const RIPPLE_OPACITY = 0.35;
/** How far below its resting place the recording UI starts when it rises in. */
const RISE_DISTANCE = 48;

/** Height of the fade at the top/bottom edge of the passage card. */
const PROMPT_FADE_HEIGHT = 28;

/** One edge fade over the passage card. Non-interactive, so it never swallows a drag meant for the
 *  text beneath it. */
function PromptFade({ color, edge }: { color: string; edge: 'top' | 'bottom' }) {
  const id = `prompt-fade-${edge}`;
  // Opaque against the card at the outer edge, clear where the text continues.
  const [outer, inner] = edge === 'bottom' ? [0, 1] : [1, 0];
  return (
    <Svg
      pointerEvents="none"
      width="100%"
      height={PROMPT_FADE_HEIGHT}
      style={edge === 'bottom' ? styles.promptFadeBottom : styles.promptFadeTop}
    >
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={outer} />
          <Stop offset="1" stopColor={color} stopOpacity={inner} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

export interface SpeechInputProps {
  /** Passage to read aloud. Hidden when absent. */
  prompt?: string;
  value?: SpeechRecording;
  onChange: (value: SpeechRecording | undefined) => void;
  primaryColor: string;
  textColor: string;
  textSecondaryColor: string;
  mode?: ThemeMode;
  /**
   * Advance to the next question. When omitted the "Continue" card is hidden and the host's own
   * next/finish control drives progression instead.
   */
  onContinue?: () => void;
  /**
   * Reports the current phase so the host can adapt its chrome — the questionnaire keeps its back
   * button on the idle screen but drops the whole footer once recording starts.
   *
   * `transition` marks a phase the participant just caused, as opposed to one derived on mount (e.g.
   * returning to a question that already has a recording). Only the former should animate: a host
   * that inferred it from the phase alone would slide when you merely navigated back to a finished
   * question.
   */
  onPhaseChange?: (phase: SpeechPhase, meta?: { transition?: boolean }) => void;
  /**
   * May the participant play their recording back on the review screen?
   *
   * Defaults to true, so a host that doesn't pass it keeps the play button. When false the review
   * screen still shows the waveform and duration — proof something was captured — but offers only
   * re-record and continue.
   */
  allowReplay?: boolean;
  /**
   * Manifest accent — fills the passage card and rings it while recording, the same fill a selected
   * radio option takes. Falls back to `primaryColor` when a host doesn't set one.
   */
  accentColor?: string;
}

/**
 * Speech (audio) question — Figma 3519:6387 / 3520:6448 / 3528:6585. Three phases:
 *
 *   1. **idle**     — passage card, a hint, and a big brand-colored record button
 *   2. **recording** — live waveform + elapsed timer, hint, and a red stop button inside two
 *      pulsing rings
 *   3. **recorded**  — waveform + timer, a play button, and two cards: re-record / continue
 *
 * ---------------------------------------------------------------------------------------------
 * TODO (audio capture): THIS COMPONENT DOES NOT RECORD ANYTHING YET.
 *
 * No audio library is installed in the project, so the three phases, the timer, the animations and
 * the stored answer shape are all real — but the microphone is never opened and `SpeechRecording.uri`
 * is never set. A participant can complete a speech task and no audio leaves the device.
 *
 * Wiring it up means installing a recorder (`expo-audio`, or `react-native-audio-recorder-player`)
 * and filling in the five `TODO (audio capture)` seams below:
 *
 *   1. `startRecording` — request the mic permission, then start the recorder. Permission can be
 *      refused, which is a state this component has no design for yet: decide whether the question
 *      becomes skippable or shows an explanatory screen.
 *   2. `stopRecording`  — stop the recorder and pass the resulting file's `uri` on the answer, so
 *      `onChange` stores something a host can actually upload.
 *   3. `levels`         — replace the generated pattern with real metering, so the waveform reflects
 *      the participant's voice. Feed `pushLevel` — the ring buffer and per-bar animated styles are
 *      already in place, so nothing re-renders per sample.
 *   4. `isPlaying`      — drive from the player's own state so it clears when playback reaches the
 *      end, not only when the button is pressed a second time.
 *   5. the play button  — start/stop the player; the icon already follows `isPlaying`.
 *
 * Also still open once capture is real: uploading the file (nothing consumes `uri` yet), a maximum
 * recording length, and what happens if the app is backgrounded mid-recording.
 * ---------------------------------------------------------------------------------------------
 */
export function SpeechInput({
  prompt,
  value,
  onChange,
  primaryColor,
  textColor,
  textSecondaryColor,
  mode = 'light',
  onContinue,
  onPhaseChange,
  allowReplay = true,
  accentColor,
}: SpeechInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  /** Position through the take while it plays back, so the timer pill counts rather than sits. */
  const [playElapsedMs, setPlayElapsedMs] = useState(0);
  const playStartedAt = useRef(0);
  // Scroll geometry of the passage card, so it can say when there's more to read. Measured rather
  // than assumed: whether the passage overflows depends on its length and the card's fixed height.
  const [promptOffset, setPromptOffset] = useState(0);
  const [promptViewport, setPromptViewport] = useState(0);
  const [promptContent, setPromptContent] = useState(0);
  // A pixel of slack, so a fractional layout doesn't strand a fade at a hard end.
  const promptCanScrollUp = promptOffset > 1;
  const promptCanScrollDown = promptOffset + promptViewport < promptContent - 1;
  // The chevron keys off whether the passage scrolls at all, not the current position — otherwise it
  // would vanish on reaching the bottom, which reads as a glitch rather than as progress.
  const promptIsScrollable = promptContent > promptViewport + 1;
  // Whether the captured take is playing back. TODO (audio capture) 4/5: drive this from the player's
  // own state so it also clears when the recording reaches its end, not just on a second press.
  const [isPlaying, setIsPlaying] = useState(false);
  const startedAt = useRef(0);

  // How many bars fit. Seeded from the window rather than starting at zero: `onLayout` only reports
  // after the first paint, so waiting for it rendered an empty waveform for a frame and the bars
  // popped in mid-transition. The seed is almost always exact — the row spans the page less its
  // padding — so the measurement usually confirms it and no re-render follows.
  const { width: windowWidth } = useWindowDimensions();
  const [waveWidth, setWaveWidth] = useState(Math.max(0, windowWidth - PAGE_INSET * 2));
  const barCount = waveWidth > 0 ? Math.ceil(waveWidth / BAR_STEP) + 1 : 0;

  // The live meter's slots — see `LiveBar`. Written on the UI thread; never in React state.
  const liveLevels = useSharedValue<number[]>([]);
  // Every sample of the current take, kept on the JS side because the envelope saved to the answer
  // must cover the whole recording, not just the last screenful the ring buffer holds.
  const samples = useRef<number[]>([]);

  /**
   * The most recent level, waiting to be taken up by the next bar.
   *
   * Deliberately a letterbox rather than a queue: the UI thread rotates the ring on its own clock
   * (see the scroll effect), so JS only ever leaves the latest value here. Metering that arrives
   * late, early or at an uneven rate therefore changes *what* a bar shows, never *when* the row
   * moves — which is what kept the old fixed-pattern scroll smooth, and what a JS-driven rotation
   * gave away.
   */
  const incoming = useSharedValue(0);

  /** Record one level (0..1): hand it to the UI thread, and keep it for the envelope. */
  const pushLevel = useCallback(
    (level: number) => {
      samples.current.push(level);
      incoming.value = level;
    },
    [incoming],
  );

  // The sample source. TODO (audio capture) 3/5: replace this interval with the recorder's metering
  // callback — convert its dB reading to 0..1 (roughly `(db + 60) / 60`, clamped) and call
  // `pushLevel`. Everything downstream already treats these as real levels.
  useEffect(() => {
    if (!isRecording || barCount <= 0) return;
    const id = setInterval(() => pushLevel(randomLevel()), SAMPLE_MS);
    return () => clearInterval(id);
  }, [isRecording, barCount, pushLevel]);

  const phase: SpeechPhase = isRecording ? 'recording' : value ? 'recorded' : 'idle';

  // Backstop only — covers a phase this component derives rather than triggers, such as mounting onto
  // a question that already has a recording. Every deliberate transition reports synchronously from
  // its handler below instead; see the note there.
  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  // Two transitions, each tied to one phase change — the idle screen deliberately has none, so the
  // question simply appears. Driven manually rather than with `entering`/`exiting` layout animations,
  // which strand an invisible touch-blocking overlay on Android.
  //
  //   idle → recording  the waveform and stop button rise in from below (`rise`)
  //
  // The recording → recorded slide is owned by `QuestionnaireScreenNode`, which moves the question
  // title along with it. `rise` rests at 1, so a phase that doesn't animate sits still.
  const rise = useSharedValue(1);

  // `useLayoutEffect`, not `useEffect`: an effect runs *after* the frame is painted, so the new phase
  // would show for one frame at its resting position before jumping off-screen to start — a visible
  // flicker. Laying the start value in before paint means the first frame drawn is already offset.
  const previousPhase = useRef<SpeechPhase>(phase);
  useLayoutEffect(() => {
    const changed = previousPhase.current !== phase;
    previousPhase.current = phase;

    // Only animate the transition that just happened; anything else rests in place.
    if (changed && phase === 'recording') {
      rise.value = 0;
      rise.value = withTiming(1, { duration: RISE_MS });
    } else if (phase !== 'recording') {
      rise.value = 1;
    }
  }, [phase, rise]);

  // Two ripples on the same loop, the second half a cycle behind, so there's always one expanding as
  // the other fades — a continuous pulse with no gap or restart. Each runs its progress 0→1 linearly
  // and the easing lives in the derived scale, which keeps the fade perfectly even (easing the
  // progress itself makes the opacity lurch). Cancelled when recording stops, so nothing keeps
  // ticking on the UI thread behind the review screen.
  const ripple = useSharedValue(0);
  const rippleDelayed = useSharedValue(0);
  useEffect(() => {
    if (phase !== 'recording') {
      cancelAnimation(ripple);
      cancelAnimation(rippleDelayed);
      ripple.value = 0;
      rippleDelayed.value = 0;
      return;
    }
    const cycle = () =>
      withRepeat(withTiming(1, { duration: RIPPLE_MS, easing: Easing.linear }), -1, false);
    ripple.value = 0;
    ripple.value = cycle();
    rippleDelayed.value = 0;
    rippleDelayed.value = withDelay(RIPPLE_MS / 2, cycle());
    return () => {
      cancelAnimation(ripple);
      cancelAnimation(rippleDelayed);
    };
  }, [phase, ripple, rippleDelayed]);

  // Grows with an eased-out scale (fast at first, settling as it widens) while fading linearly to
  // nothing, so the disc dissolves rather than vanishing at full size.
  const ripple1Style = useAnimatedStyle(() => {
    const eased = Easing.out(Easing.quad)(ripple.value);
    return {
      opacity: (1 - ripple.value) * RIPPLE_OPACITY,
      transform: [{ scale: 1 + eased * (RIPPLE_MAX_SCALE - 1) }],
    };
  });
  const ripple2Style = useAnimatedStyle(() => {
    const eased = Easing.out(Easing.quad)(rippleDelayed.value);
    return {
      opacity: (1 - rippleDelayed.value) * RIPPLE_OPACITY,
      transform: [{ scale: 1 + eased * (RIPPLE_MAX_SCALE - 1) }],
    };
  });

  // The glide between samples: the row travels exactly one bar over one sample interval, then resets
  // as the ring buffer rotates by one — so the reset lands on the arrangement the travel was heading
  // for and is invisible. Without it the bars would jump a step at a time instead of flowing.
  // Linear easing: any curve would make the scroll surge and stall.
  const scroll = useSharedValue(0);
  useEffect(() => {
    if (!isRecording || barCount <= 0) {
      cancelAnimation(scroll);
      scroll.value = 0;
      return;
    }
    const count = barCount;
    liveLevels.value = new Array(count).fill(0);
    scroll.value = 0;
    // One uninterrupted run across a whole slot set, looped. The row draws every slot twice, so
    // travelling exactly `count` bars lands on an identical arrangement and the wrap is invisible —
    // whatever the data. That is the property the original fixed pattern had, and losing it is what
    // made the scroll glitch: resetting once per sample meant a 6pt jump 8×/sec whenever the reset
    // and the data rotation didn't land on the same frame.
    scroll.value = withRepeat(
      withTiming(-count * BAR_STEP, {
        duration: count * SAMPLE_MS,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
    return () => cancelAnimation(scroll);
  }, [isRecording, barCount, scroll, liveLevels]);

  // New samples land as the scroll crosses each bar boundary — derived from the scroll's own
  // position rather than a separate timer, so the two can never drift apart. A late or irregular
  // sample now only changes which value a bar gets, never the motion.
  useAnimatedReaction(
    () => (barCount > 0 ? Math.floor(-scroll.value / BAR_STEP) : 0),
    (bar: number, previous: number | null) => {
      if (!isRecording || barCount <= 0 || previous === null || bar === previous) return;
      const next = liveLevels.value.slice();
      // The slot about to enter from the right edge.
      next[(bar + barCount - 1) % barCount] = incoming.value;
      liveLevels.value = next;
    },
    [isRecording, barCount],
  );
  const scrollStyle = useAnimatedStyle(() => ({ transform: [{ translateX: scroll.value }] }));

  /** 0..1 playhead over the recorded envelope; 1 at rest, so a take not playing shows in full. */
  const playProgress = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(playProgress);
    if (!isPlaying) {
      playProgress.value = 1;
      return;
    }
    // TODO (audio capture) 4/5: drive this from the player's reported position instead of assuming
    // playback runs to length — a pause or a seek currently won't be reflected.
    playProgress.value = 0;
    playProgress.value = withTiming(1, {
      duration: value?.durationMs ?? 0,
      easing: Easing.linear,
    });
    return () => cancelAnimation(playProgress);
  }, [isPlaying, value?.durationMs, playProgress]);
  // Applied to the recording controls only — the waveform, timer and stop button.
  const riseStyle = useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [{ translateY: (1 - rise.value) * RISE_DISTANCE }],
  }));

  // Drives the elapsed timer only — the waveform scrolls independently on the UI thread. A quarter
  // second is plenty for a seconds-resolution clock and keeps JS-thread work to a minimum.
  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => {
      setElapsedMs(Date.now() - startedAt.current);
    }, 250);
    return () => clearInterval(id);
  }, [isRecording]);

  // The same clock for playback, so the pill counts up through the take instead of sitting on its
  // total. Capped at the duration, and it stops itself at the end.
  //
  // TODO (audio capture) 4/5: both the position and the stop belong to the player — this assumes
  // playback runs start to finish at normal speed, so a pause or a seek won't be reflected.
  useEffect(() => {
    if (!isPlaying) return;
    const total = value?.durationMs ?? 0;
    playStartedAt.current = Date.now();
    setPlayElapsedMs(0);
    const id = setInterval(() => {
      const elapsed = Date.now() - playStartedAt.current;
      setPlayElapsedMs(Math.min(elapsed, total));
      if (elapsed >= total) setIsPlaying(false);
    }, 250);
    return () => clearInterval(id);
  }, [isPlaying, value?.durationMs]);

  // Each handler reports the new phase *synchronously*, in the same batch as its own state change.
  //
  // Reporting from an effect instead would run a frame late: this component would render the review
  // screen while the host still thought recording was in progress, so the host's slide offset wasn't
  // applied yet and the review controls painted in place before jumping off-screen to slide in.
  // Telling the host in the same batch means its layout effect lands before the first paint.
  const startRecording = useCallback(() => {
    // TODO (audio capture) 1/5: request the mic permission and start the recorder here.
    // Permission may be denied — this component has no design for that yet, so it currently proceeds
    // into the recording screen regardless and captures silence. See the block on the component.
    startedAt.current = Date.now();
    setElapsedMs(0);
    // Clear the envelope accumulator so a re-record doesn't inherit the shape of the take it
    // replaces. The ring buffer itself is reset by the scroll effect when `isRecording` flips.
    samples.current = [];
    setIsRecording(true);
    // Not a transition: idle → recording is the rise animation, not a slide.
    onPhaseChange?.('recording');
  }, [onPhaseChange]);

  const stopRecording = useCallback(() => {
    // TODO (audio capture) 2/5: stop the recorder and pass its file `uri` on the answer below —
    // without it the stored `SpeechRecording` has a duration but no audio, so nothing can be uploaded.
    setIsRecording(false);
    onChange({
      durationMs: Date.now() - startedAt.current,
      recordedAt: Date.now(),
      // The whole take averaged down to a fixed size, so the review screen draws this recording's
      // own shape and it survives at the same resolution on any device.
      levels: downsample(samples.current, ENVELOPE_SIZE),
    });
    // `transition` marks this as participant-triggered, which is what arms the host's slide. Reported
    // here rather than left to the backstop effect below, so the host has it before the next paint.
    onPhaseChange?.('recorded', { transition: true });
  }, [onChange, onPhaseChange]);

  const reRecord = useCallback(() => {
    // Clearing the answer re-gates the host's next button until a new take is captured.
    onChange(undefined);
    setIsPlaying(false);
    setElapsedMs(0);
    // Also participant-triggered, so it slides — back the way it came, since the host reads any phase
    // that isn't 'recorded' as the reverse direction.
    onPhaseChange?.('idle', { transition: true });
  }, [onChange, onPhaseChange]);

  const onPrimary = readableTextColor(primaryColor, { preferred: '#FFFFFF' });
  const accent = accentColor ?? primaryColor;
  const promptColors = promptColorsFor(accent, mode);
  // Same colour as the card at rest, so the 4pt band is invisible until recording brings it up —
  // which keeps the card exactly the same size in both states.
  const promptRing = isRecording
    ? withAlpha(accent, PROMPT_RING_ALPHA)
    : promptColors.background;
  const hintBg = withAlpha(primaryColor, 0.1);
  const surfaceBg = withAlpha(primaryColor, 0.1);
  const barColor = isRecording ? withAlpha(primaryColor, 0.55) : withAlpha(textColor, 0.45);

  /** Bars still to be reached by the playhead — the same colour, faded back. */
  const pendingBarColor = withAlpha(textColor, 0.18);

  // Memoised on `barCount` alone: the heights come from a shared value, so these elements are built
  // once when the row is measured and never again while recording.
  // Drawn twice: the second copy is what the first scrolls away to reveal. Slot `i` and slot
  // `i + barCount` are the same value, so the loop point is identical to its start and the wrap
  // never shows an edge.
  const liveBars = useMemo(
    () =>
      Array.from({ length: barCount * 2 }, (_, i) => (
        <LiveBar key={i} index={i} levels={liveLevels} count={barCount} color={barColor} />
      )),
    [barCount, liveLevels, barColor],
  );

  // The recorded take, resampled from the stored envelope to however many bars fit here. A recording
  // captured before `levels` existed has none, so it draws a flat line rather than a fake waveform.
  const playbackBars = useMemo(() => {
    const envelope = value?.levels;
    return Array.from({ length: barCount }, (_, i) => (
      <PlaybackBar
        key={i}
        index={i}
        count={barCount}
        level={envelope?.length ? envelope[Math.floor((i * envelope.length) / barCount)] : 0}
        progress={playProgress}
        color={barColor}
        pendingColor={pendingBarColor}
      />
    ));
  }, [barCount, value?.levels, playProgress, barColor, pendingBarColor]);

  // Counts up while recording, counts up again through playback, and otherwise shows the take's
  // full length — so the pill always says where you are, not just how long it was.
  const duration =
    phase === 'recording'
      ? elapsedMs
      : isPlaying
        ? playElapsedMs
        : (value?.durationMs ?? 0);

  return (
    <Animated.View style={styles.container}>
      {/* The passage is only shown while it still needs reading — once captured, the review controls
          take the space instead (Figma 3528:6585 drops it). */}
      {prompt && phase !== 'recorded' ? (
        // Fixed height so the card never pushes the recording controls around, however long the
        // passage is — longer text scrolls inside it instead. `nestedScrollEnabled` is required for
        // this to scroll on Android, since it sits inside the question's own ScrollView.
        <View style={[styles.promptCard, { backgroundColor: promptRing }]}>
          {/* Two layers, not a border: React Native paints a view's background *under* its border, so
              a translucent border over the same fill renders invisible. The outer view is the ring,
              the inner one the card — the same fix the selected radio option uses. The ring band is
              always there and merely changes colour, so the card is the same size in both states. */}
          <View style={[styles.promptInner, { backgroundColor: promptColors.background }]}>
          <ScrollView
            style={styles.promptScroll}
            contentContainerStyle={styles.promptScrollContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => setPromptOffset(e.nativeEvent.contentOffset.y)}
            onLayout={(e) => setPromptViewport(e.nativeEvent.layout.height)}
            onContentSizeChange={(_w, h) => setPromptContent(h)}
          >
            <Text style={[styles.promptText, { color: promptColors.text }]}>{prompt}</Text>
          </ScrollView>

          {/* Fades against the card's own fill, so the passage dissolves at the edge rather than
              being sliced off — the sign that there's more above or below. */}
          {promptCanScrollUp ? (
            <PromptFade color={promptColors.background} edge="top" />
          ) : null}
          {promptCanScrollDown ? (
            <PromptFade color={promptColors.background} edge="bottom" />
          ) : null}

          {/* A chevron sitting on the bottom fade. Inside the card rather than below it: the card is a
              fixed height and every point outside it is taken from the recording controls. Keyed off
              whether the passage scrolls at all, not the position, so it doesn't blink at the end. */}
          {promptIsScrollable ? (
            <View pointerEvents="none" style={styles.promptChevron}>
              <Svg width={15} height={8} viewBox="0 0 15 8">
                <Path
                  d="M14 1.5 L7.5 6.5 L1 1.5"
                  stroke={promptColors.text}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
            </View>
          ) : null}
          </View>
        </View>
      ) : null}

      {/* Recording: the waveform, timer, hint and stop button are ONE container, so they rise in
          together rather than each animating on its own. */}
      {phase === 'recording' ? (
        <Animated.View style={[styles.riseGroup, riseStyle]}>
          <View style={styles.waveform} onLayout={(e) => {
              // Read out here, not inside the updater: React can run that later, by which point the
              // synthetic event has been recycled and `nativeEvent` is null.
              const width = e.nativeEvent.layout.width;
              setWaveWidth((current) => (Math.abs(current - width) > 1 ? width : current));
            }}>
            <Animated.View style={[styles.waveformRow, scrollStyle]}>{liveBars}</Animated.View>
          </View>
          <View style={[styles.timerPill, { backgroundColor: withAlpha(textColor, 0.12) }]}>
            <Text style={[styles.timerText, { color: textColor }]}>{formatDuration(duration)}</Text>
          </View>
          <View style={[styles.hintPill, { backgroundColor: hintBg }]}>
            <Text style={[styles.hintText, { color: primaryColor }]}>
              Press the button to stop recording
            </Text>
          </View>
          {/* Ripples sit *behind* the button rather than wrapping it: opacity composites down the
              tree, so animating a parent would fade the button along with them. */}
          <View style={styles.stopWrap}>
            <Animated.View
              pointerEvents="none"
              style={[styles.ripple, { backgroundColor: RECORD_RED }, ripple1Style]}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.ripple, { backgroundColor: RECORD_RED }, ripple2Style]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop recording"
              onPress={stopRecording}
              style={({ pressed }) => [
                styles.bigButton,
                { backgroundColor: RECORD_RED },
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.stopSquare} />
            </Pressable>
          </View>
        </Animated.View>
      ) : null}

      {/* Review: waveform + timer again, then the play button. The whole screen slides in, so nothing
          here animates individually. */}
      {phase === 'recorded' ? (
        <View style={styles.reviewGroup}>
          <View style={styles.waveform} onLayout={(e) => {
              // Read out here, not inside the updater: React can run that later, by which point the
              // synthetic event has been recycled and `nativeEvent` is null.
              const width = e.nativeEvent.layout.width;
              setWaveWidth((current) => (Math.abs(current - width) > 1 ? width : current));
            }}>
            <View style={styles.waveformRow}>{playbackBars}</View>
          </View>
          <View style={[styles.timerPill, { backgroundColor: withAlpha(textColor, 0.12) }]}>
            <Text style={[styles.timerText, { color: textColor }]}>{formatDuration(duration)}</Text>
          </View>
          {/* Only when the study allows playback. The waveform and duration above stay either way —
              they're the participant's proof that something was captured, which matters more when
              they can't hear it back. */}
          {allowReplay ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause recording' : 'Play recording'}
              // TODO (audio capture) 5/5: start/stop the player here; the icon already follows `isPlaying`.
              onPress={() => setIsPlaying((playing) => !playing)}
              style={({ pressed }) => [
                styles.bigButton,
                { backgroundColor: primaryColor },
                pressed && styles.pressed,
              ]}
            >
              <Svg width={40} height={40} viewBox="0 0 40 40">
                {isPlaying ? (
                  // Two bars, matched to the play triangle's optical weight and bounds.
                  <>
                    <Rect x={12} y={8} width={6} height={24} rx={2} fill={onPrimary} />
                    <Rect x={24} y={8} width={6} height={24} rx={2} fill={onPrimary} />
                  </>
                ) : (
                  <Polygon points="13,8 33,20 13,32" fill={onPrimary} />
                )}
              </Svg>
            </Pressable>
          ) : null}

          <View style={styles.actions}>
            <View style={[styles.actionCard, { backgroundColor: surfaceBg }]}>
              <Text style={[styles.actionText, { color: primaryColor }]}>
                Press the button to re-record
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Re-record"
                onPress={reRecord}
                style={({ pressed }) => [
                  styles.smallButton,
                  { backgroundColor: primaryColor },
                  pressed && styles.pressed,
                ]}
              >
                <ReRecordIcon width={30} height={30} color={onPrimary} />
              </Pressable>
            </View>

            {onContinue ? (
              <View style={[styles.actionCard, { backgroundColor: surfaceBg }]}>
                <Text style={[styles.actionText, { color: primaryColor }]}>
                  Continue with the rest of the task
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={onContinue}
                  style={({ pressed }) => [
                    styles.continueButton,
                    { backgroundColor: primaryColor },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.continueLabel, { color: onPrimary }]}>Continue</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Idle: hint + the record button. No animation — the question just appears. */}
      {phase === 'idle' ? (
        <>
          <View style={[styles.hintPill, { backgroundColor: hintBg }]}>
            <Text style={[styles.hintText, { color: primaryColor }]}>
              Press the button to begin recording
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Begin recording"
            onPress={startRecording}
            style={({ pressed }) => [
              styles.bigButton,
              { backgroundColor: primaryColor },
              pressed && styles.pressed,
            ]}
          >
            <MicIcon width={44} height={44} color={onPrimary} />
          </Pressable>
        </>
      ) : null}

    </Animated.View>
  );
}

/** Placeholder amplitude, standing in for the recorder's metering until it exists — see the
 *  `TODO (audio capture) 3/5` sample source. */
function randomLevel(): number {
  return 0.15 + Math.random() * 0.85;
}

/** ms → "HH:MM:SS", matching the design's timer pill. */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, '0')).join(':');
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
    // Part of the shrink chain: RN defaults `flexShrink` to 0, so without this the container keeps
    // its full natural height and the card inside it never gets the chance to yield.
    flexShrink: 1,
  },
  promptCard: {
    width: '100%',
    // A definite height that is allowed to shrink. The height is what the ScrollView inside fills —
    // drop it for `maxHeight` alone and that ScrollView has no bounded height to fill and collapses.
    // `flexShrink: 1` then lets the card give way to the controls below, which are laid out at their
    // natural size first, so the stop button stays on screen instead of being pushed off the bottom.
    height: PROMPT_CARD_HEIGHT,
    minHeight: PROMPT_CARD_MIN_HEIGHT,
    flexShrink: 1,
    borderRadius: 24,
    // The ring band. Present in every state — only its colour changes — so switching to recording
    // doesn't resize the card.
    padding: PROMPT_RING_WIDTH,
    // Keeps the scrolling text clipped to the rounded corners.
    overflow: 'hidden',
  },
  /** The card itself, inside the ring. Its radius is the outer one less the band, so the two curves
   *  stay concentric instead of the inner corner looking square. */
  promptInner: {
    flex: 1,
    borderRadius: 24 - PROMPT_RING_WIDTH,
    overflow: 'hidden',
  },
  promptScroll: {
    flex: 1,
  },
  /** Edge fades and the chevron overlay the passage rather than displacing it, so the card's fixed
   *  height stays honest and the text keeps its full width. */
  promptFadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  promptFadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  promptChevron: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  // Padding lives on the content (not the card) so text scrolls fully to the card's edges.
  promptScrollContent: {
    padding: layoutTokens.cardPadding,
  },
  promptText: {
    fontSize: 20,
    // Taller than the font size so descenders aren't clipped on Android.
    lineHeight: 26,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  /** Wrapper for the waveform + timer so they rise in as one block. */
  riseGroup: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  /**
   * The whole review screen as one block: waveform, duration, play button, and the re-record /
   * continue cards.
   *
   * Grouping them means the screen has a single centre. The play button is optional, so with these
   * as loose siblings the set re-centres around whatever is left — and the group keeps its own
   * spacing rather than inheriting the parent's, which also holds the passage card.
   */
  reviewGroup: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  /** Viewport: clips the row so bars scroll in and out of frame rather than appearing at the edges. */
  waveform: {
    width: '100%',
    height: WAVEFORM_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BAR_GAP,
    // Held one step to the left at rest, so the bar sliding in from the right always has a partner
    // leaving on the left and neither edge shows a gap mid-travel.
    marginLeft: -BAR_STEP,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
  },
  /** A live bar is full height and squashed by `scaleY`, so a new sample never triggers layout.
   *  Scaling is symmetric about the centre, which is where `waveformRow` aligns them anyway. */
  liveBar: {
    height: WAVEFORM_HEIGHT,
  },
  timerPill: {
    minWidth: 84,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layoutTokens.cardPadding,
    borderRadius: layoutTokens.radiusPill,
  },
  timerText: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
  },
  hintPill: {
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: layoutTokens.radiusPill,
  },
  hintText: {
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  bigButton: {
    width: STOP_BUTTON_SIZE,
    height: STOP_BUTTON_SIZE,
    borderRadius: STOP_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Sized to the outer ring so the absolutely-positioned rings have a known box to centre in. */
  /** Holds the button plus a fully-expanded ripple, so nothing is clipped as the discs grow. */
  /**
   * Sized to the button, not to the ripple.
   *
   * The ripple is decorative and grows to `RIPPLE_MAX_SCALE` — reserving that much layout meant the
   * block claimed 180pt for a 100pt button, and those 80pt of empty space were enough to push the
   * button past the bottom of `StepSlider`'s (clipping) viewport on a shorter screen. The ripple
   * overflows this box instead, which costs nothing: it's `pointerEvents="none"` and there's more
   * than its 40pt of reach in the gaps around the button.
   */
  stopWrap: {
    width: STOP_BUTTON_SIZE,
    height: STOP_BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    // Clearance for the overflowing ripple, on top of the group's 16pt gap. Both sides clear its
    // 25pt reach; the top gets more so the button reads as separated from the hint pill rather than
    // merely not touching it. Still 40pt cheaper than sizing the box to the ripple, which is what
    // pushed the button off the bottom of the screen.
    marginTop: 28,
    marginBottom: 12,
  },
  ripple: {
    position: 'absolute',
    // Exactly on the button, scaling out from there — the wrap is now the same size, so no manual
    // centring offset is needed. An absolutely positioned child ignores the parent's alignItems.
    top: 0,
    left: 0,
    width: STOP_BUTTON_SIZE,
    height: STOP_BUTTON_SIZE,
    borderRadius: STOP_BUTTON_SIZE / 2,
  },
  stopSquare: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  pressed: {
    opacity: 0.75,
  },
  actions: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 16,
  },
  actionCard: {
    flex: 1,
    minHeight: 146,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: layoutTokens.cardPadding,
    borderRadius: 24,
  },
  actionText: {
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  smallButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButton: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: layoutTokens.cardPadding,
    borderRadius: 24,
  },
  continueLabel: {
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
});
