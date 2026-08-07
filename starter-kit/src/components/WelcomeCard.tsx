import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import { tracking, fontFamily, getColorTokens, layout, type ThemeMode, type ThemeColorOverrides } from '@radarbase/app-kit';

/** Base vertical padding inside the card (Figma py-64). Bottom padding also adds the safe-area inset. */
const CARD_VERTICAL_PADDING = 32;

/**
 * Welcome / enrolment card — Figma "Welcome" card (node 3122:3603). A study-name title and
 * description, then a "Get Started" (filled) and "Sign Up" (outline) call to action.
 *
 * `studyName` and `description` are expected to be sourced from the app manifest by the
 * caller (see LoginScreen / App.tsx). This card uses an inverted, on-brand palette: the surface is
 * the brand color (`button.background`) and all content is white (`navbar.text.primary`) — "Get
 * Started" is a white pill with a brand-colored label, and "Sign Up" is a white outline. Only this
 * card is inverted; the rest of the app keeps the standard light treatment. Colors follow the device
 * light/dark setting unless `mode` is set.
 */
export interface WelcomeCardProps {
  /** Study/app name shown as the title. Sourced from the manifest's `appName`. */
  studyName?: string;
  /** Description copy under the title. Sourced from the manifest's `description`. */
  description?: string;
  getStartedPrompt?: string;
  getStartedLabel?: string;
  signUpPrompt?: string;
  signUpLabel?: string;
  onGetStarted?: () => void;
  onSignUp?: () => void;
  /**
   * Extra bottom padding — pass the device's bottom safe-area inset so the content clears the
   * home indicator when the card is anchored to the bottom edge of the screen.
   */
  safeAreaBottomInset?: number;
  /** Which theme's tokens to use. Defaults to the device color scheme. */
  mode?: ThemeMode;
  /** Manifest brand colors that override the theme (see `getColorTokens`). */
  brandColors?: ThemeColorOverrides;
}

export function WelcomeCard({
  studyName,
  description,
  getStartedPrompt = 'Press the button below to begin the enrolment process.',
  getStartedLabel = 'Get Started',
  signUpPrompt = 'Or sign up to the study',
  signUpLabel = 'Sign Up',
  onGetStarted,
  onSignUp,
  safeAreaBottomInset = 0,
  mode,
  brandColors,
}: WelcomeCardProps) {
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const tokens = getColorTokens(resolvedMode, brandColors);

  const brandColor = tokens.button.background; // primary brand color
  const white = tokens.navbar.text.primary; // white

  // Inverted "on-brand" card: a brand-colored surface with white content. Only this card is
  // inverted — the rest of the app keeps the standard light-on-surface treatment.
  const cardBg = brandColor;
  const contentColor = white; // title, description, prompts, and the outline button
  const filledButtonBg = white; // the primary CTA is a white pill...
  const filledButtonLabel = brandColor; // ...with a brand-colored label

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: cardBg, paddingBottom: CARD_VERTICAL_PADDING + safeAreaBottomInset },
      ]}
    >
      <View style={styles.headerGroup}>
        <Text style={[styles.title, { color: contentColor }]}>{studyName}</Text>
        <Text style={[styles.description, { color: contentColor }]}>{description}</Text>
      </View>

      <View style={styles.actions}>
        <View style={styles.actionGroup}>
          <Text style={[styles.prompt, { color: contentColor }]}>{getStartedPrompt}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onGetStarted}
            style={[styles.button, { backgroundColor: filledButtonBg }]}
          >
            <Text style={[styles.buttonLabel, { color: filledButtonLabel }]}>{getStartedLabel}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionGroup}>
          <Text style={[styles.prompt, { color: contentColor }]}>{signUpPrompt}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onSignUp}
            style={[styles.button, styles.outlineButton, { borderColor: contentColor }]}
          >
            <Text style={[styles.buttonLabel, { color: contentColor }]}>{signUpLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    alignItems: 'center',
    gap: 32,
    paddingHorizontal: 32,
    paddingTop: CARD_VERTICAL_PADDING,
    // Rounded top corners only — the card anchors to the screen like a sheet.
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  headerGroup: {
    width: '100%',
    gap: 16,
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 40,
    lineHeight: 40,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    letterSpacing: tracking.bold,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '300',
    fontFamily: fontFamily.light,
    letterSpacing: tracking.light,
    includeFontPadding: false,
  },
  actions: {
    width: '100%',
    gap: 24,
  },
  actionGroup: {
    width: '100%',
    alignItems: 'center',
    gap: 20,
  },
  prompt: {
    fontSize: 14,
    lineHeight: 14,
    fontWeight: '300',
    fontFamily: fontFamily.light,
    letterSpacing: tracking.light,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: layout.radiusPill,
    minHeight: 52,
  },
  outlineButton: {
    borderWidth: 3,
    backgroundColor: 'transparent',
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '400',
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    textAlign: 'center',
    includeFontPadding: false, // Android: keeps the label vertically centered in the button
  },
});
