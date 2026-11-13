import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import ErrorIcon from '../../../../theme/icons/error.svg';
import { REFUSAL_DISTANCE, refusalKnock } from './choicePress';
import {
  alertRed,
  fontFamily,
  getColorTokens,
  layout as layoutTokens,
  tracking,
  type ThemeMode,
} from '../../../../theme/theme';

/** Failure red. Re-exported under the name the questionnaire's inputs ask for it by — see `alertRed`
 *  for why it isn't brand-tinted. */
export const FAILED_COLOR = alertRed;

/** The error glyph (Figma 3977:1923, `clarity:error-standard-solid`). Drawn at 20 rather than its
 *  native 26 so it sits with the 14pt message rather than towering over it. */
const ERROR_ICON_SIZE = 20;

/** How long the message takes to rise into place, and how far it travels doing it. */
const MESSAGE_MS = 160;
const MESSAGE_RISE = 6;
/**
 * Longer going than coming.
 *
 * Arriving is news and wants to be prompt; leaving is an acknowledgement that the thing was fixed,
 * and a message that vanishes the instant an option is tapped reads as a flicker beside the option's
 * own fill animating in.
 */
const MESSAGE_OUT_MS = 220;

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
  mode,
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
  /**
   * Active colour scheme, for the ink on the card.
   *
   * Optional: a caller that doesn't theme its inputs still gets a legible message, because the ink is
   * checked against the card either way — see `ink`.
   */
  mode?: ThemeMode;
}) {
  /**
   * The message being drawn, which outlives the one being asked for.
   *
   * A message that simply unmounted on its way out took its own exit animation with it — the row was
   * gone before the first frame of it ran. Holding the last text here lets it fade while the caller
   * has already moved on; `shown` is cleared when the fade lands, which is what finally unmounts it.
   */
  const [shown, setShown] = useState<string | null>(message ?? null);
  useEffect(() => {
    if (message) setShown(message);
  }, [message]);

  // Driven manually rather than with an `entering`/`exiting` layout animation — those strand an
  // invisible touch-blocking overlay on Android.
  const rise = useSharedValue(0);
  useEffect(() => {
    if (!message) {
      // Out, then dropped. `runOnJS` because clearing the held text is React's business, not the UI
      // thread's, and it must not happen until the last frame has been drawn.
      rise.value = withTiming(0, { duration: MESSAGE_OUT_MS }, (finished) => {
        if (finished) runOnJS(setShown)(null);
      });
      return;
    }
    // From the bottom each time: a message that comes back after being dismissed should arrive, not
    // resume from wherever its fade-out had reached.
    rise.value = withTiming(1, { duration: MESSAGE_MS });
  }, [message, rise]);

  const shake = useSharedValue(0);
  useEffect(() => {
    if (!shakeKey || !message) return;
    shake.value = refusalKnock();
    // Only the count triggers it — re-running when the message itself changes would knock the row
    // for fixing something.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shakeKey, shake]);

  /**
   * The ink on the solid red card: white in light mode, near-black in dark.
   *
   * The theme's own banner ink — `card.task.background`, the same pairing `ToDoStatusNode` puts on
   * its fixed status colours — taken as given rather than second-guessed.
   *
   * Worth knowing: white on this red measures 3.8:1, which clears AA for large text but not for the
   * 14pt this is set at. The card's colour is what would fix that rather than the ink — a darker red
   * (the palette's `red550`, #C0312D) puts white at about 5.5:1 — so if the contrast ever has to be
   * answered for, change the theme's `alertRed`, not this. Note that moves the recording indicator
   * and the broken-streak icon with it, which is the point of its being one colour.
   */
  const ink = getColorTokens(mode ?? 'light').card.task.background;

  const riseStyle = useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [
      { translateY: (1 - rise.value) * MESSAGE_RISE },
      { translateX: shake.value },
    ],
  }));

  if (!shown) return null;

  return (
    <Animated.View style={[styles.row, style, riseStyle]}>
      <ErrorIcon width={ERROR_ICON_SIZE} height={ERROR_ICON_SIZE} color={ink} />
      <Text style={[styles.text, { color: ink }]}>{shown}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /**
   * A tinted pill rather than bare text.
   *
   * The row is drawn over the page now, above the footer, with the question's own content scrolling
   * underneath it — and red text alone on top of a radio list is unreadable at exactly the moment it
   * matters most. Solid rather than tinted for the same reason: a translucent fill would carry
   * whatever it happened to be over, and the message has to read the same on every page.
   */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: layoutTokens.radiusPill,
    backgroundColor: FAILED_COLOR,
    // Room for the knock — see `REFUSAL_DISTANCE`.
    marginHorizontal: REFUSAL_DISTANCE,
  },
  text: {
    // Takes the width the icon leaves, so a longer reason wraps under itself rather than pushing the
    // glyph off the row.
    flex: 1,
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
