import React, { useEffect } from 'react';
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path, Rect, type SvgProps } from 'react-native-svg';

import QuestionnaireIcon from '../../theme/icons/questionnaire.svg';
import SpeechIcon from '../../theme/icons/speech.svg';
import PhysicalIcon from '../../theme/icons/physical.svg';
import MedicationIcon from '../../theme/icons/medicine.svg';
import ExpiryIcon from '../../theme/icons/expiry.svg';
import DurationIcon from '../../theme/icons/duration.svg';
import QuantityIcon from '../../theme/icons/quantity.svg';
import {
  fontFamily,
  getColorTokens,
  layout as layoutTokens,
  tracking,
  withAlpha,
  type ThemeColorOverrides,
  type ThemeMode,
} from '../../theme/theme';
import { useTopInset } from './useTopInset';
import { useBottomInset } from './useBottomInset';
import { TYPE_COLORS, TASK_TINT, type TaskCardType } from './nodes/card/TaskCardNode';

/** The big illustrated icon shown in the blob — the task's own type icon (Figma 3252:4057). */
const TASK_ICON: Record<TaskCardType, ComponentType<SvgProps>> = {
  questionnaire: QuestionnaireIcon,
  speech: SpeechIcon,
  physical: PhysicalIcon,
  medication: MedicationIcon,
};

export interface TaskInstructionsScreenProps {
  /** Task title (assessment `name`). */
  taskName: string;
  /** Instruction copy — the task's `description` (from `protocol.json`'s `startText`). */
  description?: string;
  /** Drives the blob/icon color-coding and which icon is shown. */
  taskType: TaskCardType;
  /** Estimated completion time, e.g. "1 min". */
  duration?: string;
  /** Time left in the completion window, e.g. "24H 00M". */
  expirationTime?: string;
  /** Question count label, e.g. "x8". */
  questionNumber?: string;
  /** Back arrow — dismiss the page. */
  onBack: () => void;
  /** "Lets Start" — begin the task. */
  onStart: () => void;
  /** "Remind Me Later" — dismiss without starting. */
  onRemindLater?: () => void;
  /** Which theme's tokens to use. Defaults to the device color scheme. */
  mode?: ThemeMode;
  brandColors?: ThemeColorOverrides;
}

/**
 * Task instructions page — Figma node 3252:4057. Slides in from the right when a task is tapped on the
 * home screen. Leads with an explicit "Instructions" heading (the task's name sits as a small header
 * label, not a big title) followed by the description and the duration / time-left / questions pills,
 * with the type illustration below — a layout deliberately unlike a question screen, so users stop
 * mistaking this briefing for the task's first question. Color-coded by task type with the same
 * palette as the home card (`TYPE_COLORS`): the blob uses the solid `badge` color with a white icon,
 * and the pills use the light `pillBg` with `accent` text. Content comes from the task's
 * `protocol.json` assessment. A gentle idle animation on the icon stands in for real instructions.
 */
