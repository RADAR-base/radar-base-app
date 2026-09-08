import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Polygon, Rect } from 'react-native-svg';

import MicIcon from '../../../../theme/icons/mic.svg';
import ReRecordIcon from '../../../../theme/icons/rerecord.svg';
import {
  fontFamily,
  tracking,
  layout as layoutTokens,
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
}

/** Recording red — a fixed semantic (design `#E84855`, the palette's red400 / `button.error`). It is
 *  deliberately NOT brand-tinted: "recording" should read the same in every study's theme. */
const RECORD_RED = '#E84855';

/** The read-aloud passage card. Teal is fixed rather than brand-derived so the passage stays visually
 *  distinct from the brand-colored controls around it (Figma `color/teal/200` + `color/teal/700`). */
const PROMPT_COLORS = {
  light: { background: '#C8F0E2', text: '#0F6E56' },
  dark: { background: '#04342C', text: '#C8F0E2' },
} as const;

/** Fixed height of the passage card (~4 lines at the 20/26 type scale, plus padding). Fixed rather
 *  than content-sized so the record button never shifts position between questions. */
const PROMPT_CARD_HEIGHT = 140;

const WAVEFORM_HEIGHT = 65;
/** Bar thickness, and the gap to the next one. Fixed rather than flexed so the bars stay hairline
 *  thin on any screen, and so one sample advances the row by a known distance (`BAR_STEP`). */
const BAR_WIDTH = 2;
const BAR_GAP = 4;
const BAR_STEP = BAR_WIDTH + BAR_GAP;
/** Enough bars to overfill the widest phone, since the row is clipped to the viewport. */
const BAR_COUNT = 80;
/** Height at silence — a visible baseline rather than a gap. */
const MIN_BAR_HEIGHT = 2;

/** How long one bar takes to travel its own width — i.e. the apparent scroll speed. */
const WAVEFORM_TICK_MS = 120;
/**
 * The waveform is one fixed pattern scrolled continuously, drawn twice so the loop is seamless.
 *
 * The obvious approach — shift an array of levels on a `setInterval` and re-render — cannot be made
 * smooth: it re-renders every bar on the JS thread several times a second, and `setInterval` fires
 * late whenever that thread is busy, so the row stalls and jerks. Here nothing re-renders at all;
 * a single `translateX` runs on the UI thread and is immune to JS-thread jank.
 */
const PATTERN_COUNT = 80;
const PATTERN_WIDTH = PATTERN_COUNT * BAR_STEP;
const PATTERN_MS = PATTERN_COUNT * WAVEFORM_TICK_MS;

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
const RIPPLE_MAX_SCALE = 1.8;
const RIPPLE_OPACITY = 0.35;
/** Composed once. `Easing.out(...)` builds a new function each call, so constructing it inside an
 *  animated style would rebuild it on the UI thread every frame. */
const RIPPLE_EASING = Easing.out(Easing.quad);
/** Box around the button, big enough to hold a ripple at full size without clipping. */
const STOP_WRAP_SIZE = STOP_BUTTON_SIZE * RIPPLE_MAX_SCALE;
/** How far below its resting place the recording UI starts when it rises in. */
const RISE_DISTANCE = 48;

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
}

