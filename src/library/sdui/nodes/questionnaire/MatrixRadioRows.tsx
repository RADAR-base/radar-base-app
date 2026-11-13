import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { Question, SelectChoice } from '../../../../types';
import { SELECTED_RING } from './optionCard';
import { EdgeFade, FADE_HEIGHT } from './EdgeFade';
import { MatrixLevelBar } from './MatrixLevelBar';
import { cardShadowBleed, withAlpha } from '../../../../theme/theme';

interface MatrixRadioRowsProps {
  /** The matrix block, in order — one card per question. */
  questions: Question[];
  /** Answers so far, by `field_name`. */
  answers: Record<string, unknown>;
  onAnswer: (fieldName: string, value: string) => void;
  /** Fill for the chosen steps and the next row's ring (the manifest accent). */
  accentColor: string;
  /** The cards' fill. */
  surfaceColor: string;
  /** The brand — each row's question. */
  primaryColor: string;
  /** The ink on that surface. */
  textColor: string;
  /** The level bar's step labels. Defaults to `textColor` at 60%. */
  textSecondaryColor?: string;
  /**
   * The page behind the list, which its ends fade into.
   *
   * It has to be the actual page colour rather than anything derived: the fade is that colour painted
   * over the list, so a near-miss reads as a grey band across the top instead of as the list going.
   */
  backgroundColor: string;
  /**
   * The footer's footprint, which this list keeps clear at the bottom of its own content.
   *
   * Its panel doesn't reserve it — see `panelBehaviour.padsFooter` — so that this scroller runs the
   * full height of the screen and a card passes under the footer rather than being cut off above it.
   */
  bottomReserve?: number;
  /**
   * The page's horizontal inset, which this list applies itself.
   *
   * Its panel already holds it, but a ScrollView clips to its own frame — and the theme's card shadow
   * reaches about 20pt past the card on the right. Flush against the padded edge, that spill is cut
   * off and the shadow reads as a hard line down one side. The list widens back out over the inset and
   * puts it on its content instead, so the frame it clips to is the screen and the shadow survives.
   */
  pageInset?: number;
  /**
   * How many times the participant has been refused — the screen's own counter.
   *
   * A refusal on a matrix page means a row is still unanswered, and the row is what they have to act
   * on. The screen can't scroll to it: the block owns its scroller, so it moves itself, the same
   * centring it uses when an answer lands. That keeps a refusal feeling the same here as it does on a
   * single-input page, where the screen's panel scrolls to the message instead.
   */
  submitAttempt?: number;
}

/** Space between rows. The rings take `SELECTED_RING` each side, so the cards keep their spacing. */
const ROW_GAP = cardShadowBleed + 6 - 2 * SELECTED_RING;

/**
 * How many rows a block can hold before the list starts scrolling.
 *
 * Up to this many fit a phone's page, so the list stays put: the tail that lets the last card reach
 * the middle of the screen isn't added, nothing scrolls, and the fades stay out of it. Without the
 * condition a two-row block still drags — the tail alone makes it taller than the page — which reads
 * as a list with something below it when there is nothing there at all.
 */
const ROWS_BEFORE_SCROLL = 4;

/**
 * A matrix block as a list of cards, each with its own level bar (`MatrixLevelBar`).
 *
 * Every row of the block is on the page at once: its question, and beneath it a bar divided evenly
 * between that row's own options. The scale lives on the row rather than in a shared header, so a
 * block whose rows disagree about their options still reads — four-point severity above a yes/no
 * above a three-way, each labelled where it is answered.
 *
 * Answering scrolls the next unanswered row to the middle of the screen and rings it, so the block is
 * worked through without the participant having to find their place after every tap. Nothing is
 * hidden by that: rows above stay answerable, and an answer can be changed by scrolling back.
 *
 * It owns its scrolling for that reason — see `panelBehaviour`, which hands this presentation a
 * panel that doesn't scroll so this one can.
 */
