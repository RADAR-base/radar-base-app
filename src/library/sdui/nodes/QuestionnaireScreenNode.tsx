import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useCoreServices } from '../../../core/CoreServicesContext';
import { EVENTS } from '../../../core/EventBus';
import type { Question, QuestionnaireResult, QuestionTimestamp } from '../../../types';
import {
  fontFamily,
  tracking,
  getColorTokens,
  resolveBackground,
  withAlpha,
  type ThemeMode,
} from '../../../theme/theme';
import WellDoneIllustration from '../../../theme/icons/welldoneillustration.svg';
import type { NodeProps } from '../types';
import { QuestionRenderer } from './questionnaire/QuestionRenderer';
import { speechContent } from './questionnaire/speechContent';
import {
  CollapsibleHeading,
  isReplayAllowed,
  SPEECH_DEFAULT_HEADER,
  SPEECH_REVIEW_SUBTEXT,
  SPEECH_REVIEW_SUBTEXT_NO_REPLAY,
} from './questionnaire/SpeechPanel';
import { matrixPageTitle, toQuestionPages } from './questionnaire/matrixGroups';
import { panelBehaviour } from './questionnaire/panelBehaviour';
import type { SpeechPhase } from './questionnaire/SpeechInput';
import { evaluateBranchingLogic } from './questionnaire/branchingLogic';
import { PillButton } from '../PillButton';
import { useTopInset } from '../useTopInset';
import { useBottomInset } from '../useBottomInset';
import { StepSlider } from '../StepSlider';

/** Page-transition duration (ms). Shared by the question slide and the progress bar so they move
 *  together. Matches `StepSlider`'s own default. */
const SLIDE_DURATION = 260;

/** The screen's horizontal inset. Applied per panel, not to the body — see `questionsBody`. */
const PAGE_PADDING = 16;


/** Gap between a panel's heading block and its input. */
const PANEL_GAP = 16;

/**
 * `PillButton`'s own minimum height, pinned onto both footer halves.
 *
 * Without it the row's height is whatever its tallest child happens to be — and the Next half is
 * animated down to nothing, so its label wraps a character at a time on the way and the button grows
 * enormously tall. `alignItems: 'center'` then re-centres the row every frame, which is Back bouncing
 * up and down while Next collapses beside it. A fixed height leaves nothing for the row to re-measure.
 */
const FOOTER_BUTTON_HEIGHT = 52;

/**
 * Vertical space the footer covers: the button height plus the footer's own top padding.
 *
 * The footer is positioned over the page rather than laid out above it, so mounting or dropping it
 * can't resize the panels. Every panel reserves this much instead — whatever screen it is — which is
 * what keeps the layout identical with the footer up or down. Add the bottom inset at the call site.
 */
const FOOTER_RESERVE = FOOTER_BUTTON_HEIGHT + 16;

/**
 * The gap `questionsBody` leaves under the panels, between them and the screen's own bottom.
 *
 * Named because the panels' content sits above it, so anything inside one measuring itself against
 * the footer has to discount it — the footer is placed against the screen's bottom edge, not the
 * panel's. See `bottomReserve` where it is handed down.
 */
const BODY_BOTTOM_PAD = 16;

/** How the footer arrives: a short fade, lifting this far off its resting place as it comes in. */
const FOOTER_FADE_MS = 130;
const FOOTER_RISE = 12;

/** Space between the two footer buttons — a margin on the Next half, so it closes with it. */
const FOOTER_GAP = 9;

/**
 * Accent used when the manifest sets none — Figma's `color/sky/200`, the fill the radio and
 * scroll-hint designs are drawn with. A study that sets `brandColors.accent` overrides it.
 */
