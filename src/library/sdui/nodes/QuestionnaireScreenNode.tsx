import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useCoreServices } from '../../../core/CoreServicesContext';
import { EVENTS } from '../../../core/EventBus';
import type { Question, QuestionnaireResult, QuestionTimestamp } from '../../../types';
import {
  fontFamily,
  tracking,
  getColorTokens,
  readableTextColor,
  resolveBackground,
  withAlpha,
  type ThemeMode,
} from '../../../theme/theme';
import WellDoneIllustration from '../../../theme/icons/welldoneillustration.svg';
import type { NodeProps } from '../types';
import { QuestionRenderer } from './questionnaire/QuestionRenderer';
import { speechContent } from './questionnaire/speechContent';
import type { SpeechPhase } from './questionnaire/SpeechInput';
import { evaluateBranchingLogic } from './questionnaire/branchingLogic';
import { PillButton } from '../PillButton';
import { useTopInset } from '../useTopInset';
import { useBottomInset } from '../useBottomInset';
import { StepSlider } from '../StepSlider';

/** Page-transition duration (ms). Shared by the question slide and the progress bar so they move
 *  together. Matches `StepSlider`'s own default. */
const SLIDE_DURATION = 260;

/**
 * Ceiling for a speech question's passage window — around thirteen lines of the 24/30 title type.
 *
 * Only an upper bound: `titleScroll` is `flexShrink: 1`, so the passage already takes just what the
 * recording controls leave over and shrinks below this on a short screen. Raising it therefore only
 * affects screens with room to spare, and can't push the stop button off the page.
 */
const PASSAGE_MAX_HEIGHT = 400;


/** Height of the fade at the edge of the scrollable passage. */
const PASSAGE_FADE_HEIGHT = 28;

/** Gap between a panel's heading block and its input. */
const PANEL_GAP = 16;

/**
 * Vertical space the footer covers: `PillButton`'s 52pt minimum plus the footer's own top padding.
 *
 * The footer is positioned over the page rather than laid out above it, so mounting or dropping it
 * can't resize the panels. Every panel reserves this much instead — whatever screen it is — which is
 * what keeps the layout identical with the footer up or down. Add the bottom inset at the call site.
 */
const FOOTER_RESERVE = 52 + 16;

/**
 * Standing instruction above a speech question's passage, used when the study authored no
 * `section_header` for it.
 *
 * The passage is just the text to be read — on its own it never says what to do with it, so without
 * this the screen opens as a wall of prose above a record button. Studies that write their own
 * `section_header` keep it; this only fills the gap.
 */
const SPEECH_DEFAULT_HEADER = 'Read the passage below aloud';

/**
 * Line under the heading on the speech review screen, where the passage used to be.
 *
 * The review screen drops the passage (there's nothing left to read) but keeps the heading, so the
 * participant still knows which task they're in — this says what the screen is now for.
 */
const SPEECH_REVIEW_SUBTEXT = 'Take a listen. You can re-record if you would like another go';

/**
 * The same line for a study that doesn't allow playback — there's nothing to listen to, so it points
 * at the only two things the screen still offers.
 */
const SPEECH_REVIEW_SUBTEXT_NO_REPLAY =
  'Your recording is saved. You can re-record if you would like another go';

/**
 * TESTING: force the no-replay screen on, regardless of what the definition says.
 *
 * `allow_replay_speech` isn't in the published questionnaire definitions yet, so flip this to true to
 * see the no-play-button variant. Leave it false — it's a development switch, not a study setting.
 */
const FORCE_NO_REPLAY_FOR_TESTING = false;

/**
 * Whether a speech question offers playback of the take just recorded.
 *
 * Absent means allowed: replay is the default, so definitions written before this field existed keep
 * the play button. Only an explicit negative removes it, accepted as a real boolean or as one of the
 * strings REDCap-style definitions use for one ('n', 'no', 'false', '0'), since a JSON definition
 * that came from a spreadsheet rarely carries true booleans.
 */
function isReplayAllowed(question?: Question): boolean {
  if (FORCE_NO_REPLAY_FOR_TESTING) return false;
  const raw = question?.allow_replay_speech;
  if (raw === undefined || raw === null) return true;
  if (typeof raw === 'boolean') return raw;
  const value = String(raw).trim().toLowerCase();
  // An empty string is "unset" rather than "denied" — a blank spreadsheet cell shouldn't silently
  // strip the button from every speech question in the study.
  if (value === '') return true;
  return !['n', 'no', 'false', '0'].includes(value);
}

/**
 * Accent used when the manifest sets none — Figma's `color/sky/200`, the fill the radio and
 * scroll-hint designs are drawn with. A study that sets `brandColors.accent` overrides it.
 */
const DEFAULT_ACCENT = '#7EC8E8';

/**
 * The read-aloud passage, in a capped scroll region that says so.
 *
 * A scroll view that fits its container looks identical to one that doesn't, so a capped passage
 * reads as simply truncated — there's nothing to suggest dragging it. This fades the content out at
 * whichever edge has more text beyond it: at the bottom until you reach the end, at the top once
 * you've scrolled. Both disappear when there's nothing more that way, so the cue is never a lie.
 *
 * It owns its own scroll state rather than lifting it, because `StepSlider` renders two panels during
 * a transition and shared state would let the outgoing one drive the incoming one's fades.
 */
