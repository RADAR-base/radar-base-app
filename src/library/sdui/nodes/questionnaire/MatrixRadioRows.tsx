import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { Question, SelectChoice } from '../../../../types';
import {
  PRESS_IN_MS,
  PRESS_OUT_MS,
  PRESS_PREVIEW,
  PRESS_SCALE,
} from './choicePress';
// The same ink the radio and checkbox put on a chosen option, and for the same reason — one white,
// documented once, rather than three that happen to agree today.
import { ON_ACCENT } from './optionCard';
import {
  cardShadow,
  fontFamily,
  layout as layoutTokens,
  mix,
  tracking,
  withAlpha,
} from '../../../../theme/theme';

interface MatrixRadioRowsProps {
  /** The matrix block, in order — one card per question. */
  questions: Question[];
  /** Answers so far, by `field_name`. */
  answers: Record<string, unknown>;
  onAnswer: (fieldName: string, value: string) => void;
  /** Fill for the chosen segment (the manifest accent), and the tick on an answered card. */
  accentColor: string;
  /** The card surface each row is drawn on. */
  surfaceColor: string;
  /** The ink on that surface — each row's question. */
  textColor: string;
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
}

/**
 * The card's corner.
 *
 * Rounder than `radiusCard`'s 12: these are small cards, and at this height a 12 reads almost square.
 */
const CARD_RADIUS = 16;

/**
 * The segmented track, and the segment that fills inside it.
 *
 * Fully rounded, in the same idiom as `RadioInput`'s options — a radius far
 * larger than the height, so both stay pills whatever the row's height turns out to be.
 */
const TRACK_RADIUS = 100;
const SEGMENT_RADIUS = 100;

/**
 * The track holds no inset around its segments.
 *
 * A chosen option fills its share of the track exactly — full height, edge to edge — so the track is
 * divided by the answer rather than containing it. Anything else leaves a sliver of track showing
 * around the pill, which at this size reads as a misalignment rather than as padding. What marks the
 * answer out is the halo, which goes the other way entirely and spills past the track.
 */

/**
 * How far the halo reaches out past the pill, and how strongly it is drawn.
 *
 * With the pill filling the track, this is the halo's whole visible thickness and all of it falls
 * outside the track — so it is the one number to turn when the ring reads heavy or light, with
 * nothing else to keep in step with it.
 */
const HALO_SPILL = 4;
const HALO_ALPHA = 0.5;

/**
 * How far each option reaches under the one before it.
 *
 * Two fully-rounded pills cannot sit flush. They touch only at mid-height; towards the top and bottom
 * each cap has curved away by its radius, opening a lens of bare track between them — at this height
 * a clamped radius of 20 leaves 40pt of it at the widest. Beside a chosen option that gap is the pale
 * band you see, and while an answer is changing hands it is at its most obvious, since neither pill is
 * yet filled enough to close it.
 *
 * Tucking each option under its neighbour closes the gap by this much. It costs no room for labels —
 * a negative margin gives flex *more* free space to share out, so every option ends up wider, not
 * narrower — but it can't go much further than the radius without the chosen pill reaching past its
 * neighbour's label and colouring the text of an answer that isn't chosen.
 */
const SEGMENT_OVERLAP = 20;

/**
 * The card's edge, at a width that never changes.
 *
 * Three states share it — plain, answered, next up — and only the colour moves between them. Growing
 * the border to mark the active card instead would reflow every card below it on each answer, right
 * as the list is scrolling.
 */
const CARD_BORDER = 2;

/**
 * The answered card's edge, and the card's own tint, as distances rather than values.
 *
 * Mixed to an opaque colour rather than laid on at an alpha: each is drawn over the card's own fill,
 * and a translucent edge over a fill blends into it — the same reason the card ring elsewhere in this
 * folder is a parent view and not a border.
 *
 * There is no plain-card value: an untouched card has no edge at all, only the theme's shadow lifting
 * it off the page. Its border is still there at full width, painted in the card's own colour — which
 * is what keeps the card from resizing the moment it gains one.
 *
 * `CARD_TINT` shades the card away from the theme's surface, which the *options* keep — the reverse
 * of how a card is usually built. It is what makes the options read as controls resting on the card
 * rather than as a bar cut into it, which is the whole difference between this and a segmented strip.
 */
const EDGE_ANSWERED = 0.35;
const CARD_TINT = 0.06;

