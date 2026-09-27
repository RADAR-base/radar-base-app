import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  cardShadow,
  fontFamily,
  getColorTokens,
  layout,
  tracking,
  withAlpha,
  type ThemeColorOverrides,
  type ThemeMode,
} from '../../theme/theme';

/**
 * "Don't lose your streak" — shown once, on opening the app, when the last judged day was missed and
 * a streak is still standing.
 *
 * A warning rather than an obituary: under the schedule's one-miss-forgiven rule the streak survives
 * a single missed day, so there really is something left to save, and completing today's tasks is
 * what saves it. If the rule ever changes so that a miss ends the streak outright, this copy has to
 * change with it — it would be promising something the app no longer honours.
 */
export interface StreakRiskModalProps {
  visible: boolean;
  onClose: () => void;
  /** The primary action — "Complete a task". Dismisses if unset. */
  onAction?: () => void;
  /** The streak at stake. Shown only when greater than zero. */
  streak?: number;
  title?: string;
  description?: string;
  ctaLabel?: string;
  dismissLabel?: string;
  /** Which theme's tokens to use. Defaults to the device color scheme. */
  mode?: ThemeMode;
  /** Manifest brand colors, so the button and the count track the app's primary. */
  brandColors?: ThemeColorOverrides;
}

/** The flame the streak cards already use, so the prompt is recognisably about the same thing. */
const FLAME = '\u{1F525}';

/**
 * How the card arrives, and how it leaves.
 *
 * A spring in, so it overshoots a hair and settles — that slight bounce is what reads as a *pop*
 * rather than a fade. Lightly damped for the same reason; damp it much harder and it simply glides.
 * Out is a plain, quicker timing: a dismissal that springs feels like it is arguing with you.
 */
const POP_IN = { damping: 13, stiffness: 190, mass: 0.7 } as const;
const POP_OUT_MS = 140;

/** How small the card starts. Much under this reads as flying in from far away rather than popping. */
const POP_FROM = 0.88;

export function StreakRiskModal({
  visible,
  onClose,
  onAction,
  streak = 0,
  title = "Don't Lose your streak",
  description = 'Looks like you missed a task from yesterday. Complete a task today to retain the streak?',
  ctaLabel = 'Complete a task',
  dismissLabel = 'Not now',
  mode,
  brandColors,
}: StreakRiskModalProps) {
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const tokens = getColorTokens(resolvedMode, brandColors);

  const primary = tokens.button.background;
  const onPrimary = tokens.button.text;
  const surface = tokens.card.background;
  const text = tokens.text.primary;
  const muted = withAlpha(tokens.text.primary, 0.6);

  /**
   * Kept mounted a moment past `visible` so the exit can play.
   *
   * `Modal`'s own `animationType` is off: it would cross-fade the whole surface underneath whatever
   * the card is doing, and the two never agree on timing. Driven by hand instead — and manually
   * rather than with `entering`/`exiting`, which strand an invisible touch-blocking overlay over the
   * screen on Android once a full-bleed view has animated out.
   */
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);
  const wasVisible = useRef(visible);

  useEffect(() => {
    if (visible === wasVisible.current) return;
    wasVisible.current = visible;
    if (visible) {
      setMounted(true);
      progress.value = withSpring(1, POP_IN);
      return;
    }
    progress.value = withTiming(0, { duration: POP_OUT_MS }, finished => {
      // Only on a clean finish: an interrupted exit means it is being shown again, and unmounting
      // then would pull the card out from under the entry that just started.
      if (finished) runOnJS(setMounted)(false);
    });
  }, [visible, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [POP_FROM, 1]) }],
  }));

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      {/* The backdrop dismisses, as the app's other modal does — but the card swallows the press, so
          tapping inside it doesn't close the thing you're reading. */}
      <Animated.View style={[styles.backdropFill, backdropStyle]}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Animated.View style={cardStyle}>
          <Pressable
            style={[styles.card, { backgroundColor: surface }, cardShadow]}
            onPress={() => {}}
          >
          {streak > 0 && (
            <View style={[styles.streakPill, { backgroundColor: withAlpha(primary, 0.1) }]}>
              <Text style={styles.streakFlame}>{FLAME}</Text>
              <Text style={[styles.streakCount, { color: primary }]}>
                {streak} {streak === 1 ? 'day' : 'days'}
              </Text>
            </View>
          )}

          <Text style={[styles.title, { color: text }]}>{title}</Text>
          <Text style={[styles.description, { color: muted }]}>{description}</Text>

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: primary, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={onAction ?? onClose}
          >
            <Text style={[styles.ctaText, { color: onPrimary }]}>{ctaLabel}</Text>
          </Pressable>

          <Pressable accessibilityRole="button" style={styles.dismiss} onPress={onClose}>
            <Text style={[styles.dismissText, { color: muted }]}>{dismissLabel}</Text>
          </Pressable>
          </Pressable>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  /** The dimming itself, which fades as one piece with the card. */
  backdropFill: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  /** The press target and the centring, inside the fade so neither is affected by it. */
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: layout.radiusCard,
    padding: layout.cardPadding,
    gap: 12,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
  },
  streakFlame: {
    fontSize: 16,
  },
  streakCount: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    letterSpacing: tracking.semiBold,
    includeFontPadding: false,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
  },
  cta: {
    marginTop: 4,
    minHeight: 52,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: 16,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    letterSpacing: tracking.semiBold,
    includeFontPadding: false,
  },
  dismiss: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  dismissText: {
    fontSize: 15,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
    letterSpacing: tracking.medium,
    includeFontPadding: false,
  },
});
