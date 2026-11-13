import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { tracking, fontFamily, getColorTokens, layout, readableTextColor, type ThemeColorOverrides, type ThemeMode } from '../../theme/theme';

/**
 * The two button scales, each a padding / height / label-size / border-width set.
 *
 * `default` is the design system's button — the one a screen ends on ("Start", "Continue"). `small`
 * is for a button that sits *inside* content rather than under it, where a full-height pill would
 * outrank what it belongs to: the "See all tasks" row closing a task list, say. Kept as one table so
 * the two stay proportional; the border thins with the rest, since a 3pt outline on a 30pt pill reads
 * as a box rather than an edge.
 *
 * Both are full width by default, because that is what a button under a form wants. One sitting in
 * content usually does not — pass `alignSelf: 'center'` and `width: 'auto'` in `style`, which is
 * applied last and so wins, to get a pill that hugs its label.
 *
 * RN adds a border on top of the padding, so the outline variant subtracts its border from the
 * padding to keep every variant of a given size the same height.
 */
const SIZES = {
  default: { paddingVertical: 16, minHeight: 52, fontSize: 16, border: 3 },
  small: { paddingVertical: 6, minHeight: 30, fontSize: 13, border: 2 },
} as const;

export type PillButtonSize = keyof typeof SIZES;

/**
 * Pill-shaped action button in the design system's variants (Figma "Buttons"): `primary` — a filled
 * navy button (e.g. "Start"); `outline` — a navy-bordered transparent button (e.g. "View Privacy
 * Policy"); `text` — a background-less text button (e.g. "No Thanks"). Colors come from the theme
 * tokens, so every variant tracks the active theme and brand override.
 */
export interface PillButtonProps {
  label: string;
  onPress?: () => void;
  /** Visual style. Defaults to `primary`. */
  variant?: 'primary' | 'outline' | 'text';
  /** Scale. Defaults to `default` — see `SIZES` for when `small` is the right one. */
  size?: PillButtonSize;
  disabled?: boolean;
  /** Which theme's tokens to use. Defaults to the device color scheme. */
  mode?: ThemeMode;
  brandColors?: ThemeColorOverrides;
  /**
   * Paint with this instead of the brand — fill for `primary`, border and label for `outline`.
   *
   * For surfaces that aren't the page background. A brand-filled button is invisible on a brand-filled
   * page, so a screen that inverts its palette (the questionnaire's "Well done") hands the buttons the
   * colour it is using for ink. The filled label is then chosen for contrast against *this* colour
   * rather than assumed, since it is no longer the brand the theme's label was picked for.
   */
  accentColor?: string;
  /** Extra style for the button container (e.g. width or margin). */
  style?: StyleProp<ViewStyle>;
}

export function PillButton({
  label,
  onPress,
  variant = 'primary',
  size = 'default',
  disabled = false,
  mode,
  brandColors,
  accentColor,
  style,
}: PillButtonProps) {
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const tokens = getColorTokens(resolvedMode, brandColors);

  // Brand color for the filled/outline variants. Tracks the manifest brand in *both* themes — in dark
  // mode that's the raw brand (which reads on the dark page), not the theme's default navy button
  // surface (which never tracks the brand in dark mode).
  const brand = accentColor ?? brandColors?.brand ?? tokens.button.background;
  const isOutline = variant === 'outline';
  const isText = variant === 'text';
  // Filled label: white in light mode (unchanged); in dark mode pick whatever reads on the brand fill
  // (a light brand needs a dark label), so a peach/pastel brand button stays legible.
  //
  // An explicit `accentColor` always takes the readable path, in either mode: the caller has replaced
  // the fill with a colour of its own, so the theme's light-mode label was never chosen against it.
  const filledLabel =
    resolvedMode === 'dark' || accentColor
      ? readableTextColor(brand, { preferred: tokens.navbar.text.primary })
      : tokens.navbar.text.primary;
  const labelColor = isText
    ? tokens.button.noBackgroundText
    : isOutline
      ? brand
      : filledLabel;
  const scale = SIZES[size];
  const sizeStyle: ViewStyle = {
    paddingVertical: scale.paddingVertical,
    minHeight: scale.minHeight,
  };
  const variantStyle: ViewStyle = isText
    ? { backgroundColor: 'transparent' }
    : isOutline
      ? {
          backgroundColor: 'transparent',
          borderWidth: scale.border,
          borderColor: brand,
          // Subtract the border from the padding so the total height matches the other variants.
          paddingVertical: scale.paddingVertical - scale.border,
        }
      : { backgroundColor: brand };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, sizeStyle, variantStyle, disabled && styles.disabled, style]}
    >
      <Text style={[styles.label, { fontSize: scale.fontSize }, { color: labelColor }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: layout.radiusPill,
  },
  label: {
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  disabled: {
    opacity: 0.5,
  },
});