export function TaskInstructionsScreen({
  taskName,
  description,
  taskType,
  duration,
  expirationTime,
  questionNumber,
  onBack,
  onStart,
  onRemindLater,
  mode,
  brandColors,
}: TaskInstructionsScreenProps) {
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const tokens = getColorTokens(resolvedMode, brandColors);
  const topInset = useTopInset();
  const bottomInset = useBottomInset(16); // clear the home indicator / gesture bar + the design's 16px gap

  // Same per-type palette as the home task card (`TYPE_COLORS`): solid `badge`, light `pillBg`, `accent`.
  const c = TYPE_COLORS[taskType];
  const brand = tokens.button.background; // navy — title, primary button, outline
  const onBrand = tokens.navbar.text.primary; // white — primary button label
  const Icon = TASK_ICON[taskType];

  // Idle "instruction" animation: a gentle bob + slight sway, looping — a stand-in for real animated
  // instructions. Kept subtle so it reads as life, not distraction.
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [bob]);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -8 * bob.value },
      { rotate: `${-3 + 6 * bob.value}deg` },
    ],
  }));

  // Matches the home task card's pills exactly: the type color at `TASK_TINT` opacity behind a
  // full-opacity icon + text of the same color.
  const detailPill = (PillIcon: ComponentType<SvgProps>, label: string) => (
    <View style={[styles.pill, { backgroundColor: withAlpha(c, TASK_TINT) }]}>
      <PillIcon width={12} height={12} color={c} />
      <Text style={[styles.pillText, { color: c }]}>{label}</Text>
    </View>
  );

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: tokens.background.primary,
          paddingTop: topInset,
          paddingBottom: bottomInset,
        },
      ]}
    >
      {/* Header: back chip + the task name as a small centered label (the spacer balances the chip). */}
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={8}>
          {({ pressed }) => (
            <BackChip
              circleColor={pressed ? brand : tokens.card.stats.openBadge}
              iconColor={pressed ? onBrand : tokens.card.stats.openIcon}
            />
          )}
        </Pressable>
        <Text style={[styles.taskName, { color: tokens.card.hint.text }]} numberOfLines={1}>
          {taskName}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Body: the "Instructions" heading + description + pills lead, illustration below, buttons at
          the bottom — a briefing layout, not a question screen. */}
      <View style={styles.body}>
        <View style={styles.topGroup}>
          <View style={styles.textBlock}>
            <Text style={[styles.heading, { color: brand }]}>Instructions</Text>

            {description ? (
              <Text style={[styles.description, { color: tokens.card.hint.text }]}>{description}</Text>
            ) : null}

            <View style={styles.pillsRow}>
              {expirationTime ? detailPill(ExpiryIcon, `${expirationTime} Left`) : null}
              {duration ? detailPill(DurationIcon, duration) : null}
              {questionNumber ? detailPill(QuantityIcon, `${questionNumber} Questions`) : null}
            </View>
          </View>

          <View style={[styles.blob, { backgroundColor: c }]}>
            <Animated.View style={iconStyle}>
              {/* Square size — the task-type SVGs use a square viewBox (32×32 on the card). */}
              <Icon width={150} height={150} color="#FFFFFF" />
            </Animated.View>
          </View>
        </View>

        <View style={styles.buttonsRow}>
          <Pressable
            accessibilityRole="button"
            onPress={onRemindLater ?? onBack}
            style={({ pressed }) => [
              styles.button,
              styles.outlineButton,
              { borderColor: brand },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.buttonLabel, { color: brand }]}>Remind Me Later</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={onStart}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: brand },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.buttonLabel, { color: onBrand }]}>Lets Start</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Back button (circular chip + left arrow) — Figma node 3252:4083; colors themed. */
function BackChip({
  size = 36,
  circleColor,
  iconColor,
}: {
  size?: number;
  circleColor: string;
  iconColor: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <Rect width="36" height="36" rx="18" fill={circleColor} />
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16.491 8.19531L6.68629 18L16.491 27.8047L17.9994 26.2963L10.7696 19.0664L28.2472 19.0665L28.2473 16.9335L10.7696 16.9336L17.9994 9.70372L16.491 8.19531Z"
        fill={iconColor}
      />
    </Svg>
  );
}

// Outline button border — its width is subtracted from the padding so both buttons are the same height.
const BUTTON_PADDING = 16;
const OUTLINE_BORDER = 3;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 12,
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },
  taskName: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 20,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  heading: {
    width: '100%',
    fontSize: 24,
    // > font size so tall glyphs / descenders aren't clipped on Android (includeFontPadding off).
    lineHeight: 30,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  body: {
    flex: 1,
    width: '100%',
    justifyContent: 'space-between',
  },
  topGroup: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  textBlock: {
    width: '100%',
    alignItems: 'flex-start',
    // Explicit per-gap spacing (not a uniform `gap`): 9px heading→description, 16px description→pills.
  },
  blob: {
    width: '100%',
    height: 300,
    borderRadius: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: {
    width: '100%',
    marginTop: 9, // gap below the "Instructions" heading
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  pillsRow: {
    width: '100%',
    marginTop: 16, // gap below the description
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 9,
  },
  pill: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: layoutTokens.radiusPill,
  },
  pillText: {
    fontSize: 12,
    // Line height > font size + vertical centering so Android doesn't clip the pill text (the old
    // fixed-height wrapper cropped it). `textAlignVertical` is an Android no-op on iOS.
    lineHeight: 16,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  buttonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    width: '100%',
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: BUTTON_PADDING,
    borderRadius: 24,
    minHeight: 52,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: OUTLINE_BORDER,
    paddingVertical: BUTTON_PADDING - OUTLINE_BORDER,
  },
  pressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    fontSize: 16,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
