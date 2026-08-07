import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { tracking, fontFamily, getColorTokens, layout, type ThemeColorOverrides, type ThemeMode } from '../../theme/theme';

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
  style,
}: PillButtonProps) {
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const tokens = getColorTokens(resolvedMode, brandColors);

  const navy = tokens.button.background;
  const isOutline = variant === 'outline';
  const isText = variant === 'text';
  const labelColor = isText
    ? tokens.button.noBackgroundText
    : isOutline
      ? navy
      : tokens.navbar.text.primary;
  const variantStyle: ViewStyle = isText
    ? { backgroundColor: 'transparent' }
    : isOutline
      ? {
          backgroundColor: 'transparent',
          borderWidth: OUTLINE_BORDER,
          borderColor: navy,
          // Subtract the border from the padding so the total height matches the other variants.
          paddingVertical: VERTICAL_PADDING - OUTLINE_BORDER,
        }
      : { backgroundColor: navy };

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
