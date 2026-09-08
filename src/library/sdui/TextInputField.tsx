import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  type TextInputProps,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { fontFamily, getColorTokens, layout, tracking, type ThemeMode } from '../../theme/theme';

/**
 * Text input matching the Figma "Text Input Field" component (node 3120:3491) and its four
 * states — Default, focused, Error, Disabled. The state is derived automatically: `disabled`
 * and `error` props take precedence, otherwise it reflects the field's focus. Colors come from
 * the design system's `input` tokens (theme.ts), which are theme-invariant for now.
 */
export interface TextInputFieldProps extends Omit<TextInputProps, 'editable' | 'style'> {
  /** Whether the field accepts input. When false, renders the Disabled state. */
  disabled?: boolean;
  /** Error message shown below the field; when set, renders the Error state. */
  error?: string;
  /** Which theme's tokens to use. Defaults to the device color scheme. */
  mode?: ThemeMode;
}

export function TextInputField({
  disabled = false,
  error,
  placeholder = 'Placeholder Text',
  mode,
  ...inputProps
}: TextInputFieldProps) {
  const [focused, setFocused] = useState(false);
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const input = getColorTokens(resolvedMode).input;

  // Precedence mirrors the Figma states: Disabled > Error > focused > Default.
  const isError = !disabled && !!error;
  const isFocused = !disabled && !isError && focused;

  const fill = disabled ? input.disabledFill : input.fill;
  const border = disabled
    ? input.disabledBorder
    : isError
      ? input.errorBorder
      : isFocused
        ? input.focusBorder
        : input.border;
  const textColor = disabled ? input.disabledText : input.text;

  return (
    <View style={styles.container}>
      {/* Outer ring — only visible (light-blue halo) while focused; transparent otherwise so the
          field size stays constant across states. */}
      <View style={[styles.ring, { borderColor: isFocused ? input.focusRing : 'transparent' }]}>
        <View style={[styles.field, { backgroundColor: fill, borderColor: border }]}>
          <TextInput
            {...inputProps}
            editable={!disabled}
            placeholder={placeholder}
            placeholderTextColor={textColor}
            onFocus={(e) => {
              setFocused(true);
              inputProps.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              inputProps.onBlur?.(e);
            }}
            style={[styles.input, { color: textColor }, disabled && styles.inputDisabled]}
          />
          {isError && <AlertIcon color={input.errorBorder} />}
        </View>
      </View>
      {isError && <Text style={[styles.errorLabel, { color: input.errorBorder }]}>{error}</Text>}
    </View>
  );
}

/** Error glyph (filled circle + exclamation) — Figma node 3170:1384, exact vector. */
function AlertIcon({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M8.38578 11.8044C8.49363 11.6966 8.54756 11.568 8.54756 11.4187C8.54756 11.2693 8.49363 11.141 8.38578 11.0338C8.27793 10.9265 8.14933 10.8723 8 10.8711C7.85067 10.8699 7.72207 10.9239 7.61422 11.0329C7.50637 11.1419 7.45244 11.2702 7.45244 11.4178C7.45244 11.5653 7.50637 11.6939 7.61422 11.8036C7.72207 11.9132 7.85067 11.9668 8 11.9644C8.14933 11.9621 8.27793 11.9084 8.38578 11.8036M8.31733 8.89689C8.40207 8.81155 8.44444 8.70607 8.44444 8.58044V4.136C8.44444 4.00978 8.40178 3.9043 8.31644 3.81956C8.23111 3.73481 8.12533 3.69215 7.99911 3.69155C7.87289 3.69096 7.76741 3.73363 7.68267 3.81956C7.59793 3.90548 7.55556 4.01096 7.55556 4.136V8.58044C7.55556 8.70607 7.59822 8.81155 7.68356 8.89689C7.76889 8.98222 7.87467 9.02489 8.00089 9.02489C8.12711 9.02489 8.23259 8.98222 8.31733 8.89689ZM8.00267 16C6.89689 16 5.85689 15.7902 4.88267 15.3707C3.90904 14.9505 3.06193 14.3804 2.34133 13.6604C1.62074 12.9404 1.05037 12.0942 0.630222 11.1218C0.210074 10.1493 0 9.10963 0 8.00267C0 6.8957 0.210074 5.8557 0.630222 4.88267C1.04978 3.90904 1.61896 3.06193 2.33778 2.34133C3.05659 1.62074 3.90311 1.05037 4.87733 0.630222C5.85156 0.210074 6.89156 0 7.99733 0C9.10311 0 10.1431 0.210074 11.1173 0.630222C12.091 1.04978 12.9381 1.61926 13.6587 2.33867C14.3793 3.05807 14.9496 3.90459 15.3698 4.87822C15.7899 5.85185 16 6.89155 16 7.99733C16 9.10311 15.7902 10.1431 15.3707 11.1173C14.9511 12.0916 14.381 12.9387 13.6604 13.6587C12.9399 14.3787 12.0936 14.949 11.1218 15.3698C10.1499 15.7905 9.11022 16.0006 8.00267 16Z"
        fill={color}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 4, // space between field and error label (Figma gap-4)
  },
  ring: {
    width: '100%',
    borderWidth: 2,
    borderRadius: layout.radiusPill + 2,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderRadius: layout.radiusPill,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '300',
    fontFamily: fontFamily.light,
    includeFontPadding: false,
    letterSpacing: tracking.light,
    // No lineHeight: setting it equal to fontSize clips descenders and the caret in RN.
    padding: 0, // strip RN's default TextInput padding so height matches the design
  },
  inputDisabled: {
    opacity: 0.35, // Figma disabled text opacity
  },
  errorLabel: {
    fontSize: 12,
    lineHeight: 14,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
});