/** How long a segment takes to fill, and an edge to change what it is saying. */
const SELECT_MS = 180;
const EDGE_MS = 220;

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
 * How deep the page fades into the list at each end.
 *
 * Enough to cover most of a card, so a row leaving the top goes softly rather than being sliced by an
 * edge — a little over the card's own height, which is a label and a track of options.
 */
const FADE_HEIGHT = 40;

/** Stable, SVG-safe unique suffix for gradient ids (`useId`'s ':' is invalid inside `url(#…)`). */
function useIdSafe(): string {
  return React.useId().replace(/:/g, '');
}

/**
 * One end of the list, fading into the page.
 *
 * Painted rather than masked: React Native has no mask without `@react-native-masked-view`, so this is
 * the page's own colour laid over the list at full opacity where the edge is and nothing where the
 * list is — which comes to the same thing as long as it is given the colour actually behind it.
 */
function EdgeFade({
  color,
  width,
  height,
  reversed,
}: {
  color: string;
  /**
   * The fade's size in points, measured by the caller.
   *
   * Given as numbers rather than `"100%"`: react-native-svg only resolves a percentage on the root
   * `Svg` against a viewBox, and with none set it measures zero and draws nothing at all.
   */
  width: number;
  /**
   * Taller than the gradient where the edge has to keep covering past it.
   *
   * The bottom one runs down behind the footer: a gradient alone would hand the list back at full
   * strength the moment it ended, and the row sitting under the buttons would read straight through
   * them. It fades over `FADE_HEIGHT` and then holds the page's colour the rest of the way.
   */
  height: number;
  reversed?: boolean;
}) {
  const id = `matrixFade${useIdSafe()}${reversed ? 'B' : 'T'}`;
  if (!width || !height) return null;
  // Where the gradient finishes and the flat colour takes over, as a fraction of the whole.
  const turn = Math.min(1, FADE_HEIGHT / height);
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2={height} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={color} stopOpacity={reversed ? 0 : 1} />
          <Stop offset={turn} stopColor={color} stopOpacity={reversed ? 1 : 0} />
          <Stop offset="1" stopColor={color} stopOpacity={reversed ? 1 : 0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * A matrix block as a list of thin cards, each with its own segmented control.
 *
 * Every row of the block is on the page at once: its question, and beneath it a track divided evenly
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
  backgroundColor,
  bottomReserve = 0,
  pageInset = 0,
}: MatrixRadioRowsProps) {
  const scroller = useRef<ScrollView>(null);
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

    const card = cards.current[next.field_name];
    if (!card || !viewport.height) return;
    // Centred in the viewport, as the design's `scrollIntoView({ block: 'center' })` does — a row that
    // lands at the very top reads as the end of the list rather than as the next thing to do.
    const y = Math.max(0, card.y - (viewport.height - card.height) / 2);
    scroller.current?.scrollTo({ y, animated: true });
  };

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
            <MatrixRow
              key={key}
              question={question}
              answer={question.field_name ? answers[question.field_name] : undefined}
              active={active != null && active === question.field_name}
              onSelect={(choice) => handleSelect(question, choice)}
              accentColor={accentColor}
              surfaceColor={surfaceColor}
              textColor={textColor}
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

/**
 * One question and its options, as a card.
 *
 * A component per row because each needs its own shared values, and hooks can't be created in a loop.
 */