function ScrollablePassage({
  text,
  textStyle,
  fadeColor,
  onHintColor,
  hintColor,
  style,
}: {
  text?: string;
  textStyle: StyleProp<TextStyle>;
  /** Page background — what the text fades into. */
  fadeColor: string;
  /** Brand fill for the scroll-hint pill. */
  hintColor: string;
  /** Chevron color — whatever reads on `hintColor`. */
  onHintColor: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [offset, setOffset] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  // A pixel of slack, so a fractional layout doesn't leave a fade stranded at a hard end.
  const canScrollUp = offset > 1;
  const canScrollDown = offset + viewportHeight < contentHeight - 1;

  // The pill keys off whether the passage scrolls *at all*, not the current position — otherwise it
  // would vanish on reaching the bottom, and its 9px gap plus height would resize the passage mid-
  // scroll, nudging the recording controls. The fades still follow the position, since they overlay.
  const isScrollable = contentHeight > viewportHeight + 1;

  return (
    <View style={[styles.passageBlock, style]}>
      <View style={styles.passageWrap}>
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => setOffset(e.nativeEvent.contentOffset.y)}
          onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
          onContentSizeChange={(_w, h) => setContentHeight(h)}
        >
          <Text style={textStyle}>{text}</Text>
        </ScrollView>

        {canScrollUp ? <PassageFade color={fadeColor} edge="top" /> : null}
        {canScrollDown ? <PassageFade color={fadeColor} edge="bottom" /> : null}
      </View>

      {isScrollable ? (
        // Figma 3828:6300 — a full-width brand pill with a white chevron.
        <View style={[styles.passageHint, { backgroundColor: hintColor }]}>
          <Svg width={15} height={8} viewBox="0 0 15 8">
            <Path
              d="M14 1.5 L7.5 6.5 L1 1.5"
              stroke={onHintColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </View>
      ) : null}
    </View>
  );
}

/** One edge fade. Non-interactive, so it never intercepts a drag meant for the passage. */
function PassageFade({ color, edge }: { color: string; edge: 'top' | 'bottom' }) {
  const id = `passage-fade-${edge}`;
  // Opaque against the page at the outer edge, clear where the text continues.
  const [outer, inner] = edge === 'bottom' ? [0, 1] : [1, 0];
  return (
    <Svg
      pointerEvents="none"
      width="100%"
      height={PASSAGE_FADE_HEIGHT}
      style={edge === 'bottom' ? styles.passageFadeBottom : styles.passageFadeTop}
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

/**
 * A speech question's instruction, which folds away once recording starts.
 *
 * The instruction explains how to begin — "press Start, read the text, press Stop" — so by the time
 * the recorder is running it is spent, and on a long one it was what pushed the stop button off the
 * bottom of the screen. Reclaiming its whole height beats squeezing everything else around it.
 *
 * State lives here, per panel, rather than on the screen: `StepSlider` keeps neighbouring questions
 * mounted, so one shared height would be whatever the last question measured — a two-line heading
 * inheriting a seven-line one's, or worse.
 *
 * The measurement is taken *inside* the scroll view, on the content. Measuring the scroll view itself
 * feeds the animated `maxHeight` straight back into what `onLayout` reports, and the block walks
 * itself shut a frame at a time. Scroll content lays out at its natural size whatever the parent is
 * clipped to.
 */
function CollapsibleHeading({
  collapsed,
  text,
  textStyle,
}: {
  collapsed: boolean;
  text?: string;
  textStyle: StyleProp<TextStyle>;
}) {
  const height = useSharedValue(0);
  const progress = useSharedValue(collapsed ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(collapsed ? 1 : 0, { duration: SLIDE_DURATION });
  }, [collapsed, progress]);

  const style = useAnimatedStyle(() => {
    // Nothing measured yet — leave it at its natural size rather than pinning it shut.
    if (height.value === 0) return {};
    return {
      maxHeight: height.value * (1 - progress.value),
      opacity: 1 - progress.value,
    };
  });

  return (
    <Animated.View style={[styles.headingCollapse, style]}>
      <View
        onLayout={(e) => {
          // Only while open. `maxHeight` above constrains this view too, so measuring mid-fold feeds
          // the animation straight back into its own target and the block walks itself shut.
          if (collapsed) return;
          // Read out here — React recycles the event before an updater would run.
          const measured = e.nativeEvent.layout.height;
          if (measured > 0 && Math.abs(measured - height.value) > 1) height.value = measured;
        }}
      >
        <Text style={textStyle}>{text}</Text>
      </View>
    </Animated.View>
  );
}

/** Intrinsic size of `welldoneillustration.svg`, used to keep its aspect ratio when scaled to fit. */
const ILLUSTRATION_WIDTH = 323;
const ILLUSTRATION_HEIGHT = 231;

/**
 * Full-screen questionnaire (Figma "Likert Scale 4 Point", node 3273:1699). Unlike `QuestionnaireNode`
 * (a card rendered inside the task-instructions overlay), this owns the whole screen:
 *
 *   - a muted header row: the task name (left) + "N of M" item count (right)
 *   - a progress bar beneath it (position through the visible questions)
 *   - the current question's text as a large brand-colored title
 *   - the input control — reused from `QuestionRenderer` (all REDCap field types)
 *   - a footer: **Exit** (first question) / **Back** (thereafter) + **Next** / **Finish** (last)
 *
 * Colors resolve through the shared theme (`getColorTokens` / `resolveBackground`), so the screen
 * tracks the manifest `brandColors` and the light/dark scheme like the rest of the app. Questions are
 * sourced exactly as `QuestionnaireNode` does (fetched by `assessmentName`, else inline `node.questions`).
 */
export function QuestionnaireScreenNode({ node, context }: NodeProps) {
  const { questionnaireData, eventBus } = useCoreServices();

  const assessmentName = typeof node.assessmentName === 'string' ? node.assessmentName : undefined;
  const taskName = typeof node.title === 'string' ? node.title : assessmentName ?? 'Questionnaire';
  /** The assessment's `endText` — a study-authored debrief shown on the "Well done" screen. */
  const endText = typeof node.endText === 'string' && node.endText.trim() ? node.endText : undefined;

  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [timestamps, setTimestamps] = useState<Record<string, QuestionTimestamp>>({});
  // Reported by the speech input; drives whether this screen keeps its footer (see `showFooter`).
  const [speechPhase, setSpeechPhase] = useState<SpeechPhase>('idle');
  /**
   * Measured height of the review screen's heading, used to centre the controls on the *page* rather
   * than in the space the heading leaves below it.
   *
   * Measuring is safe now that `StepSlider` keeps neighbours mounted: a review panel is laid out while
   * parked a screen away, so this settles long before that panel slides in. It used to be measured on
   * the active panel only, which is why it once settled mid-transition.
   */
  const [reviewHeaderHeight, setReviewHeaderHeight] = useState(0);
  /** Direction for the next panel slide, armed only by a phase the participant actually triggered. */
  const pendingSlide = useRef<'forward' | 'back' | null>(null);
  const handleSpeechPhase = useCallback((phase: SpeechPhase, meta?: { transition?: boolean }) => {
    if (meta?.transition) {
      // Into the review screen pushes forward; re-record goes back the way it came.
      pendingSlide.current = phase === 'recorded' ? 'forward' : 'back';
    }
    setSpeechPhase(phase);
  }, []);
  // Set once the last question is submitted — swaps the whole screen for the "Well done" state.
  const [isComplete, setIsComplete] = useState(false);
  const questionStartTime = useRef(Date.now());
  const startTimeRef = useRef(Date.now());

  // Load questions — fetched from the QuestionnaireDataService by assessment name, else the blueprint's
  // inline `questions`. (Same resolution as `QuestionnaireNode`.)
  useEffect(() => {
    (async () => {
      if (assessmentName && questionnaireData) {
        const qs = await questionnaireData.getQuestions(assessmentName);
        if (qs.length > 0) {
          setAllQuestions(qs);
          return;
        }
      }
      if (Array.isArray(node.questions)) setAllQuestions(node.questions as Question[]);
    })();
  }, [assessmentName, questionnaireData, node.questions]);

  // Apply REDCap branching logic to get the questions actually shown.
  const visibleQuestions = useMemo(
    () =>
      allQuestions.filter((q) => evaluateBranchingLogic(q.branching_logic ?? q.evaluated_logic, answers)),
    [allQuestions, answers],
  );

  const currentQuestion = visibleQuestions[currentIndex];
  const total = visibleQuestions.length;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === total - 1;

  /**
   * The *count* covers only the questions there are to answer.
   *
   * `info` and `descriptive` fields are preambles and explainers with no input, so counting them made
   * the header read "1 of 4" on a screen with nothing to do. They still render and are still
   * submitted — they just don't inflate the total.
   *
   * `answerable` is that total; `answeredSoFar` is how many are at or before the current page. Note
   * the progress *bar* deliberately doesn't use these — see `progress`.
   */
  const isAnswerable = (q?: Question) =>
    q?.field_type !== 'info' && q?.field_type !== 'descriptive';
  const answerable = visibleQuestions.filter(isAnswerable).length;
  const answeredSoFar = visibleQuestions.slice(0, currentIndex + 1).filter(isAnswerable).length;
  /**
   * The question number shown in the header.
   *
   * On an answerable page that's the one you're on. On a preamble or explainer it's the one you're
   * heading *to* — so an opening info screen reads "1 of 2" rather than "0 of 2", and an interstitial
   * halfway through points at what's coming rather than what's done.
   */
  const questionNumber = isAnswerable(currentQuestion)
    ? answeredSoFar
    : Math.min(answeredSoFar + 1, answerable);
  /**
   * Position through *every* page, info screens included — unlike the count above.
   *
   * The two answer different questions. The counter says how much there is to do, so an explainer
   * shouldn't inflate it. The bar says how far through the task you are, and an explainer is a page
   * you still have to get past — leaving it out froze the bar on those pages, which read as the app
   * having missed the tap.
   */
  const progress = total > 0 ? (currentIndex + 1) / total : 0;

  // The bar eases to its new position in step with the page slide, instead of snapping. Driven by a
  // manual shared value (not a layout animation) — see the note on entering/exiting stranding an
  // invisible touch-blocking overlay on Android.
  const progressValue = useSharedValue(0);
  useEffect(() => {
    progressValue.value = withTiming(progress, { duration: SLIDE_DURATION });
  }, [progress, progressValue]);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progressValue.value * 100}%` }));

  const handleAnswer = useCallback(
    (value: any) => {
      if (!currentQuestion?.field_name) return;
      const fieldName = currentQuestion.field_name;
      setAnswers((prev) => ({ ...prev, [fieldName]: value }));
      setTimestamps((prev) => ({
        ...prev,
        [fieldName]: { startTime: questionStartTime.current, endTime: Date.now() },
      }));
    },
    [currentQuestion],
  );

  const submitResult = useCallback(async () => {
    if (!questionnaireData) return;
    const result: QuestionnaireResult = {
      assessmentName: assessmentName ?? taskName,
      answers,
      timestamps,
      startTime: startTimeRef.current,
      endTime: Date.now(),
    };
    try {
      await questionnaireData.submitResult(result);
    } catch {
      eventBus.emit('questionnaireCompleted', result);
    }
  }, [questionnaireData, assessmentName, taskName, answers, timestamps, eventBus]);

  const goNext = useCallback(() => {
    // Stamp info/descriptive types (no user input) so every shown question has a timestamp.
    if (currentQuestion?.field_name && timestamps[currentQuestion.field_name] == null) {
      setTimestamps((prev) => ({
        ...prev,
        [currentQuestion.field_name!]: { startTime: questionStartTime.current, endTime: Date.now() },
      }));
    }
    if (currentIndex < total - 1) {
      setCurrentIndex(currentIndex + 1);
      // Reset here, in the same batch as the index change. `speechPhase` describes the question being
      // left behind, and the incoming question's input only reports its own phase in an effect — i.e.
      // after the next paint. Without this, moving between two speech questions renders one frame with
      // the previous question's chrome (footer and title suppressed) before it corrects itself.
      setSpeechPhase('idle');
      questionStartTime.current = Date.now();
    } else {
      // Finish → submit, then show the "Well done" screen. The host marks the task complete off the
      // submission event but leaves this screen up; it's dismissed from the buttons there.
      void submitResult();
      setIsComplete(true);
    }
  }, [currentIndex, total, currentQuestion, timestamps, submitResult]);

  const goPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setSpeechPhase('idle'); // See `goNext` — the phase belongs to the question being left.
      questionStartTime.current = Date.now();
    }
  }, [currentIndex]);

  const dismiss = useCallback(() => {
    // Signal the host to dismiss the questionnaire. The shell's questionnaire overlay listens for
    // this; a standalone host can subscribe to the same event.
    eventBus.emit(EVENTS.QUESTIONNAIRE_EXIT, { assessmentName: assessmentName ?? taskName });
  }, [eventBus, assessmentName, taskName]);

  // "Well done" actions: switch to the requested tab, then dismiss so the app lands on it. Tab ids are
  // configurable because they're defined by the host's manifest, not by this node.
  const homeTabId = typeof node.homeTabId === 'string' ? node.homeTabId : 'tab_home';
  const calendarTabId = typeof node.calendarTabId === 'string' ? node.calendarTabId : 'tab_calendar';
  const finishTo = useCallback(
    (tabId: string) => {
      context.dispatch?.({ type: 'Navigate', tabId });
      dismiss();
    },
    [context, dismiss],
  );

  const mode: ThemeMode = context.colorScheme ?? 'light';
  const tokens = getColorTokens(mode, context.theme.brandColors);
  const pageBg = resolveBackground(context.theme, mode);
  // Brand color for the title + progress. Raw brand so it tracks the override in both themes (in dark
  // mode the theme's `button.background` is a fixed navy that doesn't follow the brand).
  const brand = context.theme.brandColors?.brand ?? tokens.button.background;
  const muted = withAlpha(tokens.text.primary, 0.5); // task name + "N of M"
  // Selected radio fill and the scroll-hint pill. Falls back to the sky the designs draw with
  // (Figma `color/sky/200`) rather than the hint-card surface, which is so pale that a selected
  // option was almost indistinguishable from an unselected one when a study sets no accent.
  const accent = context.theme.brandColors?.accent ?? DEFAULT_ACCENT;
  const trackColor = withAlpha(brand, 0.12); // progress-bar track

  const topInset = useTopInset();
  // Just the home indicator / gesture bar — no extra gutter. The safe-area inset is already ~34pt on
  // a notched phone, and adding the design's 16 on top left the buttons floating clear of the edge.
  const bottomInset = useBottomInset();
  const { width } = useWindowDimensions();

  // Completion transition: the questions push out to the left while the "Well done" screen slides in
  // from the right — same direction and duration as advancing between questions, so finishing reads as
  // one more page rather than an abrupt swap. Manual shared value, not a layout animation (see the note
  // on entering/exiting stranding a touch-blocking overlay on Android).
  const completeProgress = useSharedValue(0);
  useEffect(() => {
    if (isComplete) completeProgress.value = withTiming(1, { duration: SLIDE_DURATION });
  }, [isComplete, completeProgress]);
  const questionsStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -completeProgress.value * width }],
  }));
  const doneStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - completeProgress.value) * width }],
  }));

  // Required-field gate for the primary button (matches QuestionnaireNode).
  const isInfoType =
    currentQuestion?.field_type === 'info' || currentQuestion?.field_type === 'descriptive';
  const hasAnswer = currentQuestion?.field_name ? answers[currentQuestion.field_name] != null : false;
  const isRequired = currentQuestion?.required_field === 'y';
  const canProceed = !isRequired || hasAnswer || isInfoType;

  // The speech question owns its own progression (record → stop → "Continue"), so it never shows Next.
  // It keeps the back/exit button on the idle screen as an escape hatch, but drops the footer entirely
  // once recording starts — there's no backing out mid-take or after one is captured.
  /**
   * The question the footer is dressed for — the one being *landed on*, but only once the slide has
   * landed.
   *
   * A speech question has no Next button, so moving to or from one adds or removes a footer button.
   * Both are `flex: 1`, so doing that the moment the index changes snaps Back between half and full
   * width while the panels are still moving — the glitch on every normal↔speech transition. Holding
   * the old chrome until the slide finishes turns that into one discrete change after the motion.
   */
  const [settledIndex, setSettledIndex] = useState(currentIndex);
  useEffect(() => {
    if (settledIndex === currentIndex) return;
    const id = setTimeout(() => setSettledIndex(currentIndex), SLIDE_DURATION);
    return () => clearTimeout(id);
  }, [currentIndex, settledIndex]);
  const isSpeech = visibleQuestions[settledIndex]?.field_type === 'audio';
  // The speech review screen is a new screen of the *same* question, so the whole panel slides — title
  // included. (Sliding only the input left the title to unmount separately, which read as a vertical
  // jump followed by a horizontal one.) The direction follows the journey: forward into the review
  // screen enters from the right, and re-record — going back — enters from the left, so the movement
  // matches what the participant just did.
  //
  // Held as a pixel offset rather than a 0..1 progress so the two directions are simply +width and
  // -width. `useLayoutEffect` lays the start offset in before paint, so the first frame is already
  // off-screen instead of flashing in place.
  const reviewSlide = useSharedValue(0);
  useLayoutEffect(() => {
    // Only a phase the participant just caused animates, and `pendingSlide` is set by the handler
    // that caused it — never inferred from the phase value.
    //
    // Inferring was the bug: navigating back to a finished question makes `SpeechInput` derive
    // 'recorded' on mount and report it, which is indistinguishable from having just pressed stop, so
    // the panel slid in when the participant had merely gone back. Changing question is `StepSlider`'s
    // transition anyway — ours must stay out of its way.
    const direction = pendingSlide.current;
    pendingSlide.current = null;
    if (!direction) {
      reviewSlide.value = 0;
      return;
    }
    reviewSlide.value = direction === 'forward' ? width : -width;
    reviewSlide.value = withTiming(0, { duration: SLIDE_DURATION });
  }, [speechPhase, currentIndex, reviewSlide, width]);
  const reviewSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: reviewSlide.value }],
  }));

  /**
   * Whether the footer is up — held still for the length of a page slide.
   *
   * Mounting or dropping the footer resizes `body`, and both panels are laid out inside it, so doing
   * that mid-slide rewraps the outgoing question's text and shifts its controls — visible as the
   * page "settling" as it leaves. It fires exactly there because `goNext` resets `speechPhase` to
   * 'idle' synchronously, flipping this the instant the slide starts.
   *
   * Deferred only across a transition. Within a question — pressing record, which drops the footer —
   * `settledIndex` already equals `currentIndex`, so it still applies immediately.
   */
  const targetShowFooter = !isSpeech || speechPhase === 'idle';
  const [showFooter, setShowFooter] = useState(targetShowFooter);
  useEffect(() => {
    if (settledIndex !== currentIndex) return;
    setShowFooter(targetShowFooter);
  }, [targetShowFooter, settledIndex, currentIndex]);
  const showNext = !isSpeech;

  // --- "Well done" completion screen (Figma 3273:1821) ---------------------------------------------
  // Same header, but the count reads "Done" and the bar is full; the questions are replaced by the
  // illustration + thanks, and the footer offers Home / Calendar.
  let doneScreen: React.ReactNode = null;
  if (isComplete) {
    const illustrationWidth = Math.min(width - 64, ILLUSTRATION_WIDTH);
    const illustrationHeight = (illustrationWidth * ILLUSTRATION_HEIGHT) / ILLUSTRATION_WIDTH;
    doneScreen = (
      <Animated.View
        style={[styles.screen, { backgroundColor: pageBg, paddingTop: topInset + 16 }, doneStyle]}
      >
        <View style={styles.body}>
          <View style={styles.headerBlock}>
            <View style={styles.countRow}>
              <Text style={[styles.countText, { color: muted }]} numberOfLines={1}>
                {taskName}
              </Text>
              <Text style={[styles.countText, styles.countRight, { color: muted }]}>Done</Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: trackColor }]}>
              <View style={[styles.progressFill, styles.progressFull, { backgroundColor: brand }]} />
            </View>
          </View>

          {/* Same reserve the question panels take. The footer is drawn over the page, so without it
              this would centre against the full height and sit half a footer too low. */}
          <View style={[styles.doneBody, { paddingBottom: FOOTER_RESERVE + bottomInset }]}>
            <WellDoneIllustration width={illustrationWidth} height={illustrationHeight} />
            <Text style={[styles.doneTitle, { color: brand }]}>Well done</Text>
            {/* The assessment's `endText`, when the study wrote one — its own debrief sits above the
                generic thank-you rather than replacing it. */}
            {endText ? (
              <Text style={[styles.doneEndText, { color: tokens.text.primary }]}>{endText}</Text>
            ) : null}
            <Text style={[styles.doneSubtitle, { color: muted }]}>
              Thank you for your continuous support!
            </Text>
          </View>
        </View>

        <View style={[styles.footer, { paddingBottom: bottomInset }]}>
          <View style={styles.footerButton}>
            <PillButton
              variant="outline"
              label="Home"
              onPress={() => finishTo(homeTabId)}
              mode={mode}
              brandColors={context.theme.brandColors}
            />
          </View>
          <View style={styles.footerButton}>
            <PillButton
              variant="primary"
              label="Calendar"
              onPress={() => finishTo(calendarTabId)}
              mode={mode}
              brandColors={context.theme.brandColors}
            />
          </View>
        </View>
      </Animated.View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      {/* Both screens are mounted through the transition so the questions can slide out to the left as
          the "Well done" screen slides in from the right — the same push used between questions. */}
      <Animated.View
        style={[styles.screen, { paddingTop: topInset + 16 }, questionsStyle]}
        pointerEvents={isComplete ? 'none' : 'auto'}
      >
      {/* A constant box. The footer is drawn over it, so nothing here moves when the footer does. */}
      <View style={styles.body}>
        {/* Header: task name + item count, with the progress bar beneath. */}
        <View style={styles.headerBlock}>
          <View style={styles.countRow}>
            <Text style={[styles.countText, { color: muted }]} numberOfLines={1}>
              {taskName}
            </Text>
            {/* Shown on every page, info screens included — the denominator excludes them, so they
                don't inflate the total. See `questionNumber` for what a preamble displays. */}
            <Text style={[styles.countText, styles.countRight, { color: muted }]}>
              {answerable > 0 ? `${questionNumber} of ${answerable}` : ''}
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: trackColor }]}>
            <Animated.View style={[styles.progressFill, progressStyle, { backgroundColor: brand }]} />
          </View>
        </View>

        {/* Question pages. Each question is a page: advancing slides the next in from the right, going
            back slides the previous in from the left (StepSlider derives the direction from the index
            change). The header above and footer below stay put. Title is the question text; the input
            is reused from QuestionRenderer (with its own header suppressed so it isn't shown twice). */}
        <StepSlider index={currentIndex} duration={SLIDE_DURATION} count={total}>
          {(stepIndex) => {
            const question = visibleQuestions[stepIndex];
            // The slider keeps the neighbouring steps mounted, so this runs for indices either side of
            // the current one. Branching logic can shorten `visibleQuestions` under us, so a step can
            // point at nothing.
            if (!question) return null;
            // During a transition StepSlider renders both the outgoing and incoming panel. Anything
            // derived from the *current* question has to be scoped to the active one, or the outgoing
            // panel flips its title to match the incoming question and its speech input reports a
            // phase that isn't the current screen's.
            const isActive = stepIndex === currentIndex;
            // Whether *this* panel's passage is hidden, decided by whether this question already has
            // a recording — not by the shared `speechPhase`.
            //
            // `speechPhase` belongs to the active question, so keying off it made the outgoing panel
            // flip as soon as the index moved: leaving a recorded speech question, panel A's passage
            // reappeared mid-slide and its whole layout jumped while sliding away. Reading the answer
            // keeps each panel stable through the transition, and still tracks re-record, which clears
            // the answer.
            const hideTitleHere =
              question?.field_type === 'audio' &&
              !!(question.field_name && answers[question.field_name]);
            const isSpeechPanel = question?.field_type === 'audio';
            // Whether the read-aloud passage is the question's own `field_label` (rendered here, in a
            // capped scroll region) rather than living in `select_choices_or_calculations`, which
            // `SpeechInput` draws in its own fixed-height card. Decides both what the title block
            // renders and whether it's allowed to shrink.
            // The passage now always goes to `SpeechInput`'s card, wherever the definition put it —
            // rendering it here instead meant a question whose passage lived in `field_label` drew it
            // as a bare scrolling title with no card behind it, while the same question authored with
            // `select_choices_or_calculations` got the designed one.
            const hasInlinePassage = false;
            // Drives both halves of the review screen: the play button, and which line sits under the
            // heading — a "take a listen" prompt with no way to listen would be a lie.
            const allowReplay = isReplayAllowed(question);
            // Falls back to the section header when the question has no label of its own — see the
            // note where the header is rendered.
            // A speech question's heading is whichever field isn't carrying the passage — see
            // `speechContent`. Everything else keeps its own label.
            const questionTitle = isSpeechPanel
              ? speechContent(question).heading
              : question?.field_label?.trim() || question?.section_header;
            // Speech questions get a standing instruction when the study wrote no header of their
            // own; every other type shows a header only if one was authored.
            const sectionHeader =
              question?.field_type === 'audio'
                ? question.section_header?.trim() || SPEECH_DEFAULT_HEADER
                : question?.section_header;
            // A speech question is laid out in a plain View, not a ScrollView.
            //
            // That's the difference between the passage shrinking and not: a ScrollView's content
            // container has no bounded height — `flexGrow` only makes it *at least* the viewport, and
            // it grows past that to fit its content, so `flexShrink` on the passage never engages and
            // the recording controls get pushed off the bottom. A View bounded by `flex: 1` gives the
            // children a fixed height to divide up, so the passage yields and the controls stay put.
            // The page doesn't need to scroll anyway — only the passage does.
            const Panel = isSpeechPanel ? View : ScrollView;
            return (
              <Panel
                style={[
                  styles.scroll,
                  // Reserved on every panel, on every screen, whether or not this one shows a footer.
                  // The footer is drawn over the page, so this is what keeps its content clear of it —
                  // and reserving it unconditionally is what makes the panel the same size before,
                  // during and after a transition.
                  isSpeechPanel && { paddingBottom: FOOTER_RESERVE + bottomInset },
                ]}
                contentContainerStyle={
                  isSpeechPanel
                    ? undefined
                    : [
                        styles.scrollContent,
                        { paddingBottom: FOOTER_RESERVE + bottomInset },
                      ]
                }
                showsVerticalScrollIndicator={false}
              >
                {!question ? (
                  <Text style={[styles.emptyText, { color: muted }]}>No questions available</Text>
                ) : (
                  <Animated.View
                    style={[
                      styles.panelBody,
                      // Fill the panel only while the passage is on screen, so it has a bounded
                      // height to shrink within. On the review screen there's no passage left to
                      // squeeze, and filling would defeat the panel's `justifyContent: center` —
                      // a body that fills has nothing left to centre.
                      isSpeechPanel && styles.panelBodyFill,
                      isActive && reviewSlideStyle,
                    ]}
                  >
                    {/* Section header + question text as one block, so the 16px page gap falls
                        between the text and the input rather than splitting the pair.

                        Reduced once a speech question has been recorded: an `audio` question's
                        `field_label` is the passage to read aloud, which has served its purpose by the
                        review screen and would otherwise crowd out the re-record / continue cards
                        (Figma 3528:6585 drops it too). The heading stays, so the participant can still
                        see which task they're in, with a line saying what to do here instead. */}
                    {hideTitleHere ? (
                      <View
                        style={styles.titleBlock}
                        onLayout={(e) => {
                          // Captured before the updater runs — React recycles the event.
                          const height = e.nativeEvent.layout.height;
                          setReviewHeaderHeight((current) =>
                            Math.abs(current - height) > 1 ? height : current,
                          );
                        }}
                      >
                        {/* Same pairing as an `info` screen: the task name is the small grey kicker
                            and the line telling you what to do is the heading. */}
                        <Text style={[styles.sectionHeader, { color: muted }]}>{questionTitle}</Text>
                        <Text style={[styles.title, { color: brand }]}>
                          {allowReplay ? SPEECH_REVIEW_SUBTEXT : SPEECH_REVIEW_SUBTEXT_NO_REPLAY}
                        </Text>
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.titleBlock,
                          // Only shrink when the passage is actually in here. It's the passage that's
                          // meant to yield to the controls; when the study puts the passage in
                          // `select_choices_or_calculations` this block holds just a heading and a
                          // line of copy, and letting that shrink collapses it to nothing — nothing
                          // else in the panel gives way, so it absorbs the whole overflow.
                          // Every speech panel, not just one with the passage inline. A long
                          // instruction here is the first thing that should give way: it's read once
                          // before starting, whereas the passage is read *while* recording and the
                          // stop button has to stay reachable throughout.
                          isSpeechPanel && styles.titleBlockShrink,
                        ]}
                      >
                        {/* The small grey header only earns its place when there's a distinct question
                            beneath it. Plenty of `info` fields carry their heading in `section_header`
                            and leave `field_label` empty (THINC-it's "Time for THINC-it", say) — left
                            as-is that renders a small muted line with nothing under it, so promote it
                            into the title instead. */}
                        {sectionHeader && questionTitle !== sectionHeader ? (
                          <Text style={[styles.sectionHeader, { color: muted }]}>
                            {sectionHeader}
                          </Text>
                        ) : null}
                        {hasInlinePassage ? (
                          // A speech question's `field_label` is a passage to read aloud — far longer
                          // than a normal question, and long enough to push the record button
                          // off-screen. Cap just the passage and let it scroll on its own, with edge
                          // fades marking that there's more; the instructions above it stay put, as
                          // do the controls below.
                          //
                          // Only when there IS one: aRMT speech questions routinely leave `field_label`
                          // empty and put the passage in `select_choices_or_calculations` (which
                          // `SpeechInput` draws in its own card) with just a heading in
                          // `section_header`. Those fall through to the plain title below — rendering
                          // the empty label here left the whole title block blank, since the heading
                          // had already been promoted into `questionTitle`.
                          <ScrollablePassage
                            style={styles.titleScroll}
                            fadeColor={pageBg}
                            hintColor={accent}
                            onHintColor={readableTextColor(accent, { preferred: brand })}
                            textStyle={[styles.title, { color: brand }]}
                            text={question.field_label}
                          />
                        ) : isSpeechPanel ? (
                          // The passage card below is the content here, so the task name reads as a
                          // kicker above it rather than as the page's heading. Same size on idle and
                          // recording as on review, so pressing record doesn't resize it mid-task.
                          //
                          // Folds away once recording starts — see `CollapsibleHeading`.
                          <CollapsibleHeading
                            collapsed={isActive && speechPhase === 'recording'}
                            text={questionTitle}
                            textStyle={[styles.sectionHeader, { color: muted }]}
                          />
                        ) : (
                          <Text style={[styles.title, { color: brand }]}>{questionTitle}</Text>
                        )}
                      </View>
                    )}
                    {/* On the review screen the heading stays put at the top and only the controls
                        below it centre in what's left — centring the panel as a whole would drag the
                        heading down into the middle with them.

                        Otherwise this is a link in the shrink chain: it sits between the bounded panel
                        and the passage card, and RN defaults `flexShrink` to 0, so leaving it unstyled
                        pins it at its natural height and the card below never gets to yield. */}
                    <View
                      style={
                        hideTitleHere
                          ? styles.reviewBody
                          : isSpeechPanel
                            ? styles.speechBody
                            : undefined
                      }
                    >
                      <QuestionRenderer
                        question={question}
                        value={question.field_name ? answers[question.field_name] : undefined}
                        onChange={handleAnswer}
                        primaryColor={brand}
                        textColor={tokens.text.primary}
                        textSecondaryColor={muted}
                        accentColor={accent}
                        surfaceColor={tokens.card.background}
                        hideHeader
                        mode={mode}
                        // Lets the speech question's "Continue" card advance the questionnaire itself.
                        onContinue={goNext}
                        onPhaseChange={isActive ? handleSpeechPhase : undefined}
                        allowReplay={allowReplay}
                      />
                      {hideTitleHere ? (
                        <>
                          <View style={styles.reviewSpacer} />
                          <View
                            style={[
                              styles.reviewHeaderCompensator,
                              { height: reviewHeaderHeight + PANEL_GAP },
                            ]}
                          />
                        </>
                      ) : null}
                    </View>
                  </Animated.View>
                )}
              </Panel>
            );
          }}
        </StepSlider>
      </View>

      {/* Footer: Exit (first) / Back (thereafter) + Next / Finish (last). The speech question shows only
          the back/exit half while idle, and no footer at all once recording starts. */}
      {showFooter && (
        <View style={[styles.footer, { paddingBottom: bottomInset }]}>
          <View style={styles.footerButton}>
            <PillButton
              variant="outline"
              label={isFirst ? 'Exit' : 'Back'}
              onPress={isFirst ? dismiss : goPrevious}
              mode={mode}
              brandColors={context.theme.brandColors}
            />
          </View>
          {showNext && (
            <View style={styles.footerButton}>
              <PillButton
                variant="primary"
                label={isLast ? 'Finish' : 'Next'}
                onPress={goNext}
                disabled={!canProceed}
                mode={mode}
                brandColors={context.theme.brandColors}
              />
            </View>
          )}
        </View>
      )}
      </Animated.View>

      {doneScreen}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    // Clips the two sliding layers so neither shows past the screen edges mid-transition.
    overflow: 'hidden',
  },
  // Each full-screen layer (questions / "Well done") stacks here so they can slide past each other.
  screen: {
    ...StyleSheet.absoluteFillObject,
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
    fontSize: 16,
    lineHeight: 20, // > fontSize so Android doesn't clip descenders
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
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  // The completion screen's bar is simply full — no animation to drive.
  progressFull: {
    width: '100%',
  },
  // Illustration + copy, centred in the space between the header and the footer.
  doneBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  doneTitle: {
    fontSize: 40,
    // Taller than the font size so descenders aren't clipped on Android.
    lineHeight: 46,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  /** Study-authored debrief. A step up from the generic subtitle, since it's the study's own words. */
  doneEndText: {
    fontSize: 16,
    // Taller than the font size so tall glyphs/descenders aren't clipped on Android.
    lineHeight: 22,
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontWeight: '500',
    letterSpacing: tracking.medium,
    includeFontPadding: false,
  },
  doneSubtitle: {
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  /**
   * Spacing between the question text and its input.
   *
   * It lives here, not on `scrollContent`, because this wrapper — added to slide the panel — is the
   * ScrollView's only child, so a gap on the content container has nothing to space apart.
   */
  panelBody: {
    gap: PANEL_GAP,
  },
  /**
   * The speech review screen's controls, centred in the space the heading leaves.
   *
   * In flow, not absolutely filling the panel. Filling it centres them on the page, which is nominally
   * what's wanted — but the controls are nearly as tall as the panel, so the centred group's top edge
   * rises above the heading and the waveform draws straight over it. Sitting under the heading costs a
   * little centring (there is barely any slack left to centre within anyway) and cannot overlap.
   */
  reviewBody: {
    flex: 1,
  },
  /** Equal above and below the controls — what centres them. */
  reviewSpacer: {
    flex: 1,
  },
  /** Matches the heading, below the controls, so centring is measured against the whole page. Shrinks
   *  before the spacers do, which is what stops the controls climbing over the heading. */
  reviewHeaderCompensator: {
    flexShrink: 1,
  },
  /** The idle/recording speech controls. `flexShrink: 1` passes the panel's height pressure down to
   *  the passage card, which is the one part that can afford to be smaller — without it the chain
   *  breaks here and the overflow lands on the stop button instead. */
  speechBody: {
    flexShrink: 1,
  },
  titleBlock: {
    gap: 4,
  },
  /**
   * Lets the passage give way to the controls below it.
   *
   * React Native defaults `flexShrink` to 0 (CSS defaults it to 1), so every element between the
   * height-bounded panel and the scrollable passage has to opt in explicitly — miss one and the
   * chain breaks, the passage keeps its full natural height, and the record button is pushed off
   * the bottom of the screen.
   */
  titleBlockShrink: {
    flexShrink: 1,
  },
  /**
   * The speech instruction's window. `flexGrow: 0` keeps it no taller than its text, `flexShrink: 1`
   * lets it give way under pressure, and `minHeight` stops it collapsing to nothing — so there is
   * always something readable, and something to scroll.
   */
  headingScroll: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 40,
  },
  /**
   * Clips the instruction while its height is settling, so a shrinking box hides the text it is
   * losing rather than letting it spill over what sits below.
   *
   * Deliberately NOT `flexShrink` — that let the panel squeeze the box under its own measured height,
   * and `overflow: hidden` then cut the last line off. The passage card is the thing that gives way
   * here; it scrolls, so losing height costs reading room rather than words.
   */
  headingCollapse: {
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'hidden',
  },
  /**
   * A speech question's read-aloud passage — the only scrollable thing on the screen.
   *
   * It claims no space of its own: `flexGrow: 0` keeps it from expanding past its content, and
   * `flexShrink: 1` lets it give way to the recording controls, which are laid out at their natural
   * size first. Whatever is left over is the passage's window, so the controls are always visible and
   * the page itself never scrolls — no fixed cap needed, since the space decides it.
   */
  titleScroll: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: PASSAGE_MAX_HEIGHT,
  },
  /** The passage and its scroll-hint pill, spaced by the design's 9px. */
  passageBlock: {
    gap: 9,
  },
  /** Positioning context for the edge fades, which overlay the scroll rather than displacing it. */
  passageWrap: {
    position: 'relative',
    overflow: 'hidden',
    flexShrink: 1,
  },
  passageFadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  passageFadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  /** Scroll-hint pill (Figma 3828:6300): full width, fully rounded, brand-filled. */
  passageHint: {
    width: '100%',
    height: 23.5,
    borderRadius: 23.5 / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Speech panels fill the viewport, giving the passage a bounded height to flex within. */
  panelBodyFill: {
    flex: 1,
  },
  sectionHeader: {
    fontSize: 14,
    // Taller than the font size so tall glyphs/descenders aren't clipped on Android.
    lineHeight: 18,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    letterSpacing: tracking.semiBold,
    includeFontPadding: false,
  },
  title: {
    fontSize: 24,
    // Taller than the font size so tall glyphs/descenders aren't clipped on Android.
    lineHeight: 30,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
  },
  footer: {
    // Over the page, not above it. Laid out in flow, the footer's appearance shortened the slider's
    // viewport, and both panels are absolutely filled inside it — so every screen that showed or hid
    // a footer rewrapped the outgoing question's text and shifted its controls mid-slide.
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  footerButton: {
    flex: 1,
  },
});
