import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import type { Question, SelectChoice } from '../../../../types';
import { PRESS_IN_MS, PRESS_OUT_MS, PRESS_SCALE } from './choicePress';
import { RING_ALPHA, SELECTED_RING, SELECT_MS } from './optionCard';
import { plainLabel, richLabel } from './richLabel';
import { cardShadow, ensureContrast, fontFamily, mix, tracking, withAlpha } from '../../../../theme/theme';

/** Rows with at least this many options are a scale and fill up to the answer; yes/no fills only it. */
const SCALE_MIN_CHOICES = 3;

// Figma 4460:25232.
const CARD_RADIUS = 36;
const STEP_HEIGHT = 26;
/** The filled step's pale edge, drawn as a padded parent so it sits outside the fill. */
const STEP_EDGE = 2;
const STEP_EDGE_ALPHA = 0.5;
/** An empty step: the accent over the card. On the default sky this is Figma's #E3F4FA. */
const EMPTY_TINT = 0.22;
/** Delay between neighbouring steps, so the bar fills up rather than flipping at once. */
const STEP_STAGGER_MS = 40;
/** Labels over empty steps recede, so the filled part of the bar reads first. */
const IDLE_LABEL_OPACITY = 0.7;
const RING_MS = 220;

interface MatrixLevelBarProps {
  question: Question;
  answer: unknown;
  /** The next row to answer, which wears the selected ring. */
  active: boolean;
  onSelect: (choice: SelectChoice) => void;
  accentColor: string;
  surfaceColor: string;
  /** The statement: the brand, as the screen's title is. */
  titleColor: string;
  textSecondaryColor: string;
  onLayout: (event: LayoutChangeEvent) => void;
}