function MatrixRow({
  question,
  answer,
  active,
  onSelect,
  accentColor,
  surfaceColor,
  textColor,
  onLayout,
}: {
  question: Question;
  answer: unknown;
  /** Whether this is the row the list is pointing at — the next one without an answer. */
  active: boolean;
  onSelect: (choice: SelectChoice) => void;
  accentColor: string;
  surfaceColor: string;
  textColor: string;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  const choices = question.select_choices_or_calculations ?? [];
  const answered = answer != null;

  // Every endpoint resolved here, on the JS thread. `useAnimatedStyle` bodies are worklets and can
  // only call other worklets, so `mix` cannot be called inside one; plain strings close over fine.
  //
  // The card is the shaded one and the options keep the theme's surface — see `CARD_TINT`.
  const cardColor = mix(surfaceColor, textColor, CARD_TINT);
  const optionColor = surfaceColor;
  // The card's own colour, so an untouched card shows no edge while still reserving the width.
  const edgePlain = cardColor;
  const edgeAnswered = mix(cardColor, accentColor, EDGE_ANSWERED);

  /**
   * The card's three states on one value: 0 plain, 0.5 answered, 1 next up.
   *
   * One value rather than a flag apiece, because they are a sequence and not a set — a card is ringed,
   * then answered, then plain — and interpolating a single 0→1 keeps the edge on one continuous path
   * instead of cross-fading two colours that disagree about where it is.
   */
  const emphasis = useSharedValue(active ? 1 : answered ? 0.5 : 0);
  useEffect(() => {
    emphasis.value = withTiming(active ? 1 : answered ? 0.5 : 0, {
      duration: EDGE_MS,
      easing: Easing.out(Easing.quad),
    });
  }, [active, answered, emphasis]);

  const edgeStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      emphasis.value,
      [0, 0.5, 1],
      [edgePlain, edgeAnswered, accentColor],
    ),
  }));

  return (
    <Animated.View
      accessibilityRole="radiogroup"
      accessibilityLabel={question.field_label}
      onLayout={onLayout}
      style={[styles.card, { backgroundColor: cardColor }, cardShadow, edgeStyle]}
    >
      {/* No tick beside it: the filled segment already says the row is answered, and the card's edge
          says it again. A third mark for the same fact is what makes a list of them feel busy. */}
      <Text style={[styles.label, { color: textColor }]} numberOfLines={2}>
        {question.field_label ?? ''}
      </Text>

      {/* Divided evenly between this row's own options, whatever there are of them — which is what
          lets a block mix a four-point scale with a yes/no without either looking out of place. */}
      <View style={[styles.track, { backgroundColor: optionColor }]}>
        {choices.map((choice, index) => (
          <Segment
            key={choice.code}
            label={choice.label}
            selected={answer != null && String(answer) === choice.code}
            onPress={() => onSelect(choice)}
            accentColor={accentColor}
            optionColor={optionColor}
            textColor={textColor}
            // Every option but the first tucks under the one before it. The first doesn't, or the row
            // would start outside the track it sits in.
            overlapped={index > 0}
          />
        ))}
      </View>
    </Animated.View>
  );
}

/**
 * One option in the track.
 *
 * Idle is the track's own colour rather than `transparent`: interpolating from a fully transparent
 * colour darkens through it on the way, because the colour underneath the alpha is still black.
 */
