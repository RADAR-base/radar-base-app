import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { SelectChoice } from '../../../../types';
import {
  INDICATOR_BORDER,
  INDICATOR_SIZE,
  ON_ACCENT,
  OPTION_RADIUS,
  PRESSED_OPACITY,
  RING_ALPHA,
  SELECTED_RING,
  SELECT_MS,
  optionShadow,
} from './optionCard';
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

/**
 * The dot inside the indicator when selected.
 *
 * The only piece of this card's geometry that is the radio's alone — everything else it shares with
 * `CheckboxInput`, and lives in `optionCard`.
 */
const INDICATOR_DOT_SIZE = 16;

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
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accentColor: string;
  surfaceColor: string;
  textColor: string;
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
  const ringVisible = withAlpha(accentColor, RING_ALPHA);
  const ringStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [ringClear, ringVisible]),
  }));
  const fillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [surfaceColor, accentColor]),
  }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [textColor, ON_ACCENT]),
  }));
  const indicatorStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], [textColor, ON_ACCENT]),
  }));
  // Kept mounted and scaled from nothing, so it grows into place instead of appearing whole.
  const dotStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: progress.value }],
    backgroundColor: ON_ACCENT,
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
    borderRadius: OPTION_RADIUS,
  },
  option: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: layoutTokens.cardPadding,
    borderRadius: OPTION_RADIUS,
  },
  pressed: {
    opacity: PRESSED_OPACITY,
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
    borderWidth: INDICATOR_BORDER,
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