const DEFAULT_ACCENT = '#7EC8E8';


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

  /**
   * The questions batched into pages — what the screen actually steps through.
   *
   * All but one field type is a page to itself, exactly as before. A run of binary `matrix-radio`
   * questions collapses into a single page instead, because the matrix design answers the whole block
   * on one screen as a deck of cards. `currentIndex` counts pages from here on, not questions.
   */
  const pages = useMemo(() => toQuestionPages(visibleQuestions), [visibleQuestions]);
  const currentPage = pages[currentIndex];
  /** The page's first question — the whole of it, for every page that isn't a matrix block. */
  const currentQuestion = currentPage?.[0];
  const total = pages.length;
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
  // Counted over pages, so a matrix block reads as the one screen it is rather than as its row count.
  const answerable = pages.filter((page) => isAnswerable(page[0])).length;
  const answeredSoFar = pages.slice(0, currentIndex + 1).filter((page) => isAnswerable(page[0])).length;
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

  /**
   * Records one answer by field name.
   *
   * Split out from `handleAnswer` because a matrix page answers several fields from a single screen,
   * so "the question being answered" can't be inferred from the page any more.
   */
  const handleAnswerField = useCallback((fieldName: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [fieldName]: value }));
    setTimestamps((prev) => ({
      ...prev,
      [fieldName]: { startTime: questionStartTime.current, endTime: Date.now() },
    }));
  }, []);

  const handleAnswer = useCallback(
    (value: any) => {
      if (!currentQuestion?.field_name) return;
      handleAnswerField(currentQuestion.field_name, value);
    },
    [currentQuestion, handleAnswerField],
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
  // A matrix page is answered only once every card in the deck is — one row left face up is an
  // unanswered question, whichever way the rest went.
  const hasAnswer = currentPage?.length
    ? currentPage.every((q) => (q.field_name ? answers[q.field_name] != null : true))
    : false;
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
  const isSpeech = pages[settledIndex]?.[0]?.field_type === 'audio';
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

  /**
   * Whether Next may be *pressed*, decided by the page being landed on rather than the settled one.
   *
   * `showNext` is deliberately a slide behind, so the footer doesn't resize mid-transition — but that
   * is a question about drawing, and applying it to input left a real hole: arriving at a speech
   * question, Next stayed live for the length of the slide, and a tap in that window called `goNext`
   * and skipped the task entirely. Shrinking the animation would only narrow the window; reading the
   * arriving page closes it.
   */
  const arrivingIsSpeech = pages[currentIndex]?.[0]?.field_type === 'audio';
  const nextEnabled = canProceed && !arrivingIsSpeech;

  /**
   * The footer fades and rises into place rather than appearing whole.
   *
   * It comes and goes within a speech question — gone while recording, back when the take is done —
   * and a button that simply materialises under your thumb reads as a glitch rather than as an
   * invitation. Rising a little as it fades in says it arrived.
   *
   * Driven by a shared value on a permanently mounted footer, not by mounting it: `entering`/
   * `exiting` layout animations strand an invisible touch-blocking overlay on Android, and an
   * unmounted footer can't animate away at all. It costs nothing to leave up — the footer is
   * positioned over the page, and every panel reserves `FOOTER_RESERVE` whether it is there or not.
   */
  const footerProgress = useSharedValue(showFooter ? 1 : 0);
  useEffect(() => {
    footerProgress.value = withTiming(showFooter ? 1 : 0, { duration: FOOTER_FADE_MS });
  }, [showFooter, footerProgress]);
  const footerStyle = useAnimatedStyle(() => ({
    opacity: footerProgress.value,
    transform: [{ translateY: (1 - footerProgress.value) * FOOTER_RISE }],
  }));

  /**
   * Next collapses into Back rather than vanishing from under it.
   *
   * A speech question has no Next, so arriving at one used to drop that half outright and Back snapped
   * from half the row to all of it in a single frame. Growing into the space instead makes the two
   * read as one control changing shape.
   *
   * `flexGrow` and the gap are animated together: the gap is the Next half's own left margin (see
   * `footer`), so it closes as the button does and Back ends up filling the row exactly.
   */
  const nextProgress = useSharedValue(showNext ? 1 : 0);
  useEffect(() => {
    nextProgress.value = withTiming(showNext ? 1 : 0, { duration: FOOTER_FADE_MS });
  }, [showNext, nextProgress]);
  const nextStyle = useAnimatedStyle(() => ({
    flexGrow: nextProgress.value,
    marginLeft: nextProgress.value * FOOTER_GAP,
    opacity: nextProgress.value,
  }));

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
      <View style={styles.questionsBody}>
        {/* Header: task name + item count, with the progress bar beneath. Padded itself now that the
            body isn't — see `questionsBody`. */}
        <View style={[styles.headerBlock, styles.panelPad]}>
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
            const page = pages[stepIndex];
            const question = page?.[0];
            // The slider keeps the neighbouring steps mounted, so this runs for indices either side of
            // the current one. Branching logic can shorten `pages` under us, so a step can point at
            // nothing.
            if (!question) return null;
            // How this page's container has to behave — the rule lives with the field types it
            // describes, so the screen asks rather than switching on `field_type` itself.
            const behaviour = panelBehaviour(page);
            // A block shares one screen, so its heading is the block's rather than the first row's.
            const isBlock = page.length > 1;
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
            // Drives both halves of the review screen: the play button, and which line sits under the
            // heading — a "take a listen" prompt with no way to listen would be a lie.
            const allowReplay = isReplayAllowed(question);
            // Falls back to the section header when the question has no label of its own — see the
            // note where the header is rendered.
            // A speech question's heading is whichever field isn't carrying the passage — see
            // `speechContent`. Everything else keeps its own label.
            // A matrix block's title is the block's own heading, not the first row's label — each row
            // carries its label on its card, and the heading is the one thing they share.
            const questionTitle = isBlock
              ? matrixPageTitle(page)
              : isSpeechPanel
                ? speechContent(question).heading
                : question?.field_label?.trim() || question?.section_header;
            // Speech questions get a standing instruction when the study wrote no header of their
            // own; every other type shows a header only if one was authored. A matrix block has
            // already spent its header on the title above, so it shows none here.
            const sectionHeader = isBlock
              ? undefined
              : question?.field_type === 'audio'
                ? question.section_header?.trim() || SPEECH_DEFAULT_HEADER
                : question?.section_header;
            // Which types need a plain View rather than a ScrollView, and why, is `panelBehaviour`'s
            // to say — the reasons are about the field types, not about this screen.
            const isFixedPanel = !behaviour.scrolls;
            const Panel = isFixedPanel ? View : ScrollView;
            return (
              <Panel
                style={[
                  styles.scroll,
                  // Reserved on every panel, on every screen, whether or not this one shows a footer.
                  // The footer is drawn over the page, so this is what keeps its content clear of it —
                  // and reserving it unconditionally is what makes the panel the same size before,
                  // during and after a transition.
                  // A View panel carries the page inset itself. It doesn't clip, so a card thrown
                  // sideways still travels out past it to the screen edge.
                  isFixedPanel && styles.panelPad,
                  isFixedPanel &&
                    behaviour.padsFooter && { paddingBottom: FOOTER_RESERVE + bottomInset },
                ]}
                contentContainerStyle={
                  isFixedPanel
                    ? undefined
                    : // On a ScrollView the inset goes on the content, leaving the scroll frame full
                      // width — otherwise its own clip would sit inside the padding again.
                      [
                        styles.scrollContent,
                        styles.panelPad,
                        { paddingBottom: FOOTER_RESERVE + bottomInset },
                      ]
                }
                showsVerticalScrollIndicator={false}
                // Set even on a View panel, where it is simply ignored — see `panelBehaviour` for
                // which pages refuse to scroll and why.
                scrollEnabled={behaviour.scrolls}
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
                      behaviour.fills && styles.panelBodyFill,
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
                        {isSpeechPanel ? (
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
                    {/* The last link in the fill chain, for an input that scrolls itself: the panel
                        is bounded and the body fills it, but RN defaults `flex` to 0, so leaving this
                        unstyled pins it at its content's height and the scroller inside never gets a
                        viewport to scroll within. */}
                    <View
                      style={
                        hideTitleHere
                          ? styles.reviewBody
                          : isSpeechPanel
                            ? styles.speechBody
                            : behaviour.fills
                              ? styles.panelBodyFill
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
                          // The page, for the one type whose rows share a screen. Everything else gets
                          // a page of one and never looks at it.
                          questions={page}
                          answers={answers}
                          onAnswer={handleAnswerField}
                          // The page itself, for an input that fades its ends into it.
                          backgroundColor={pageBg}
                          // What an input that scrolls itself has to keep clear at the bottom, since
                          // its panel no longer does — see `panelBehaviour.padsFooter`.
                          //
                          // Measured from the panel's own bottom edge, which is where the input will
                          // apply it — so the body's gap under the panels comes off, or the footer
                          // gets counted twice and everything positioned against it lands that much
                          // too high.
                          bottomReserve={FOOTER_RESERVE + bottomInset - BODY_BOTTOM_PAD}
                          // The page inset, for an input whose own clipping would otherwise cut the
                          // theme's card shadow off at the padded edge.
                          pageInset={PAGE_PADDING}
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
      {/* Always mounted, shown by opacity — see `footerStyle`. `pointerEvents` is what actually takes
          it out of play, so a faded footer can't be pressed on the way out. */}
      <Animated.View
        style={[styles.footer, { paddingBottom: bottomInset }, footerStyle]}
        pointerEvents={showFooter ? 'auto' : 'none'}
      >
        <View style={styles.footerButton}>
            <PillButton
              variant="outline"
              label={isFirst ? 'Exit' : 'Back'}
              onPress={isFirst ? dismiss : goPrevious}
              mode={mode}
              brandColors={context.theme.brandColors}
            />
          </View>
          {/* Kept mounted and collapsed, so Back grows into the space rather than jumping into it —
              see `nextStyle`. `pointerEvents` takes it out of play while it is closed. */}
          <Animated.View
            style={[styles.footerNext, nextStyle]}
            // Gated on the arriving page, not the settled one — see `nextEnabled`. While the panel is
            // still sliding onto a speech question this is already closed, so the collapse it is part
            // way through can't be tapped through.
            pointerEvents={showNext && nextEnabled ? 'auto' : 'none'}
          >
            <PillButton
              variant="primary"
              label={isLast ? 'Finish' : 'Next'}
              onPress={goNext}
              disabled={!nextEnabled}
              mode={mode}
              brandColors={context.theme.brandColors}
            />
          </Animated.View>
        </Animated.View>
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
    ...StyleSheet.absoluteFill,
  },
  body: {
    flex: 1,
    paddingHorizontal: PAGE_PADDING,
    paddingBottom: 16,
    gap: 16,
  },
  /**
   * The questions view's body — `body` without the horizontal padding.
   *
   * `StepSlider`'s viewport clips, and it must: that clip is what hides the parked neighbouring
   * panels. Padding this container put that clip 16pt inside the screen, so a card thrown sideways was
   * sliced off there instead of leaving the screen. The padding moves inward instead — onto the header
   * and onto each panel's own content — which leaves the viewport full width and its clip where it
   * belongs, at the screen edge.
   */
  questionsBody: {
    flex: 1,
    paddingBottom: BODY_BOTTOM_PAD,
    gap: 16,
  },
  /** The page inset, applied per panel now rather than to the whole body. */
  panelPad: {
    paddingHorizontal: PAGE_PADDING,
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
    // No `gap`: the space between the buttons is a margin on the Next half instead, so it can shrink
    // away with it. A gap is charged between children whatever their width, which would have left
    // Back 9pt short of the full row once Next collapsed to nothing.
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  footerButton: {
    flex: 1,
    height: FOOTER_BUTTON_HEIGHT,
  },
  /**
   * The Next half, which collapses rather than unmounting.
   *
   * `flexGrow` is animated, so `flexBasis: 0` and `flexShrink: 1` are spelled out here — together they
   * are what `flex: 1` means, and the grow half has to be left free for the animation to drive.
   * `overflow: hidden` keeps the button from spilling out of the shrinking box on its way down.
   */
  footerNext: {
    flexBasis: 0,
    flexShrink: 1,
    overflow: 'hidden',
    // Fixed, for the reason given on `FOOTER_BUTTON_HEIGHT` — this is the half that collapses, so it
    // is the one whose reflow would otherwise drive the row's height.
    height: FOOTER_BUTTON_HEIGHT,
  },
});
