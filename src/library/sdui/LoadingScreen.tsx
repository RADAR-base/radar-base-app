import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import {
  fontFamily,
  getColorTokens,
  tracking,
  type ThemeColorOverrides,
  type ThemeMode,
} from '../../theme/theme';

// Loading-bar dimensions from Figma 3341:3869 — each bar stretches from a 24px circle to a 75px pill.
const BAR_HEIGHT = 24;
const BAR_MIN = 24;
const BAR_MAX = 75;
const CYCLE = 900; // full stretch-and-return time (smaller = faster wave)

/** One bar of the loader: width animates min → max → min, forever, offset by `delay` (the CSS stagger). */
function Bar({ color, delay }: { color: string; delay: number }) {
  const width = useSharedValue(BAR_MIN);

  useEffect(() => {
    width.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(BAR_MAX, { duration: CYCLE / 2, easing: Easing.inOut(Easing.ease) }),
          withTiming(BAR_MIN, { duration: CYCLE / 2, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      ),
    );
  }, [width, delay]);

  const animatedStyle = useAnimatedStyle(() => ({ width: width.value }));

  return (
    <Animated.View
      style={[{ height: BAR_HEIGHT, borderRadius: BAR_HEIGHT, backgroundColor: color }, animatedStyle]}
    />
  );
}

export interface LoadingDotsProps {
  /** Bar color. Defaults to the theme's navy (`button.background`). */
  color?: string;
  /** Which theme's tokens to use for the default color. Defaults to the device color scheme. */
  mode?: ThemeMode;
  brandColors?: ThemeColorOverrides;
  style?: StyleProp<ViewStyle>;
}

/**
 * Three-bar "wave" loader — the CSS `load-2` pattern ported to reanimated (Figma 3341:3869). Three
 * navy bars stretch from circle to pill and back, staggered by a third of the cycle. Drop it anywhere
 * something is loading; `LoadingScreen` wraps it as a full page.
 */
export function LoadingDots({ color, mode, brandColors, style }: LoadingDotsProps) {
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const barColor = color ?? getColorTokens(resolvedMode, brandColors).button.background;

  return (
    <View style={[styles.bar, style]} accessibilityRole="progressbar" accessibilityLabel="Loading">
      <Bar color={barColor} delay={0} />
      <Bar color={barColor} delay={CYCLE / 3} />
      <Bar color={barColor} delay={(CYCLE / 3) * 2} />
    </View>
  );
}

export interface LoadingScreenProps {
  /** Caption under the loader. Default "Loading...". */
  label?: string;
  /** Which theme's tokens to use. Defaults to the device color scheme. */
  mode?: ThemeMode;
  brandColors?: ThemeColorOverrides;
  /**
   * Minimum time (ms) the screen stays before it's allowed to leave, so it never just flashes when
   * loading is fast. Default 900.
   */
  minDurationMs?: number;
  /**
   * Whether the app behind the loader is ready. Once `ready` AND the minimum time has elapsed, the
   * screen slides off to the left and calls `onHidden`. Omit `onHidden` (e.g. when the parent swaps
   * the screen out itself) and it simply fades in and waits — no slide.
   */
  ready?: boolean;
  /**
   * Called after the slide-out finishes. The parent must keep this component mounted until it fires,
   * then unmount it — parent-driven unmount (not a reanimated `exiting` animation) is what lets the
   * exit animate without stranding a touch-blocking remnant on Android.
   */
  onHidden?: () => void;
}

/** How long the slide-off-to-the-left takes. */
const SLIDE_OUT_MS = 400;

/**
 * Full-page loading screen — Figma node 3303:3789. The three-bar loader over the theme background
 * with a "Loading..." caption, centered. Renders as an absolute-fill overlay: it fades in, holds for
 * at least `minDurationMs`, then (once `ready`) slides off to the left to reveal the content behind
 * it and calls `onHidden` so the parent can unmount it.
 */
export function LoadingScreen({
  label = 'Loading...',
  mode,
  brandColors,
  minDurationMs = 900,
  ready = true,
  onHidden,
}: LoadingScreenProps) {
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const tokens = getColorTokens(resolvedMode, brandColors);
  const { width } = useWindowDimensions();

  // Gate the exit on a minimum on-screen time so the loader never just flashes when loading is fast.
  const [minElapsed, setMinElapsed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), minDurationMs);
    return () => clearTimeout(timer);
  }, [minDurationMs]);

  // Manual shared value driving the slide-left exit. We deliberately AVOID reanimated layout
  // animations (`entering`/`exiting`): an `exiting` animation on a full-screen root keeps the view
  // alive natively after React unmounts it and strands an invisible overlay that swallows ALL touches
  // on Android. A shared value lives and dies with the component, so nothing is left behind.
  //
  // No fade-in: as a covering overlay it must be OPAQUE from the first frame, or the content behind
  // it flashes through while it fades in — a visible flicker on reload.
  const translateX = useSharedValue(0);

  // Once the app is ready and the minimum time has passed, slide off to the left, then hand control
  // back to the parent (which unmounts us).
  const leaving = ready && minElapsed && onHidden != null;
  useEffect(() => {
    if (!leaving) return;
    translateX.value = withTiming(
      -width,
      { duration: SLIDE_OUT_MS, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished && onHidden) runOnJS(onHidden)();
      },
    );
  }, [leaving, width, translateX, onHidden]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    // While leaving, `pointerEvents="none"` lets taps fall through to the content being revealed.
    <Animated.View
      pointerEvents={leaving ? 'none' : 'auto'}
      style={[styles.screen, { backgroundColor: tokens.background.primary }, animatedStyle]}
    >
      <LoadingDots mode={mode} brandColors={brandColors} />
      <Text style={[styles.label, { color: tokens.card.hint.text }]}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    // Absolute-fill so it overlays the content behind it and can slide away to reveal it.
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  label: {
    fontSize: 14,
    lineHeight: 14,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
