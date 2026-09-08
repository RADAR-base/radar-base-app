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
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
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
 * Floor for a speech question's passage window — roughly four lines of the 24/30 title type.
 *
 * The passage otherwise takes only what the recording controls leave over, which on a short screen
 * can shrink it to a line or two. Note this trades against the "everything fits" rule: where the
 * controls genuinely need more room than the screen has, this floor wins and the overflow is clipped,
 * because page scrolling is off for speech questions.
 */
const PASSAGE_MAX_HEIGHT = 300;


/** Height of the fade at the edge of the scrollable passage. */
const PASSAGE_FADE_HEIGHT = 28;

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
   * Progress counts only the questions there are to *answer*.
   *
   * `info` and `descriptive` fields are preambles and explainers with no input, so counting them made
   * the header read "1 of 4" on a screen with nothing to do, and the bar jump on a page the
   * participant only had to read past. They still render and are still submitted — they just don't
   * inflate the count.
   *
   * `answerable` is the count; `answeredSoFar` is how many are at or before the current page, which is
   * what the position should reflect. On an info page that's the number already passed, so the bar
   * holds still rather than advancing for a page that asked nothing.
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
  const progress = answerable > 0 ? answeredSoFar / answerable : 0;

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
  const bottomInset = useBottomInset(16);
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
  const isSpeech = currentQuestion?.field_type === 'audio';
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

  const showFooter = !isSpeech || speechPhase === 'idle';
  const showNext = !isSpeech;
  // The passage stays up while it's being read (idle + recording) and goes once it's been captured.
  const hideTitle = isSpeech && speechPhase === 'recorded';

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

          <View style={styles.doneBody}>
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
      {/* Without the footer, the body takes over clearing the bottom safe area. */}
      <View style={[styles.body, !showFooter && { paddingBottom: bottomInset }]}>
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
        <StepSlider index={currentIndex} duration={SLIDE_DURATION}>
          {(stepIndex) => {
            const question = visibleQuestions[stepIndex];
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
            // Falls back to the section header when the question has no label of its own — see the
            // note where the header is rendered.
            const questionTitle = question?.field_label?.trim() || question?.section_header;
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
                  isSpeechPanel && styles.scrollContent,
                  // The review screen has no title and no footer, so left at the top it sits against
                  // the header with the page empty below. Centre it in the space instead.
                  isSpeechPanel && hideTitleHere && styles.scrollContentCentered,
                ]}
                contentContainerStyle={
                  isSpeechPanel
                    ? undefined
                    : [
                        styles.scrollContent,
                        // The speech review screen has no title and no footer, so left at the top it
                        // sits against the header with the page empty below. Centre it instead.
                        hideTitleHere && styles.scrollContentCentered,
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
                      isSpeechPanel && !hideTitleHere && styles.panelBodyFill,
                      isActive && reviewSlideStyle,
                    ]}
                  >
                    {/* Section header + question text as one block, so the 16px page gap falls
                        between the text and the input rather than splitting the pair.

                        Hidden once a speech question has been recorded: an `audio` question's
                        `field_label` is the passage to read aloud, which has served its purpose by the
                        review screen and would otherwise crowd out the re-record / continue cards
                        (Figma 3528:6585 drops it too). */}
                    {hideTitleHere ? null : (
                      <View style={[styles.titleBlock, isSpeechPanel && styles.titleBlockShrink]}>
                        {/* The small grey header only earns its place when there's a distinct question
                            beneath it. Plenty of `info` fields carry their heading in `section_header`
                            and leave `field_label` empty (THINC-it's "Time for THINC-it", say) — left
                            as-is that renders a small muted line with nothing under it, so promote it
                            into the title instead. */}
                        {question.section_header && questionTitle !== question.section_header ? (
                          <Text style={[styles.sectionHeader, { color: muted }]}>
                            {question.section_header}
                          </Text>
                        ) : null}
                        {question.field_type === 'audio' ? (
                          // A speech question's `field_label` is a passage to read aloud — far longer
                          // than a normal question, and long enough to push the record button
                          // off-screen. Cap just the passage and let it scroll on its own, with edge
                          // fades marking that there's more; the instructions above it stay put, as
                          // do the controls below.
                          <ScrollablePassage
                            style={styles.titleScroll}
                            fadeColor={pageBg}
                            hintColor={accent}
                            onHintColor={readableTextColor(accent, { preferred: brand })}
                            textStyle={[styles.title, { color: brand }]}
                            text={question.field_label}
                          />
                        ) : (
                          <Text style={[styles.title, { color: brand }]}>{questionTitle}</Text>
                        )}
                      </View>
                    )}
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
                    />
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
    gap: 16,
  },
  /** `flexGrow` lets the content container fill the scroll viewport, which is what gives
   *  `justifyContent` something to centre within — without it the container is only as tall as its
   *  content and centring is a no-op. Still scrolls if the content outgrows the screen. */
  scrollContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
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
