import React, { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { SelectChoice } from '../../../../types';
import {
  fontFamily,
  layout as layoutTokens,
  tracking,
  withAlpha,
} from '../../../../theme/theme';

interface RadioInputProps {
  choices: SelectChoice[];
  value: string | undefined;
  onChange: (value: string) => void;
  /** Fill for the selected option (the manifest accent). */
  accentColor: string;
  /** Card surface for unselected options. */
  surfaceColor: string;
  textColor: string;
}

/** Diameter of the radio indicator (Figma 3578:1589), and of the dot inside it when selected. */
const INDICATOR_SIZE = 24;
const INDICATOR_DOT_SIZE = 16;
/** Selected options carry a 4px ring; unselected reserve it transparently so nothing shifts. */
const SELECTED_RING = 4;
/** How long an option takes to settle into (or out of) its selected state. */
const SELECT_MS = 180;
/**
 * A softer, straight-down version of the app's `cardShadow`.
 *
 * The shared one is offset 8px to the *right*, which reaches ~20px past the card. These options are
 * full-width inside a viewport that clips its overflow (the ScrollView and `StepSlider` both do), so
 * that shadow was sliced off at the edges. Dropping the horizontal offset leaves only the blur to
 * spill sideways — a few faint pixels rather than a visible cut — and keeps the pills full width.
 *
 * Android already uses a straight-down shadow, so it matches `cardShadow` there.
 */
const optionShadow = Platform.select({
  android: { boxShadow: '0px 4px 12px rgba(121, 120, 127, 0.14)', elevation: 0 },
  default: {
    shadowColor: '#79787F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 0,
  },
}) as ViewStyle;

/**
 * Single-choice options as pill cards — Figma 3578:1589.
 *
 * Unselected is a plain card with a soft drop shadow; selected fills with the manifest
 * accent and gains a 4px ring of the same color at half opacity. The label sits left with the
 * indicator right, matching the design (and the reading order — the option is what you scan, the
 * radio only confirms it).
 */
export function RadioInput({
  choices,
  value,
  onChange,
  accentColor,
  surfaceColor,
  textColor,
}: RadioInputProps) {
  // White on the accent fill, per the design. Note this is a deliberate contrast trade: against the
  // default sky accent it measures 1.86:1, below WCAG AA's 4.5:1 — switch to
  // `readableTextColor(accentColor, { preferred: '#FFFFFF' })` if that becomes a problem.
  const onAccent = '#FFFFFF';

  return (
    <View style={styles.container}>
      {choices.map((choice) => (
        <RadioOption
          key={choice.code}
          label={choice.label}
          selected={value === choice.code}
          onPress={() => onChange(choice.code)}
          accentColor={accentColor}
          surfaceColor={surfaceColor}
          textColor={textColor}
          onAccent={onAccent}
        />
      ))}
    </View>
  );
}

/**
 * One option, animating between its two states rather than snapping.
 *
 * A component per option because each needs its own shared value, and hooks can't be created in a
 * loop. Everything runs off a single 0→1 progress so the fill, halo, label and dot move as one
 * gesture — driving them separately makes the parts arrive at slightly different times.
 */
function RadioOption({
  label,
  selected,
  onPress,
  accentColor,
  surfaceColor,
  textColor,
  onAccent,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accentColor: string;
  surfaceColor: string;
  textColor: string;
  onAccent: string;
}) {
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, {
      duration: SELECT_MS,
      easing: Easing.out(Easing.quad),
    });
  }, [selected, progress]);

  // Two layers, not a border: React Native paints an element's background *underneath* its border,
  // so a translucent accent border over an accent fill blends into the same color and vanishes. The
  // halo is the outer view's own background instead, which sits on the page.
  //
  // It fades from the same color at zero alpha rather than from `transparent`, which would interpolate
  // through black and grey the ring on its way in.
  //
  // Both endpoints are resolved out here, on the JS thread. `useAnimatedStyle` bodies are worklets
  // running on the UI thread, which can only call other worklets — calling `withAlpha` inside one
  // throws. Plain strings close over into the worklet fine.
  const ringClear = withAlpha(accentColor, 0);
  const ringVisible = withAlpha(accentColor, 0.5);
  const ringStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [ringClear, ringVisible]),
  }));
  const fillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [surfaceColor, accentColor]),
  }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [textColor, onAccent]),
  }));
  const indicatorStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], [textColor, onAccent]),
  }));
  // Kept mounted and scaled from nothing, so it grows into place instead of appearing whole.
  const dotStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: progress.value }],
    backgroundColor: onAccent,
  }));

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
    >
      {/* Unselected keeps the ring's padding with a clear background, so selecting an option doesn't
          grow the row and shunt the list. */}
      <Animated.View style={[styles.optionRing, ringStyle]}>
        <Animated.View style={[styles.option, optionShadow, fillStyle]}>
          <Animated.Text style={[styles.label, labelStyle]}>{label}</Animated.Text>

          <Animated.View style={[styles.indicator, indicatorStyle]}>
            <Animated.View style={[styles.indicatorDot, dotStyle]} />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: layoutTokens.gap,
  },
  pressable: {
    width: '100%',
  },
  /** The translucent halo around a selected option — see the note at the render site. */
  optionRing: {
    width: '100%',
    padding: SELECTED_RING,
    // Fully rounded: a radius far larger than the height, as the design's 100 is.
    borderRadius: 100,
  },
  option: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: layoutTokens.cardPadding,
    borderRadius: 100,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    // Takes the row so the indicator stays pinned right however long the option runs.
    flex: 1,
    fontSize: 16,
    // Taller than the font size so tall glyphs/descenders aren't clipped on Android.
    lineHeight: 20,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    letterSpacing: tracking.semiBold,
    includeFontPadding: false,
  },
  indicator: {
    width: INDICATOR_SIZE,
    height: INDICATOR_SIZE,
    borderRadius: INDICATOR_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorDot: {
    // Fills most of the ring — 2px border plus a 2px gap either side.
    width: INDICATOR_DOT_SIZE,
    height: INDICATOR_DOT_SIZE,
    borderRadius: INDICATOR_DOT_SIZE / 2,
  },
});
