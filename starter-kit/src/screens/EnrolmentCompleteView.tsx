import React from 'react';
import { StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  tracking,
  fontFamily,
  getColorTokens,
  layout,
  PillButton,
  RegistrationCompleteIllustration,
  type ThemeColorOverrides,
  type ThemeMode,
} from '@radarbase/app-kit';

/**
 * "Enrolment Complete" step — Figma node 3068:4287. Final step of the registration flow (progress
 * full, no back button — the flow hides it). An illustration, a heading + description, and two
 * actions: Start (→ study-tasks carousel) and View Privacy Policy. Colors come from the theme tokens.
 */
export interface EnrolmentCompleteViewProps {
  /** Start the study — takes the user to the tasks carousel (TODO). */
  onStart?: () => void;
  /** View the app's privacy policy (TODO). */
  onViewPolicy?: () => void;
  /** Which theme's tokens to use. Defaults to the device color scheme. */
  mode?: ThemeMode;
  brandColors?: ThemeColorOverrides;
}

// Illustration intrinsic size (Figma 3074:4924), used to preserve its aspect ratio responsively.
const ILLO_W = 323;
const ILLO_H = 242;

export function EnrolmentCompleteView({
  onStart,
  onViewPolicy,
  mode,
  brandColors,
}: EnrolmentCompleteViewProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const tokens = getColorTokens(resolvedMode, brandColors);

  const heading = tokens.button.background; // navy heading (matches the flow's other headings)
  const bodyText = tokens.card.hint.text; // #0E5474 — description

  const illoWidth = Math.min(width - 64, ILLO_W);
  const illoHeight = (illoWidth * ILLO_H) / ILLO_W;

  return (
    <View style={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.top}>
        <RegistrationCompleteIllustration width={illoWidth} height={illoHeight} color={heading} />
        <Text style={[styles.heading, { color: heading }]}>Enrolment Complete</Text>
        <Text style={[styles.description, { color: bodyText }]}>
          You’re all set!{'\n'}Press Start to begin your study tasks.
          {'\n\n'}By enrolling in the study, you agree to the collection and use of information in
          relation to our Privacy Policy.
        </Text>
      </View>

      <View style={styles.actions}>
        <PillButton
          label="Start"
          variant="primary"
          onPress={onStart}
          mode={mode}
          brandColors={brandColors}
        />
        <PillButton
          label="View Privacy Policy"
          variant="outline"
          onPress={onViewPolicy}
          mode={mode}
          brandColors={brandColors}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 64,
  },
  top: {
    alignItems: 'center',
    gap: 16,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    textAlign: 'center',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  description: {
    maxWidth: 361,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  actions: {
    width: '100%',
    gap: 9,
  },
});
