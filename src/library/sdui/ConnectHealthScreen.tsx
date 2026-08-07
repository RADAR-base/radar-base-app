import React from 'react';
import { Platform, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tracking, fontFamily, getColorTokens, layout, type ThemeColorOverrides, type ThemeMode } from '../../theme/theme';
import AppleHealthIcon from '../../theme/icons/applehealth.svg';
import HealthConnectIcon from '../../theme/icons/healthconnect.svg';
import { PillButton } from './PillButton';

/**
 * "Connect to Health" screen — Figma nodes 3100:1314 / 3100:1602. Asks permission to connect the
 * platform's health service and adapts to the device: on iOS the Apple Health icon + "Connect Apple
 * Health"; on Android the Health Connect icon + "Connect / Add Health Connect". Shown after the
 * notifications screen. The brand icons keep their own colors; the title/buttons resolve through the
 * theme tokens (so they track the manifest brand override). The actions are left to the caller.
 */
export interface ConnectHealthScreenProps {
  /** Connect — request health-data access, then continue. */
  onConnect?: () => void;
  /** Skip connecting for now, and continue. */
  onConnectLater?: () => void;
  /** Which platform's health service to show. Defaults to the device OS. */
  platform?: 'apple' | 'android';
  mode?: ThemeMode;
  brandColors?: ThemeColorOverrides;
}

const CONTENT = {
  apple: {
    title: 'Connect Apple Health',
    description: 'Sync with Apple Health to bring your health data into one place.',
    connectLabel: 'Connect Apple Health',
  },
  android: {
    title: 'Connect Health Connect',
    description: 'Sync with Health Connect to bring your health data into one place.',
    connectLabel: 'Add Health Connect',
  },
};

export function ConnectHealthScreen({
  onConnect,
  onConnectLater,
  platform,
  mode,
  brandColors,
}: ConnectHealthScreenProps) {
  const insets = useSafeAreaInsets();
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const tokens = getColorTokens(resolvedMode, brandColors);

  const resolvedPlatform = platform ?? (Platform.OS === 'android' ? 'android' : 'apple');
  const isApple = resolvedPlatform === 'apple';
  const content = isApple ? CONTENT.apple : CONTENT.android;

  const heading = tokens.button.background; // navy title, tracks brand override
  const bodyText = tokens.card.hint.text; // description (matches the sibling onboarding screens)

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: tokens.background.primary,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
        },
      ]}
    >
      <View style={styles.center}>
        {isApple ? (
          // The icon includes its own white square; round its corners like the design.
          <View style={styles.appleIcon}>
            <AppleHealthIcon width={200} height={200} />
          </View>
        ) : (
          <HealthConnectIcon width={250} height={200} />
        )}

        <View style={styles.text}>
          <Text style={[styles.title, { color: heading }]}>{content.title}</Text>
          <Text style={[styles.description, { color: bodyText }]}>{content.description}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <PillButton
          label={content.connectLabel}
          variant="primary"
          onPress={onConnect}
          mode={mode}
          brandColors={brandColors}
        />
        <PillButton
          label="Connect Later"
          variant="text"
          onPress={onConnectLater}
          mode={mode}
          brandColors={brandColors}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  appleIcon: {
    width: 200,
    height: 200,
    borderRadius: 24,
    overflow: 'hidden',
  },
  text: {
    alignItems: 'center',
    gap: 16,
  },
  title: {
    maxWidth: 361,
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
