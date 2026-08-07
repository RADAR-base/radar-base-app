import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import {
  tracking,
  fontFamily,
  getColorTokens,
  HintCard,
  layout,
  useTopInset,
  type ThemeColorOverrides,
} from '@radarbase/app-kit';

/**
 * Camera / QR scan view — Figma node 3066:3803. Shown when the user taps "Scan QR Code" on the
 * QrScanScreen. A translucent dark scrim (the page behind shows through, dimmed), a close button +
 * "Registration" title at the top, a framed camera cut-out centered on the screen, and a HintCard
 * 32px below it.
 *
 * Frontend only: there is no camera preview or permission handling yet. The cut-out is a solid,
 * opaque placeholder for the camera area — when a camera is added later, render its preview here
 * (or make this window transparent over a full-screen preview layer).
 */
export interface CameraScanScreenProps {
  /** Return to the QR-scan page. */
  onBack: () => void;
  /** HintCard action — "Enter Login Token" instead of scanning. */
  onEnterToken?: () => void;
  /** Manifest brand colors, threaded to the HintCard button. */
  brandColors?: ThemeColorOverrides;
}

export function CameraScanScreen({ onBack, onEnterToken, brandColors }: CameraScanScreenProps) {
  const insets = useSafeAreaInsets();
  const topInset = useTopInset();
  const { width } = useWindowDimensions();

  // This screen is always dark (it overlays the camera), so the chrome uses the dark theme's tokens
  // regardless of the device scheme: light-blue text (#B5DFF2) and a white close glyph.
  const dark = getColorTokens('dark', brandColors);
  const chromeText = dark.card.hint.text;
  const crossColor = dark.header.buttonIcon;
  // Press feedback: the screen's accent (card.hint.text, a light blue) at low opacity — a colored
  // circular highlight that reads clearly on the dark scrim while the X stays white.
  const crossPressedBg = 'rgba(181, 223, 242, 0.20)';

  const windowSize = Math.min(width * 0.82, 340);

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.content,
          { paddingTop: topInset, paddingBottom: insets.bottom + 16 },
        ]}
      >
        {/* Top region (flex:1): header at the top, scan instruction just above the cut-out. This
            region and the bottom region are equal, which centers the cut-out vertically. */}
        <View style={styles.topRegion}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onBack}
              hitSlop={8}
              style={({ pressed }) => [
                styles.close,
                pressed && { backgroundColor: crossPressedBg },
              ]}
            >
              <CrossIcon color={crossColor} />
            </Pressable>
            <Text style={[styles.title, { color: chromeText }]}>Registration</Text>
          </View>

          <Text style={[styles.instruction, { color: chromeText }]}>
            Place the QR Code at the centre of the screen
          </Text>
        </View>

        {/* Camera cut-out — centered on screen; solid placeholder framed by a light border.
            TODO (QR Code): wire up scanning here — render a live camera preview (expo-camera /
            react-native-vision-camera) as a full-screen layer behind a transparent cut-out, detect
            the QR code, then authenticate with the scanned token and advance the enrolment flow
            (drives `isAuthenticating` for the QR path). Needs the camera dep + a native rebuild. */}
        <View
          style={[
            styles.window,
            { width: windowSize, height: windowSize, borderColor: chromeText },
          ]}
        />

        {/* Bottom region (flex:1): hint card, pinned 32px under the cut-out. */}
        <View style={styles.bottomRegion}>
          <HintCard
            mode="light"
            brandColors={brandColors}
            style={styles.hint}
            title="Having trouble scanning?"
            subtitle="Try entering the login token instead"
            actionLabel="Enter Login Token"
            onAction={onEnterToken}
          />
        </View>
      </View>
    </View>
  );
}

/** Close glyph (X) — Figma icon `cross.svg`, exact vector; color themed for the dark scrim. */
function CrossIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M16.9375 16.933L0.937498 0.9375M16.9375 0.9375L0.937498 16.933"
        stroke={color}
        strokeWidth={1.875}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Local chrome colors (not theme tokens): the translucent dark scrim, through which the page
 * behind shows dimmed, and the opaque fill of the camera cut-out.
 */
const SCRIM = 'rgba(11, 13, 18, 0.92)';
const WINDOW_FILL = '#0A0B0F';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SCRIM,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  topRegion: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 36, // balances the close button so the title stays centered
  },
  close: {
    // Match RegistrationHeader's 36×36 back-button box so the title row is the same height and the
    // X / title line up with the flow's back button / title behind the translucent scrim.
    width: 36,
    height: 36,
    borderRadius: 18, // circular, so the pressed highlight reads as a round chip
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  instruction: {
    alignSelf: 'center',
    maxWidth: 320,
    marginBottom: 16, // gap between the instruction and the cut-out
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  window: {
    alignSelf: 'center',
    borderRadius: 24,
    borderWidth: 1.5,
    backgroundColor: WINDOW_FILL,
  },
  bottomRegion: {
    flex: 1,
    alignItems: 'center',
  },
  hint: {
    marginTop: 32, // 32px under the cut-out
    opacity: 0.8, // Figma instance opacity
  },
});
