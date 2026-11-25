import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
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
  readableTextColor,
  resolveBackground,
  tracking,
  withAlpha,
  type ThemeColorOverrides,
  type ThemeMode,
} from '../../theme/theme';

// A lightly damped spring in, so the card overshoots a hair and reads as a pop; a quick timing out.
const POP_IN = { damping: 13, stiffness: 190, mass: 0.7 } as const;
const POP_OUT_MS = 140;
/** Scale the card grows from. */
const POP_FROM = 0.88;
/** The dialog's description grey (Figma 4388:2809); dark mode softens the text colour instead. */
const MUTED_LIGHT = '#686868';

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
  // The page colour, not the card's: a dialog is a page laid over the page, and cards inside it
  // (e.g. the device tiles) then lift off it as they do on a screen.
  const surface = resolveBackground({ brandColors }, mode);

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

/** The dialog's muted text colour, for subtitles and secondary copy. */
export function modalMuted(mode: ThemeMode, brandColors?: ThemeColorOverrides): string {
  return mode === 'dark' ? withAlpha(getColorTokens(mode, brandColors).text.primary, 0.65) : MUTED_LIGHT;
}

/** The round close button at a dialog's top left (Figma 3120:3502). */
export function CloseIcon({
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
      <Path d="M26 25.9955L10 10M26 10L10 25.9955" stroke={iconColor} strokeWidth={1.875} strokeLinecap="round" />
    </Svg>
  );
}

export interface ModalHeaderProps {
  title: string;
  subtitle?: string;
  /** Shows the close button; leave it out for a dialog that must be answered. */
  onClose?: () => void;
  /** A badge or picture between the close button and the title. */
  icon?: React.ReactNode;
  /** Overrides the brand title, e.g. the error colour for a destructive question. */
  titleColor?: string;
  brandColors?: ThemeColorOverrides;
  /** E.g. `{ marginBottom: 0 }` when nothing follows the heading. */
  style?: StyleProp<ViewStyle>;
}

/**
 * Every dialog's top, as on "Your Contribution" (Figma 4388:2809): the close button, then a centred
 * title and muted subtitle, 32pt clear of what follows.
 */
export function ModalHeader({
  title,
  subtitle,
  onClose,
  icon,
  titleColor,
  brandColors,
  style,
}: ModalHeaderProps) {
  const mode: ThemeMode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const tokens = getColorTokens(mode, brandColors);
  const brand = tokens.button.background;
  const surface = resolveBackground({ brandColors }, mode);

  const close = onClose && (
    <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}>
      {({ pressed }) => (
        <CloseIcon
          circleColor={pressed ? brand : tokens.card.stats.openBadge}
          iconColor={pressed ? tokens.navbar.text.primary : tokens.card.stats.openIcon}
        />
      )}
    </Pressable>
  );
  const titleText = (
    <Text
      style={[
        styles.title,
        { color: titleColor ?? readableTextColor(surface, { preferred: brand }) },
      ]}
    >
      {title}
    </Text>
  );

  return (
    <View style={[styles.header, style]}>
      {close && <View style={styles.closeRow}>{close}</View>}
      {icon && <View style={styles.icon}>{icon}</View>}
      <View style={styles.heading}>
        {titleText}
        {!!subtitle && <Text style={[styles.subtitle, { color: modalMuted(mode, brandColors) }]}>{subtitle}</Text>}
      </View>
    </View>
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
  /** Figma 4388:2809: 32pt padding, 16pt between rows. */
  card: {
    // Rounder than a list card, which reads as sharp-cornered at dialog size.
    borderRadius: layout.radiusCard * 2,
    padding: 32,
    alignItems: 'center',
    gap: 16,
  },
  /** With the card's 16pt gap, 32pt between the heading and the body. */
  header: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  closeRow: {
    width: '100%',
    flexDirection: 'row',
    marginBottom: 16,
  },
  icon: {
    marginBottom: 16,
  },
  heading: {
    width: '100%',
    gap: 16,
  },
  title: {
    fontSize: 24,
    lineHeight: 28,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
});
