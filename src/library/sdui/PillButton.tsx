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

// Base vertical padding, and the outline border width. RN adds the border on top of the padding, so
// the outline variant subtracts the border from its padding to keep every variant the same height.
const VERTICAL_PADDING = 16;
const OUTLINE_BORDER = 3;

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
  const variantStyle: ViewStyle = isText
    ? { backgroundColor: 'transparent' }
    : isOutline
      ? {
          backgroundColor: 'transparent',
          borderWidth: OUTLINE_BORDER,
          borderColor: brand,
          // Subtract the border from the padding so the total height matches the other variants.
          paddingVertical: VERTICAL_PADDING - OUTLINE_BORDER,
        }
      : { backgroundColor: brand };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, variantStyle, disabled && styles.disabled, style]}
    >
      <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: VERTICAL_PADDING,
    borderRadius: layout.radiusPill,
    minHeight: 52,
  },
  label: {
    fontSize: 16,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  disabled: {
    opacity: 0.5,
  },
});
