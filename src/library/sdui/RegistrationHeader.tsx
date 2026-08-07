import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';

import { tracking, fontFamily, getColorTokens, layout, type ThemeColorOverrides, type ThemeMode } from '../../theme/theme';
import { useTopInset } from './useTopInset';

/**
 * Registration-flow header — a back button, a centered title, and an animated progress bar. Intended
 * as a single persistent instance owned by a stepped flow, so `progress` changes animate the fill
 * smoothly between steps instead of jumping. Also owns the top safe-area inset and horizontal
 * padding for the flow. Colors come from the theme tokens.
 */
export interface RegistrationHeaderProps {
  onBack: () => void;
  /** Progress, 0..1. Changes animate the fill width. */
  progress: number;
  title?: string;
  /** Whether to show the back button. When false, its space is kept so the title stays centered. */
  showBack?: boolean;
  /** Which theme's tokens to use. Defaults to the device color scheme. */
  mode?: ThemeMode;
  brandColors?: ThemeColorOverrides;
}

export function RegistrationHeader({
  onBack,
  progress,
  title = 'Registration',
  showBack = true,
  mode,
  brandColors,
}: RegistrationHeaderProps) {
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const tokens = getColorTokens(resolvedMode, brandColors);
  const progressColor = tokens.header.buttonIcon; // navy in light, white in dark
  // The header owns the top safe-area inset for the registration flow, so screens using it don't
  // each add their own paddingTop. Clears the status bar (edge-to-edge) + an Android breathing gutter.
  const topInset = useTopInset();

  // Animate the fill width. We animate a pixel width (from the track's measured width) rather than a
  // percentage, since reanimated animates numeric values cleanly.
  const [trackWidth, setTrackWidth] = useState(0);
  const clamped = Math.min(Math.max(progress, 0), 1);
  const fillWidth = useSharedValue(0);
  useEffect(() => {
    fillWidth.value = withTiming(clamped * trackWidth, { duration: 300 });
  }, [clamped, trackWidth, fillWidth]);
  const fillStyle = useAnimatedStyle(() => ({ width: fillWidth.value }));

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.titleBar}>
        {showBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={8}>
            {({ pressed }) => (
              // Press feedback: the chip fills with the brand color and the arrow flips to white.
              <BackIcon
                circleColor={pressed ? tokens.button.background : tokens.card.stats.openBadge}
                iconColor={pressed ? tokens.navbar.text.primary : tokens.card.stats.openIcon}
              />
            )}
          </Pressable>
        ) : (
          // Keep the 36px slot so the centered title doesn't shift when the back button is hidden.
          <View style={styles.backSpacer} />
        )}
        <Text style={[styles.title, { color: tokens.card.hint.text }]}>{title}</Text>
      </View>

      <View
        style={styles.progressTrack}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        <View style={[styles.progressTrackFill, { backgroundColor: progressColor }]} />
        <Animated.View style={[styles.progressFill, fillStyle, { backgroundColor: progressColor }]} />
      </View>
    </View>
  );
}

/** Back button (circular chip + left arrow) — Figma node 3067:4170, exact vector; colors themed. */
function BackIcon({
  size = 36,
  circleColor,
  iconColor,
}: {
  size?: number;
  circleColor: string;
  iconColor: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <Rect width="36" height="36" rx="18" fill={circleColor} />
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16.491 8.19531L6.68629 18L16.491 27.8047L17.9994 26.2963L10.7696 19.0664L28.2472 19.0665L28.2473 16.9335L10.7696 16.9336L17.9994 9.70372L16.491 8.19531Z"
        fill={iconColor}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 16,
    paddingHorizontal: 16,
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 36, // balances the 36px back button so the title stays centered
  },
  backSpacer: {
    width: 36,
    height: 36,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  progressTrack: {
    width: '100%',
    height: 5,
    borderRadius: 24,
  },
  progressTrackFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    opacity: 0.1,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 24,
  },
});