/** One matrix row as a card: the statement and a bar of its options, filled to the answer. */
export function MatrixLevelBar({
  question,
  answer,
  active,
  onSelect,
  accentColor,
  surfaceColor,
  titleColor,
  textSecondaryColor,
  onLayout,
}: MatrixLevelBarProps) {
  const choices = question.select_choices_or_calculations ?? [];
  const selectedIndex = answer == null ? -1 : choices.findIndex((c) => c.code === String(answer));
  const isScale = choices.length >= SCALE_MIN_CHOICES;

  // Where the bar ended last render, so the stagger runs outward from it in either direction.
  const previous = useRef(selectedIndex);
  const from = previous.current;
  useEffect(() => {
    previous.current = selectedIndex;
  }, [selectedIndex]);

  // Resolved on the JS thread: worklets can't call `mix` / `withAlpha`.
  const emptyColor = mix(surfaceColor, accentColor, EMPTY_TINT);
  const edgeColor = withAlpha(accentColor, STEP_EDGE_ALPHA);
  // The accent, deepened to AA where it's too light to read (the default sky is 1.86:1 on white).
  const checkedLabelColor = ensureContrast(accentColor, surfaceColor, 4.5);
  const ringClear = withAlpha(accentColor, 0);
  const ringVisible = withAlpha(accentColor, RING_ALPHA);

  const ring = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    ring.value = withTiming(active ? 1 : 0, { duration: RING_MS, easing: Easing.out(Easing.quad) });
  }, [active, ring]);
  const ringStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(ring.value, [0, 1], [ringClear, ringVisible]),
  }));

  return (
    <Animated.View
      accessibilityRole="radiogroup"
      accessibilityLabel={plainLabel(question.field_label)}
      onLayout={onLayout}
      style={[styles.ring, ringStyle]}
    >
      <View style={[styles.card, { backgroundColor: surfaceColor }, cardShadow]}>
        {/* Never truncated: the participant must read the whole statement. */}
        <Text style={[styles.title, { color: titleColor }]}>
          {richLabel(question.field_label?.trim())}
        </Text>

        <View style={styles.bar}>
          {choices.map((choice, index) => {
            const filled = isScale ? index <= selectedIndex : index === selectedIndex;
            const order = !isScale ? 0 : selectedIndex > from ? index - from - 1 : from - index;
            return (
              <Step
                key={choice.code}
                label={choice.label}
                filled={filled}
                checked={index === selectedIndex}
                delay={Math.max(0, order) * STEP_STAGGER_MS}
                onPress={() => onSelect(choice)}
                accentColor={accentColor}
                emptyColor={emptyColor}
                edgeColor={edgeColor}
                labelColor={textSecondaryColor}
                checkedLabelColor={checkedLabelColor}
              />
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

function Step({
  label,
  filled,
  checked,
  delay,
  onPress,
  accentColor,
  emptyColor,
  edgeColor,
  labelColor,
  checkedLabelColor,
}: {
  label: string;
  filled: boolean;
  checked: boolean;
  delay: number;
  onPress: () => void;
  accentColor: string;
  emptyColor: string;
  edgeColor: string;
  labelColor: string;
  /** The chosen answer's label, so the answer reads in words and "None" can't pass for unanswered. */
  checkedLabelColor: string;
}) {
  const fill = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    fill.value = withDelay(
      delay,
      withTiming(filled ? 1 : 0, { duration: SELECT_MS, easing: Easing.out(Easing.quad) }),
    );
    // Keyed on `filled` alone: the delay only matters at the moment the step changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filled]);

  const pick = useSharedValue(checked ? 1 : 0);
  useEffect(() => {
    pick.value = withTiming(checked ? 1 : 0, { duration: SELECT_MS, easing: Easing.out(Easing.quad) });
  }, [checked, pick]);
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(pick.value, [0, 1], [labelColor, checkedLabelColor]),
    // Filled steps keep their label at full strength; only the empty ones recede.
    opacity: IDLE_LABEL_OPACITY + (1 - IDLE_LABEL_OPACITY) * Math.max(fill.value, pick.value),
  }));

  const press = useSharedValue(0);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - PRESS_SCALE) * press.value }],
  }));
  // Both start from the empty colour, never `transparent`, so they don't pass through black.
  const edgeStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(fill.value, [0, 1], [emptyColor, edgeColor]),
  }));
  const fillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(fill.value, [0, 1], [emptyColor, accentColor]),
  }));

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      accessibilityLabel={plainLabel(label)}
      onPress={onPress}
      onPressIn={() => {
        press.value = withTiming(1, { duration: PRESS_IN_MS, easing: Easing.out(Easing.quad) });
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: PRESS_OUT_MS, easing: Easing.out(Easing.quad) });
      }}
      hitSlop={{ top: 6, bottom: 10 }}
      style={styles.step}
    >
      <Animated.View style={[styles.stepInner, pressStyle]}>
        {/* The weight can't animate, so it switches as the colour eases over. */}
        <Animated.Text style={[styles.stepLabel, checked && styles.stepLabelChecked, labelStyle]}>
          {richLabel(label.trim())}
        </Animated.Text>
        <Animated.View style={[styles.stepEdge, edgeStyle]}>
          <Animated.View style={[styles.stepFill, fillStyle]} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** Reserved even when clear, so the ring appearing never reflows the list. */
  ring: {
    padding: SELECTED_RING,
    borderRadius: CARD_RADIUS + SELECTED_RING,
  },
  card: {
    paddingHorizontal: 26,
    paddingVertical: 16,
    gap: 9,
    borderRadius: CARD_RADIUS,
  },
  title: {
    fontSize: 16,
    lineHeight: 21,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
    letterSpacing: tracking.medium,
    includeFontPadding: false,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 4,
  },
  /** An even share of the bar, whatever each label's length. */
  step: {
    flexBasis: 0,
    flexGrow: 1,
  },
  /** Labels sit on the pills, so a label that wraps pushes up rather than misaligning the bar. */
  stepInner: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 4,
  },
  stepLabel: {
    fontSize: 12,
    lineHeight: 15,
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontWeight: '500',
    letterSpacing: tracking.medium,
    includeFontPadding: false,
  },
  stepLabelChecked: {
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    letterSpacing: tracking.semiBold,
  },
  stepEdge: {
    height: STEP_HEIGHT,
    padding: STEP_EDGE,
    borderRadius: STEP_HEIGHT / 2,
  },
  stepFill: {
    flex: 1,
    borderRadius: STEP_HEIGHT / 2 - STEP_EDGE,
  },
});

export type { MatrixLevelBarProps };
