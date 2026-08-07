import React from 'react';
import { StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tracking, fontFamily, getColorTokens, layout, type ThemeColorOverrides, type ThemeMode } from '../../theme/theme';
import EnableNotificationsIllustration from '../../theme/icons/enablenotifications.svg';
import { PillButton } from './PillButton';

/**
 * "Enable Notifications" screen — Figma node 3076:5515. A centered illustration, a title +
 * description, and two stacked actions: Enable Notifications (filled) and No Thanks (text). Shown
 * after enrolment completes. Colors come from the theme tokens (the illustration's navy + the
 * headings/buttons all resolve through `button.background`), so they track the manifest brand
 * override. The actions are left to the caller (e.g. request the OS permission, then continue).
 */
export interface NotificationsScreenProps {
  /** Enable — request notification permission, then continue. */
  onEnable?: () => void;
  /** Skip — continue without enabling. */
  onSkip?: () => void;
  /** Override the centered illustration. Defaults to the "reading" illustration. */
  illustration?: React.ReactNode;
  title?: string;
  description?: string;
  enableLabel?: string;
  skipLabel?: string;
  /** Which theme's tokens to use. Defaults to the device color scheme. */
  mode?: ThemeMode;
  brandColors?: ThemeColorOverrides;
}

// Illustration intrinsic size (Figma 3089:4011), used to preserve its aspect ratio responsively.
const ILLO_W = 323;
const ILLO_H = 244;

export function NotificationsScreen({
  onEnable,
  onSkip,
  illustration,
  title = 'Enable Notifications',
  description = 'Get friendly nudges to help you keep up with your daily tasks, reminders and helpful insights.',
  enableLabel = 'Enable Notifications',
  skipLabel = 'No Thanks',
  mode,
  brandColors,
}: NotificationsScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const tokens = getColorTokens(resolvedMode, brandColors);

  const heading = tokens.button.background; // navy — title + the illustration's brand-tracking navy
  const bodyText = tokens.card.hint.text;

  const illoWidth = Math.min(width - 64, ILLO_W);
  const illoHeight = (illoWidth * ILLO_H) / ILLO_W;

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
        {illustration ?? (
          <EnableNotificationsIllustration width={illoWidth} height={illoHeight} color={heading} />
        )}
        <View style={styles.text}>
          <Text style={[styles.title, { color: heading }]}>{title}</Text>
          <Text style={[styles.description, { color: bodyText }]}>{description}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <PillButton
          label={enableLabel}
          variant="primary"
          onPress={onEnable}
          mode={mode}
          brandColors={brandColors}
        />
        <PillButton
          label={skipLabel}
          variant="text"
          onPress={onSkip}
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
