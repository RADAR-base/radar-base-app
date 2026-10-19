import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  useColorScheme,
  type ViewStyle,
} from 'react-native';
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
  getColorTokens,
  layout,
  type ThemeColorOverrides,
  type ThemeMode,
} from '../../theme/theme';

// A lightly damped spring in, so the card overshoots a hair and reads as a pop; a quick timing out.
const POP_IN = { damping: 13, stiffness: 190, mass: 0.7 } as const;
const POP_OUT_MS = 140;
/** Scale the card grows from. */
const POP_FROM = 0.88;

export interface ModalShellProps {
  visible: boolean;
  /** Called by the backdrop; close controls in `children` should call it too. */
  onClose: () => void;
  children: React.ReactNode;
  brandColors?: ThemeColorOverrides;
  /** Lift the card clear of the keyboard, for a dialog holding a text field. */
  avoidKeyboard?: boolean;
  /** Overrides on the card itself, for a dialog whose design differs (padding, gap, surface). */
  surfaceStyle?: StyleProp<ViewStyle>;
}

/** The chrome every dialog shares: the `Modal`, dimmed backdrop, pop animation and card. */
export function ModalShell({
  visible,
  onClose,
  children,
  brandColors,
  avoidKeyboard = false,
  surfaceStyle,
}: ModalShellProps) {
  const deviceScheme = useColorScheme();
  const mode: ThemeMode = deviceScheme === 'dark' ? 'dark' : 'light';
  const surface = getColorTokens(mode, brandColors).card.background;

  // Kept mounted past `visible` so the exit can play. Driven by hand: `entering`/`exiting` strand a
  // touch-blocking overlay on Android.
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  // Seeded false so a dialog mounted already-visible still animates in.
  const wasVisible = useRef(false);

  useEffect(() => {
    if (visible === wasVisible.current) return;
    wasVisible.current = visible;
    if (visible) {
      setMounted(true);
      progress.value = withSpring(1, POP_IN);
      return;
    }
    progress.value = withTiming(0, { duration: POP_OUT_MS }, (finished) => {
      // An interrupted exit means it is being shown again, so only unmount on a clean finish.
      if (finished) runOnJS(setMounted)(false);
    });
  }, [visible, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [POP_FROM, 1]) }],
  }));

  // An element, not an inline component, so the card isn't remounted on every render.
  const card = (
    <Animated.View style={[styles.cardWrap, cardStyle]}>
      {/* Swallows the press so tapping inside the card doesn't dismiss it. */}
      <Pressable
        style={[styles.card, { backgroundColor: surface }, cardShadow, surfaceStyle]}
        onPress={() => {}}
      >
        {children}
      </Pressable>
    </Animated.View>
  );

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdropFill, backdropStyle]}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          {avoidKeyboard ? (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.keyboardLift}
            >
              {card}
            </KeyboardAvoidingView>
          ) : (
            card
          )}
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropFill: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: layout.cardPadding * 1.5,
  },
  keyboardLift: {
    flex: 1,
    justifyContent: 'center',
  },
  /** Caps the card's width on a tablet. */
  cardWrap: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  card: {
    // Rounder than a list card, which reads as sharp-cornered at dialog size.
    borderRadius: layout.radiusCard * 2,
    padding: layout.cardPadding * 1.5,
    alignItems: 'center',
    gap: layout.gap,
  },
});
