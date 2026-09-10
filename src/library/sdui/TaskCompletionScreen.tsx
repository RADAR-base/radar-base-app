import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import {
  fontFamily,
  getColorTokens,
  readableTextColor,
  tracking,
  type ThemeColorOverrides,
  type ThemeMode,
} from '../../theme/theme';
import { useTopInset } from './useTopInset';
import { useBottomInset } from './useBottomInset';
import { PageHeader } from './PageHeader';

export interface TaskCompletionScreenProps {
  /** Task title shown in the small header label. */
  taskName: string;
  /** Main heading — defaults to "Well done". */
  heading?: string;
  /** Body copy — defaults to the two-line message from the screenshot. */
  message?: string;
  /** Called when the user taps "Home". */
  onHome: () => void;
  /** Called when the user taps "My Calendar". */
  onCalendar: () => void;
  mode?: ThemeMode;
  brandColors?: ThemeColorOverrides;
}

/**
 * Task completion screen — shown after a questionnaire is submitted.
 * Matches the screenshot: a celebratory starburst illustration, "Well done" heading,
 * supportive message, and two bottom buttons (My Calendar / Home).
 */
export function TaskCompletionScreen({
  taskName,
  heading = 'Well done',
  message = 'Thank you for your continuous support!',
  onHome,
  onCalendar,
  mode,
  brandColors,
}: TaskCompletionScreenProps) {
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const tokens = getColorTokens(resolvedMode, brandColors);
  const topInset = useTopInset();
  // Just the home indicator / gesture bar — no extra gutter. The safe-area inset is already ~34pt on
  // a notched phone, and adding the design's 16 on top left the buttons floating clear of the edge.
  const bottomInset = useBottomInset();

  const brand = brandColors?.brand ?? tokens.button.background;
  const brandOnBrand = readableTextColor(brand);
  const textPrimary = tokens.text.primary;
  const textSecondary = tokens.text.brand;

  // Entry animation: scale up + fade in the illustration
  const scale = useSharedValue(0.3);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(-15);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 400 });
    scale.value = withSpring(1, { damping: 12, stiffness: 100 });
    rotate.value = withSequence(
      withTiming(5, { duration: 300, easing: Easing.out(Easing.quad) }),
      withDelay(100, withSpring(0, { damping: 8, stiffness: 80 })),
    );
  }, [opacity, scale, rotate]);

  const illustrationStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: tokens.background.primary,
          paddingTop: topInset,
          paddingBottom: bottomInset,
        },
      ]}
    >
      <PageHeader
        onBack={() => {}}
        title={taskName}
        progress={1}
        showBack={false}
        mode={mode}
        brandColors={brandColors}
      />

      <View style={styles.body}>
        <View style={styles.illustrationContainer}>
          <Animated.View style={illustrationStyle}>
            <StarburstIllustration size={240} color={brand} />
          </Animated.View>
        </View>

        <View style={styles.textBlock}>
          <Text style={[styles.heading, { color: textPrimary }]}>{heading}</Text>
          <Text style={[styles.message, { color: textSecondary }]}>{message}</Text>
        </View>
      </View>

      <View style={styles.buttonsRow}>
      <Pressable
          accessibilityRole="button"
          onPress={onHome}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: brand },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.buttonLabel, { color: brandOnBrand }]}>Home</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={onCalendar}
          style={({ pressed }) => [
            styles.button,
            styles.outlineButton,
            { borderColor: brand },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.buttonLabel, { color: brand }]}>Calendar</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Celebratory starburst / firework illustration — 12 teardrop petals radiating from center. */
function StarburstIllustration({ size = 240, color = '#000' }: { size?: number; color?: string }) {
  const petals = 12;
  const cx = 100;
  const cy = 100;
  const petalLength = 42;
  const petalWidth = 14;

  const paths: string[] = [];
  for (let i = 0; i < petals; i++) {
    const angle = (i * 360) / petals;
    const rad = (angle * Math.PI) / 180;

    // Teardrop: narrow at center, fat tip at the outer end
    const tipX = cx + Math.cos(rad) * petalLength;
    const tipY = cy + Math.sin(rad) * petalLength;

    // Perpendicular offsets at the tip for the bulge
    const perpX = Math.sin(rad) * petalWidth;
    const perpY = -Math.cos(rad) * petalWidth;

    // Control points for the curves — pull toward the center for the teardrop neck
    const cp1X = cx + Math.cos(rad) * petalLength * 0.4 + perpX * 0.3;
    const cp1Y = cy + Math.sin(rad) * petalLength * 0.4 + perpY * 0.3;
    const cp2X = tipX + perpX * 0.5;
    const cp2Y = tipY + perpY * 0.5;

    const cp3X = tipX - perpX * 0.5;
    const cp3Y = tipY - perpY * 0.5;
    const cp4X = cx + Math.cos(rad) * petalLength * 0.4 - perpX * 0.3;
    const cp4Y = cy + Math.sin(rad) * petalLength * 0.4 - perpY * 0.3;

    paths.push(
      `M ${cx} ${cy} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${tipX} ${tipY} C ${cp3X} ${cp3Y}, ${cp4X} ${cp4Y}, ${cx} ${cy} Z`,
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      {paths.map((d, i) => (
        <Path key={i} d={d} fill={color} />
      ))}
    </Svg>
  );
}

const BUTTON_PADDING = 16;
const OUTLINE_BORDER = 3;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 16,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  illustrationContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  heading: {
    fontSize: 32,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    textAlign: 'center',
    includeFontPadding: false,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    textAlign: 'center',
    includeFontPadding: false,
  },
  buttonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    paddingBottom: 16,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: BUTTON_PADDING,
    borderRadius: 24,
    minHeight: 52,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: OUTLINE_BORDER,
    paddingVertical: BUTTON_PADDING - OUTLINE_BORDER,
  },
  pressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    fontSize: 16,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
