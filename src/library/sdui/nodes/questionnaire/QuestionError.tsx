import React, { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import ErrorIcon from '../../../../theme/icons/error.svg';
import { fontFamily, tracking } from '../../../../theme/theme';

/** Failure red — design `color/red/400`, the same fixed semantic the speech recorder uses. It is
 *  deliberately not brand-tinted: "wrong" should read the same in every study's theme. */
export const FAILED_COLOR = '#E84855';

/** The error glyph (Figma 3977:1923, `clarity:error-standard-solid`). Drawn at 20 rather than its
 *  native 26 so it sits with the 14pt message rather than towering over it. */
const ERROR_ICON_SIZE = 20;

/** How long the message takes to rise into place, and how far it travels doing it. */
const MESSAGE_MS = 160;
const MESSAGE_RISE = 6;

/**
 * How far the row swings when a refusal is repeated, and over how long. Matches the text field's own
 * knock so every input refuses at the same speed.
 *
 * The row reserves this much margin either side: it fills the panel, and the panel sits inside
 * `StepSlider`'s clipping viewport, so without room to move into its edge would be sliced off.
 */
const SHAKE_DISTANCE = 6;
const SHAKE_MS = 220;
const SHAKE_STEP_MS = SHAKE_MS / 8;

/**
 * Why an answer was refused — an icon and a line of red, rising into place beneath the input it
 * belongs to.
 *
 * Shared so every question type says "wrong" the same way: the text field shows it under its card,
 * and the screen shows it under any other input that has no way to explain itself.
 */
export function QuestionError({
  message,
  style,
  shakeKey,
}: {
  /** The reason. Nothing renders when absent. */
  message?: string | null;
  /** Lets the caller line the row up with whatever it sits under. */
  style?: StyleProp<ViewStyle>;
  /**
   * Bump to knock the row sideways — the count of refusals, so a repeated press registers as a fresh
   * one. Omit where the caller shakes something of its own instead (the text field shakes its card).
   */
  shakeKey?: number;
}) {
  // Driven manually rather than with an `entering` layout animation — those strand an invisible
  // touch-blocking overlay on Android.
  const rise = useSharedValue(0);
  useEffect(() => {
    if (!message) {
      // Straight to zero, so a message that comes back starts from the bottom again rather than
      // picking up wherever the last fade-out had reached.
      rise.value = 0;
      return;
    }
    rise.value = withTiming(1, { duration: MESSAGE_MS });
  }, [message, rise]);

  const shake = useSharedValue(0);
  useEffect(() => {
    if (!shakeKey || !message) return;
    shake.value = withSequence(
      withTiming(-SHAKE_DISTANCE, { duration: SHAKE_STEP_MS }),
      withTiming(SHAKE_DISTANCE, { duration: SHAKE_STEP_MS * 2 }),
      withTiming(-SHAKE_DISTANCE * 0.6, { duration: SHAKE_STEP_MS * 2 }),
      withTiming(SHAKE_DISTANCE * 0.35, { duration: SHAKE_STEP_MS * 2 }),
      withTiming(0, { duration: SHAKE_STEP_MS }),
    );
    // Only the count triggers it — re-running when the message itself changes would knock the row
    // for fixing something.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shakeKey, shake]);

  const riseStyle = useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [
      { translateY: (1 - rise.value) * MESSAGE_RISE },
      { translateX: shake.value },
    ],
  }));

  if (!message) return null;

  return (
    <Animated.View style={[styles.row, style, riseStyle]}>
      <ErrorIcon width={ERROR_ICON_SIZE} height={ERROR_ICON_SIZE} color={FAILED_COLOR} />
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    // Room for the knock — see `SHAKE_DISTANCE`.
    marginHorizontal: SHAKE_DISTANCE,
  },
  text: {
    // Takes the width the icon leaves, so a longer reason wraps under itself rather than pushing the
    // glyph off the row.
    flex: 1,
    color: FAILED_COLOR,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
    letterSpacing: tracking.medium,
    includeFontPadding: false,
  },
});

/** Standing message for a `required_field === 'y'` question left blank. */
export const REQUIRED_MESSAGE = 'This question needs an answer before you continue';