/**
 * Speech (audio) question — Figma 3519:6387 / 3520:6448 / 3528:6585. Three phases:
 *
 *   1. **idle**     — passage card, a hint, and a big brand-colored record button
 *   2. **recording** — live waveform + elapsed timer, hint, and a red stop button inside two
 *      pulsing rings
 *   3. **recorded**  — waveform + timer, a play button, and two cards: re-record / continue
 *
 * NOTE: no audio library is installed in this project yet, so this drives the full UI and timing but
 * does not capture microphone input. The three `TODO (audio capture)` seams below are the only places
 * that need wiring once `expo-audio` (or similar) is added — the phases, timer and stored answer shape
 * are already correct.
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
}: SpeechInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  // Whether the captured take is playing back. TODO (audio capture): drive this from the player's
  // own state so it also clears when the recording reaches its end, not just on a second press.
  const [isPlaying, setIsPlaying] = useState(false);
  // Generated once. TODO (audio capture): drive these from real metering, at which point the bars
  // become data again — keep the scroll on the UI thread and update heights separately.
  const levels = useMemo(
    () => Array.from({ length: PATTERN_COUNT }, () => randomLevel()),
    [],
  );
  const startedAt = useRef(0);

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
    const eased = RIPPLE_EASING(ripple.value);
    return {
      opacity: (1 - ripple.value) * RIPPLE_OPACITY,
      transform: [{ scale: 1 + eased * (RIPPLE_MAX_SCALE - 1) }],
    };
  });
  const ripple2Style = useAnimatedStyle(() => {
    const eased = RIPPLE_EASING(rippleDelayed.value);
    return {
      opacity: (1 - rippleDelayed.value) * RIPPLE_OPACITY,
      transform: [{ scale: 1 + eased * (RIPPLE_MAX_SCALE - 1) }],
    };
  });

  // One uninterrupted travel across a full pattern width, looped. Because the pattern is drawn twice,
  // the reset back to 0 lands on an identical arrangement, so the loop is invisible. Linear easing —
  // any curve would make the scroll surge and stall. Freezing (rather than resetting) on stop leaves
  // the captured waveform where it was for the review screen.
  const scroll = useSharedValue(0);
  useEffect(() => {
    if (!isRecording) {
      cancelAnimation(scroll);
      return;
    }
    scroll.value = 0;
    scroll.value = withRepeat(
      withTiming(-PATTERN_WIDTH, { duration: PATTERN_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(scroll);
  }, [isRecording, scroll]);
  const scrollStyle = useAnimatedStyle(() => ({ transform: [{ translateX: scroll.value }] }));
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

  // Each handler reports the new phase *synchronously*, in the same batch as its own state change.
  //
  // Reporting from an effect instead would run a frame late: this component would render the review
  // screen while the host still thought recording was in progress, so the host's slide offset wasn't
  // applied yet and the review controls painted in place before jumping off-screen to slide in.
  // Telling the host in the same batch means its layout effect lands before the first paint.
  const startRecording = useCallback(() => {
    // TODO (audio capture): request the mic permission and start the recorder here.
    startedAt.current = Date.now();
    setElapsedMs(0);
    setIsRecording(true);
    // Not a transition: idle → recording is the rise animation, not a slide.
    onPhaseChange?.('recording');
  }, [onPhaseChange]);

  const stopRecording = useCallback(() => {
    // TODO (audio capture): stop the recorder and pass its file `uri` through on the answer.
    setIsRecording(false);
    onChange({ durationMs: Date.now() - startedAt.current, recordedAt: Date.now() });
    onPhaseChange?.('recorded', { transition: true });
  }, [onChange, onPhaseChange]);

  const reRecord = useCallback(() => {
    // Clearing the answer re-gates the host's next button until a new take is captured.
    onChange(undefined);
    setIsPlaying(false);
    setElapsedMs(0);
    onPhaseChange?.('idle', { transition: true });
  }, [onChange, onPhaseChange]);

  const onPrimary = readableTextColor(primaryColor, { preferred: '#FFFFFF' });
  const promptColors = PROMPT_COLORS[mode];
  const hintBg = withAlpha(primaryColor, 0.1);
  const surfaceBg = withAlpha(primaryColor, 0.1);
  const barColor = isRecording ? withAlpha(primaryColor, 0.55) : withAlpha(textColor, 0.45);

  // Memoised, and drawn twice: the second copy is what the first scrolls away to reveal, so the loop
  // never shows an edge. Without the memo every timer tick would rebuild 160 views.
  const bars = useMemo(
    () =>
      [...levels, ...levels].map((level, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            { height: Math.max(MIN_BAR_HEIGHT, level * WAVEFORM_HEIGHT), backgroundColor: barColor },
          ]}
        />
      )),
    [levels, barColor],
  );

  const duration = phase === 'recording' ? elapsedMs : (value?.durationMs ?? 0);

  return (
    <Animated.View style={styles.container}>
      {/* The passage is only shown while it still needs reading — once captured, the review controls
          take the space instead (Figma 3528:6585 drops it). */}
      {prompt && phase !== 'recorded' ? (
        // Fixed height so the card never pushes the recording controls around, however long the
        // passage is — longer text scrolls inside it instead. `nestedScrollEnabled` is required for
        // this to scroll on Android, since it sits inside the question's own ScrollView.
        <View style={[styles.promptCard, { backgroundColor: promptColors.background }]}>
          <ScrollView
            style={styles.promptScroll}
            contentContainerStyle={styles.promptScrollContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            <Text style={[styles.promptText, { color: promptColors.text }]}>{prompt}</Text>
          </ScrollView>
        </View>
      ) : null}

      {/* Recording and review share one block, so the waveform is never unmounted between them.
          That matters: it's ~160 views, and tearing them down and rebuilding them mid-transition is
          enough JS-thread work to drop frames and make the slide look choppy. Only the hint and the
          big button differ, so only those swap.

          `riseStyle` rests at identity outside the recording phase, so the review screen isn't
          offset by it — the recording phase alone rises in. */}
      {phase !== 'idle' ? (
        <Animated.View style={[styles.riseGroup, riseStyle]}>
          <View style={styles.waveform}>
            <Animated.View style={[styles.waveformRow, scrollStyle]}>{bars}</Animated.View>
          </View>
          <View style={[styles.timerPill, { backgroundColor: withAlpha(textColor, 0.12) }]}>
            <Text style={[styles.timerText, { color: textColor }]}>{formatDuration(duration)}</Text>
          </View>

          {phase === 'recording' ? (
            <>
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
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause recording' : 'Play recording'}
              // TODO (audio capture): start/stop the player here; the icon already follows `isPlaying`.
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
          )}
        </Animated.View>
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

      {phase === 'recorded' ? (
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
      ) : null}
    </Animated.View>
  );
}

/** A resting waveform — a flat line until real levels arrive. */
function flatLevels(): number[] {
  return Array.from({ length: BAR_COUNT }, () => 0.06);
}

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
  },
  promptCard: {
    width: '100%',
    height: PROMPT_CARD_HEIGHT,
    borderRadius: 24,
    // Keeps the scrolling text clipped to the rounded corners.
    overflow: 'hidden',
  },
  promptScroll: {
    flex: 1,
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
  stopWrap: {
    width: STOP_WRAP_SIZE,
    height: STOP_WRAP_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple: {
    position: 'absolute',
    // Starts exactly on the button and scales out from there. Centred by hand — an absolutely
    // positioned child ignores the parent's alignItems.
    top: (STOP_WRAP_SIZE - STOP_BUTTON_SIZE) / 2,
    left: (STOP_WRAP_SIZE - STOP_BUTTON_SIZE) / 2,
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
