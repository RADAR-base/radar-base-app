import React from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import {
  getColorTokens,
  PageHeader,
  type ThemeColorOverrides,
  type ThemeMode,
} from '@radarbase/app-kit';

import { EnrolmentCompleteView } from './EnrolmentCompleteView';

/**
 * Enrolment-complete screen — the auth gate shown once authentication succeeds (Figma 3068:4287).
 * The registration header with a full progress bar and no back button, over the EnrolmentCompleteView
 * body. Shown by AppRoot after a fresh login (currently reached via "Enter Login Details"); the QR
 * path will authenticate here too in the future. Start proceeds into the app; View Privacy Policy is
 * TODO.
 */
export interface RegistrationCompleteScreenProps {
  /** Proceed into the app (a study-tasks carousel will slot in here later). */
  onStart?: () => void;
  /** View the app's privacy policy (TODO). */
  onViewPolicy?: () => void;
  /** Which theme's tokens to use. Defaults to the device color scheme. */
  mode?: ThemeMode;
  brandColors?: ThemeColorOverrides;
}

export function RegistrationCompleteScreen({
  onStart,
  onViewPolicy,
  mode,
  brandColors,
}: RegistrationCompleteScreenProps) {
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const tokens = getColorTokens(resolvedMode, brandColors);

  return (
    <View style={[styles.root, { backgroundColor: tokens.background.primary }]}>
      <PageHeader
        onBack={() => {}}
        progress={1}
        showBack={false}
        mode={mode}
        brandColors={brandColors}
      />
      <EnrolmentCompleteView
        onStart={onStart}
        onViewPolicy={onViewPolicy}
        mode={mode}
        brandColors={brandColors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