export function MatrixRadioRows({
  questions,
  answers,
  onAnswer,
  accentColor,
  surfaceColor,
  textColor,
  textSecondaryColor,
  primaryColor,
  backgroundColor,
  bottomReserve = 0,
  pageInset = 0,
  submitAttempt = 0,
}: MatrixRadioRowsProps) {
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  /**
   * The scroll viewport's height, and where each card sits in the content — both from layout.
   *
   * The viewport is state rather than a ref because the tail below the last card is measured from it:
   * without a re-render the list would keep the tail it had before it knew how tall it was.
   */
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const cards = useRef<Record<string, { y: number; height: number }>>({});

  /**
   * How far the list is scrolled, and how much of it there is — what the fades are read from.
   *
   * Shared values rather than state: they change on every frame of a scroll, and a re-render per
   * frame is exactly what driving an animation off the UI thread exists to avoid.
   *
   * All three come off the scroll event, which carries the content's size and the viewport's alongside
   * the offset. Reading them from `onContentSizeChange` and `onLayout` instead means the fade is wrong
   * until those happen to fire — and a content height still sitting at zero makes "how much is left
   * below" negative, which hides the bottom fade exactly when there is most to hide.
   */
  const offset = useSharedValue(0);
  const content = useSharedValue(0);
  const frame = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    offset.value = event.contentOffset.y;
    content.value = event.contentSize.height;
    frame.value = event.layoutMeasurement.height;
  });

  /**
   * Each fade is only there while there is something under it to hide.
   *
   * Measured in the fade's own height, so it arrives over exactly the distance it covers: at the very
   * top there is nothing above to fade, and a card's depth in it is fully there.
   */
  const topFadeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, offset.value / FADE_HEIGHT)),
  }));
  const bottomFadeStyle = useAnimatedStyle(() => {
    // How much further this could scroll. Zero at the bottom, where there is nothing left to cover.
    // Before the first scroll event the sizes are still zero, so the list is assumed to have more
    // below — which it does, or it wouldn't scroll at all.
    const remaining = content.value ? content.value - frame.value - offset.value : FADE_HEIGHT;
    return { opacity: Math.min(1, Math.max(0, remaining / FADE_HEIGHT)) };
  });

  /** Whether this block is long enough to need scrolling at all — see `ROWS_BEFORE_SCROLL`. */
  const scrolls = questions.length > ROWS_BEFORE_SCROLL;

  const nextUnanswered = (current: Record<string, unknown>, skip?: string) =>
    questions.find((q) => q.field_name && q.field_name !== skip && current[q.field_name] == null);

  /** Which card is ringed as the one to answer next. Picked up where a part-answered block left off. */
  const [active, setActive] = useState<string | undefined>(
    () => nextUnanswered(answers)?.field_name,
  );

  /**
   * Refused: take them to the row still wanting an answer.
   *
   * The screen fires the buzz and shows the message; this is the half only the block can do, since it
   * owns the scroller. A block that fits the page skips it — every row is already in view, and the
   * ring on the next one is the whole of the guidance it needs.
   */
  useEffect(() => {
    if (submitAttempt === 0 || !scrolls) return;
    const field = nextUnanswered(answers)?.field_name;
    if (!field) return;
    const frame = requestAnimationFrame(() => centreOn(field));
    return () => cancelAnimationFrame(frame);
    // Keyed on the attempt alone: pressing Next again on the same block has to move again, and
    // `answers` changing is the participant answering, which `handleSelect` already handles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitAttempt]);

  const handleSelect = (question: Question, choice: SelectChoice) => {
    const fieldName = question.field_name;
    if (!fieldName) return;
    onAnswer(fieldName, choice.code);

    // `answers` is still the state from before this tap, so the row just answered is excluded by name
    // rather than by waiting for the prop to come back round.
    const next = nextUnanswered(answers, fieldName);
    setActive(next?.field_name);

    // A block that fits the page has nowhere to take you — every row is already in view, and the ring
    // on the next one is the whole of the guidance it needs.
    if (!scrolls) return;

    if (!next?.field_name) {
      // Nothing left — run to the bottom, which is where the footer's Continue is waiting.
      scroller.current?.scrollToEnd({ animated: true });
      return;
    }

    centreOn(next.field_name);
  };

  /**
   * Bring one row to the middle of the viewport, as the design's `scrollIntoView({ block: 'center' })`
   * does — a row that lands at the very top reads as the end of the list rather than as the next thing
   * to do.
   *
   * Shared by the two things that move the list, so being refused takes you to the same place that
   * answering a row would.
   */
  function centreOn(fieldName: string) {
    const card = cards.current[fieldName];
    if (!card || !viewport.height) return;
    const y = Math.max(0, card.y - (viewport.height - card.height) / 2);
    scroller.current?.scrollTo({ y, animated: true });
  }

  return (
    // Widened back out over the page's inset, so the frame the list clips to is the screen's edge
    // rather than the card's — see `pageInset`. The fades ride on this too, and so span the full width.
    //
    // Measured here rather than on the scroller, because the fades need this width in points: an SVG
    // can't take it as a percentage (see `EdgeFade`), and it is this view they stretch across.
    <View
      style={[styles.frame, { marginHorizontal: -pageInset }]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setViewport({ width, height });
      }}
    >
      <Animated.ScrollView
        ref={scroller}
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: pageInset },
          // The footer's space always, since the last card has to clear it either way — plus, only
          // where the list scrolls, room for that card to reach the middle of the screen. Added to a
          // block that fits, this tail is what would make it taller than the page and let it drag.
          { paddingBottom: bottomReserve + (scrolls ? viewport.height / 2 : 0) },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrolls}
        onScroll={onScroll}
        // The fades are driven from the scroll offset, which needs every frame rather than the
        // default one-every-160ms.
        scrollEventThrottle={16}
      >
        {questions.map((question, index) => {
          const key = question.field_name ?? String(index);
          return (
            <MatrixLevelBar
              key={key}
              question={question}
              answer={question.field_name ? answers[question.field_name] : undefined}
              active={active != null && active === question.field_name}
              onSelect={(choice) => handleSelect(question, choice)}
              accentColor={accentColor}
              surfaceColor={surfaceColor}
              titleColor={primaryColor}
              textSecondaryColor={textSecondaryColor ?? withAlpha(textColor, 0.6)}
              onLayout={(event: LayoutChangeEvent) => {
                const { y, height } = event.nativeEvent.layout;
                cards.current[key] = { y, height };
              }}
            />
          );
        })}
      </Animated.ScrollView>

      {/* Only where the list scrolls. A fade marks content going past an edge, and a block that fits
          has none — but it would still be drawn: the bottom one reads its sizes from the scroll event,
          and assumes there is more below until one arrives. Without a scroll there is no such event,
          so it would hold at full strength over a short list forever.

          Over the list, never in its way — a fade that swallowed taps would make the first and last
          rows on screen unanswerable. */}
      {scrolls ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[styles.fade, styles.fadeTop, { height: FADE_HEIGHT }, topFadeStyle]}
          >
            <EdgeFade color={backgroundColor} width={viewport.width} height={FADE_HEIGHT} />
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            // Runs from where reading stops — the footer's top edge — all the way down behind it.
            //
            // The footer has no background of its own, so a row passing under it would otherwise read
            // straight through the gap between the buttons. This covers that whole strip: it fades
            // over its first `FADE_HEIGHT` and holds the page's colour the rest of the way, with the
            // footer drawn over the top of it.
            style={[
              styles.fade,
              { bottom: 0, height: FADE_HEIGHT + bottomReserve },
              bottomFadeStyle,
            ]}
          >
            <EdgeFade
              color={backgroundColor}
              width={viewport.width}
              height={FADE_HEIGHT + bottomReserve}
              reversed
            />
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Holds the list and the two fades over it, so the fades can be placed against the panel's edges. */
  frame: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: ROW_GAP,
  },
  /** Height is set per edge — the bottom one keeps covering past its gradient. See `EdgeFade`. */
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  fadeTop: {
    top: 0,
  },
});

export type { MatrixRadioRowsProps };
