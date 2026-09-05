import React from 'react';
import { StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  tracking,
  fontFamily,
  getColorTokens,
  layout,
  ScanQRCode,
  type ThemeColorOverrides,
  type ThemeMode,
} from '@radarbase/app-kit';

/**
 * "Scan QR Code" instructions step — Figma node 3062:3406. Second step of the registration flow: an
 * instruction line + QR graphic and a Scan button that opens the camera view. The flow owns the
 * header, progress bar, slide, and the camera modal; this is just the body.
 */
export interface QrInstructionsViewProps {
  /** Open the camera scan view. */
  onScan: () => void;
  /** Which theme's tokens to use. Defaults to the device color scheme. */
  mode?: ThemeMode;
  brandColors?: ThemeColorOverrides;
}

export function QrInstructionsView({ onScan, mode, brandColors }: QrInstructionsViewProps) {
  const insets = useSafeAreaInsets();
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const tokens = getColorTokens(resolvedMode, brandColors);
  const heading = tokens.button.background; // navy heading

  return (
    <View style={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.instructions}>
        <Text style={[styles.heading, { color: heading }]}>Scan QR Code</Text>
        <Text style={[styles.description, { color: tokens.card.hint.text }]}>
          Click the Scan button and point the camera onto the QR Code provided to you.
        </Text>
        <ScanQRCode width={300} height={300} color={heading} />
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        onPress={onScan}
        style={[styles.button, { backgroundColor: tokens.button.background }]}
      >
        <Text style={[styles.buttonLabel, { color: tokens.navbar.text.primary }]}>Scan QR Code</Text>
      </TouchableOpacity>
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
  instructions: {
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
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  button: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: layout.radiusPill,
    minHeight: 52,
  },
  buttonLabel: {
    fontSize: 16,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
