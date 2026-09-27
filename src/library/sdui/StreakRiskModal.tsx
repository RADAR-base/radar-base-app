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
import FireIcon from '../../theme/icons/fire.svg';
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

/**
 * The badge from the streak stat card, at the size a modal wants.
 *
 * The same `fire.svg` and the same `card.engagement` colours the card pairs it with, so the prompt is
 * recognisably about the thing on the dashboard. Larger than the card's 36pt badge — it is the first
 * thing on the page here rather than a corner mark — with the icon scaled by the same ratio so the
 * flame sits in its circle exactly as it does there.
 */
const BADGE_SIZE = 56;
const BADGE_ICON = { width: 22, height: 31 };

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
  const muted = withAlpha(tokens.text.primary, 0.6);
  // The badge's two colours travel together and swap between themes — see `card.engagement` in the
  // theme. Taking both from there is what keeps the flame legible on its circle in dark mode.
  const badgeFill = tokens.card.engagement.streakBadge;
  const badgeInk = tokens.card.engagement.streakIcon;

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
          <View style={[styles.badge, { backgroundColor: badgeFill }]}>
            <FireIcon width={BADGE_ICON.width} height={BADGE_ICON.height} color={badgeInk} />
          </View>

          {streak > 0 && (
            <Text style={[styles.streakCount, { color: muted }]}>
              {streak} {streak === 1 ? 'day' : 'days'} in a row
            </Text>
          )}

          <Text style={[styles.title, { color: primary }]}>{title}</Text>
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
    // Rounder than the app's cards: `radiusCard` is drawn for a card in a list, and at this size it
    // reads as a sharp-cornered sheet. A dialog that pops is softer than the surfaces behind it.
    borderRadius: layout.radiusCard * 2,
    padding: layout.cardPadding,
    alignItems: 'center',
    gap: 12,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  streakCount: {
    fontSize: 14,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    letterSpacing: tracking.semiBold,
    includeFontPadding: false,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
  },
  cta: {
    marginTop: 4,
    minHeight: 52,
    alignSelf: 'stretch',
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
