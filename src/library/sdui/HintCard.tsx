import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  tracking,
  fontFamily,
  getColorTokens,
  layout,
  type ThemeColorOverrides,
  type ThemeMode,
} from '../../theme/theme';

/**
 * Hint card matching the Figma "HintCard" core component (node 2732:1962): a light-blue panel with
 * a short message on the left and a pill action button on the right. Used for inline guidance — e.g.
 * the QR-scan camera view's "Having trouble scanning?" prompt. Colors come from the design system's
 * `card.hint` (panel) and `header` (button) tokens, so it tracks the active theme and brand override.
 */
export interface HintCardProps {
  /** Primary line of the hint. */
  title?: string;
  /** Optional second line under the title. */
  subtitle?: string;
  /** Action button label. When omitted, the button is hidden. */
  actionLabel?: string;
  /** Called when the action button is pressed. */
  onAction?: () => void;
  /** Which theme's tokens to use. Defaults to the device color scheme. */
  mode?: ThemeMode;
  /** Manifest brand colors, so the button label tracks the app's primary. */
  brandColors?: ThemeColorOverrides;
  /** Extra style for the card container (e.g. opacity or width). */
  style?: StyleProp<ViewStyle>;
}

export function HintCard({
  title,
  subtitle,
  actionLabel,
  onAction,
  mode,
  brandColors,
  style,
}: HintCardProps) {
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const tokens = getColorTokens(resolvedMode, brandColors);

  return (
    <View style={[styles.card, { backgroundColor: tokens.card.hint.background }, style]}>
      <View style={styles.text}>
        {title ? (
          <Text style={[styles.line, { color: tokens.card.hint.text }]}>{title}</Text>
        ) : null}
        {subtitle ? (
          <Text style={[styles.line, { color: tokens.card.hint.text }]}>{subtitle}</Text>
        ) : null}
      </View>

      {actionLabel ? (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={onAction}
          style={[styles.button, { backgroundColor: tokens.header.buttonBackground }]}
        >
          <Text style={[styles.buttonLabel, { color: tokens.header.buttonIcon }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 12,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  line: {
    fontSize: 10,
    lineHeight: 13,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 24,
  },
  buttonLabel: {
    fontSize: 10,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
});