function Segment({
  label,
  selected,
  onPress,
  accentColor,
  optionColor,
  textColor,
  overlapped,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accentColor: string;
  /** The unchosen option's fill — the theme's surface, which the track is painted in too. */
  optionColor: string;
  /** The unchosen option's label: the card's full-strength ink, as a radio option's is. */
  textColor: string;
  /** Whether this option reaches back under the one before it — see `SEGMENT_OVERLAP`. */
  overlapped: boolean;
}) {
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, {
      duration: SELECT_MS,
      easing: Easing.out(Easing.quad),
    });
  }, [selected, progress]);

  const press = useSharedValue(0);

  /**
   * Whether this segment is being pressed — in React state, unlike the press animation beside it.
   *
   * Only so it can be lifted above its neighbours while its halo is out. `zIndex` is a discrete value
   * that the layout has to be re-evaluated for, so it can't ride the shared value the way a colour or
   * a scale does. Two renders a tap, which is nothing next to what a clipped halo looks like.
   */
  const [pressing, setPressing] = useState(false);

  /** The halo's colour, fixed — see `haloStyle` for why it isn't interpolated. */
  const haloColor = withAlpha(accentColor, HALO_ALPHA);

  /**
   * What the halo and fill follow: whichever is further along, the answer or the press.
   *
   * Declared before the styles that read it — Reanimated captures a worklet's closure as the worklet
   * is built, so a value defined further down would still be in its temporal dead zone.
   */
  const emphasis = useDerivedValue(() => Math.max(progress.value, press.value * PRESS_PREVIEW));

  /**
   * The halo comes and goes on opacity, where the fill changes colour.
   *
   * It has to, now that it reaches past the track: its idle state has to be nothing at all, and
   * interpolating from `transparent` would drag the colour through black on the way, because what
   * sits under that alpha is still black. A fixed colour at a moving opacity has no such midpoint.
   */
  const haloStyle = useAnimatedStyle(() => ({ opacity: emphasis.value }));
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - PRESS_SCALE) * press.value }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(emphasis.value, [0, 1], [optionColor, accentColor]),
  }));
  // The label stays on the answer itself, so a press that slides off doesn't leave it half-recoloured.
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [textColor, ON_ACCENT]),
  }));

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => {
        setPressing(true);
        press.value = withTiming(1, { duration: PRESS_IN_MS, easing: Easing.out(Easing.quad) });
      }}
      onPressOut={() => {
        setPressing(false);
        press.value = withTiming(0, { duration: PRESS_OUT_MS, easing: Easing.out(Easing.quad) });
      }}
      // Above its neighbours whenever its halo is out. Siblings paint in order, so without this the
      // option to the right draws its own share of the track straight over the halo's spill.
      style={[
        styles.segmentPressable,
        overlapped && styles.segmentOverlapped,
        (selected || pressing) && styles.segmentRaised,
      ]}
    >
      <Animated.View style={[styles.segmentSlot, pressStyle]}>
        {/* A box the size of the pill exactly, and nothing else — it carries no padding, so the halo's
            negative insets are measured from the pill's own edge rather than from somewhere inside a
            parent's padding, which is where that measurement gets away from you. */}
        <View style={styles.pillBox}>
          {/* Out of the flow and inset negatively, so it reaches past the track it sits in rather
              than being penned inside it. First child, so it paints behind the pill. */}
          <Animated.View
            pointerEvents="none"
            style={[styles.halo, { backgroundColor: haloColor }, haloStyle]}
          />
          <Animated.View style={[styles.segment, fillStyle]}>
            <Animated.Text style={[styles.segmentLabel, labelStyle]} numberOfLines={1}>
              {label}
            </Animated.Text>
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
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
    gap: 10,
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
  /** The card's own padding, at `RadioInput`'s figure so a block sits at the same scale as a radio. */
  card: {
    padding: layoutTokens.cardPadding,
    gap: layoutTokens.gap,
    borderRadius: CARD_RADIUS,
    borderWidth: CARD_BORDER,
  },
  label: {
    fontSize: 14,
    // Taller than the font size so descenders aren't clipped on Android.
    lineHeight: 18,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    letterSpacing: tracking.semiBold,
    includeFontPadding: false,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: TRACK_RADIUS,
  },
  /**
   * An even share of the track, whatever the option count.
   *
   * `flexBasis: 0` as well as `flexGrow`, so the share is of the whole track rather than of what is
   * left after each label's own width — otherwise "Moderate" would take a wider segment than "None".
   */
  segmentPressable: {
    flexBasis: 0,
    flexGrow: 1,
  },
  /** Reaches back under the option before it, closing the gap their caps leave — `SEGMENT_OVERLAP`. */
  segmentOverlapped: {
    marginLeft: -SEGMENT_OVERLAP,
  },
  /**
   * Lifts a segment over the ones beside it, so its halo isn't painted out by them.
   *
   * The halo reaches past the pill into its neighbours' share of the track, and siblings paint in the
   * order they are declared — so without this the option to the right covers the spill on that side,
   * and the ring comes out cut off on one edge or, for a middle option, both.
   */
  segmentRaised: {
    zIndex: 1,
  },
  /**
   * The segment's place in the track — its full share of it, with no inset of its own.
   *
   * Deliberately holds no `flex`. The track takes its height from these, so a slot that tried to fill
   * it would have nothing to take a share of and collapse — the same trap that once flattened the
   * deck's buttons into bars. The pill's own padding sets the height and the track follows it, which
   * is what makes the fill exactly the container's height without either being told to match.
   */
  segmentSlot: {
    alignSelf: 'stretch',
  },
  /** Exactly the pill's box, so the halo's insets are measured from the pill and nothing else. */
  pillBox: {
    position: 'relative',
  },
  /**
   * The halo, out of the flow so it can cross the track's edge.
   *
   * It reaches `HALO_SPILL` past the pill, which itself sits `TRACK_PAD + SEGMENT_INSET` inside the
   * track — so the halo crosses the track's edge by the difference, and is a ring around the answer
   * rather than a filling-in of the gap around it.
   */
  halo: {
    position: 'absolute',
    top: -HALO_SPILL,
    bottom: -HALO_SPILL,
    left: -HALO_SPILL,
    right: -HALO_SPILL,
    borderRadius: SEGMENT_RADIUS,
  },
  /**
   * Roomier than a segmented strip's, nearer the checkbox chip's 16 × 12.
   *
   * These are buttons on a card now rather than divisions of a bar, so they are sized like the app's
   * other buttons. The horizontal figure stays the smaller of the two because the track is shared
   * between every option on the row — padding here costs label width, where on a chip it costs
   * nothing but the chip's own size.
   */
  segment: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: SEGMENT_RADIUS,
  },
  segmentLabel: {
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    letterSpacing: tracking.semiBold,
    includeFontPadding: false,
  },
});

export type { MatrixRadioRowsProps };
