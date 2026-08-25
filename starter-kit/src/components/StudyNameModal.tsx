import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import {
  tracking,
  fontFamily,
  getColorTokens,
  layout,
  TextInputField,
  type ThemeColorOverrides,
  type ThemeMode,
} from '@radarbase/app-kit';

/**
 * "Enter Study Name" modal — Figma node 3120:1253. A close (X) button, a title + description,
 * a text input, and a search button, shown over a dimmed backdrop. Opened from the WelcomeCard's
 * "Sign Up" action. Colors follow the device color scheme (or an explicit `mode`) and `brandColors`.
 */
export interface StudyNameModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the entered study name when the search button is pressed. */
  onSubmit?: (studyName: string) => void;
  title?: string;
  description?: string;
  placeholder?: string;
  ctaLabel?: string;
  /** Which theme's tokens to use. Defaults to the device color scheme. */
  mode?: ThemeMode;
  /** Manifest brand colors, threaded so the title/button track the app's primary. */
  brandColors?: ThemeColorOverrides;
}

/** Subtitle gray from the Figma design (node 3120:1295) — not a theme token. */
const DESCRIPTION_COLOR = '#686868';

export function StudyNameModal({
  visible,
  onClose,
  onSubmit,
  title = 'Enter Study Name',
  description = 'Enter the study name and we will search for their study enrolment portal',
  placeholder = 'Study name',
  ctaLabel = 'Search Study',
  mode,
  brandColors,
}: StudyNameModalProps) {
  const [studyName, setStudyName] = useState('');
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const tokens = getColorTokens(resolvedMode, brandColors);

  const brand = tokens.button.background; // navy — title + button, follows brandColors.primary
  const onBrand = tokens.navbar.text.primary; // white — button label
  const cardBg = tokens.background.primary; // mint card surface
  // Close button reuses the neutral "stats badge" token pair (light circular chip + adaptive
  // icon) — it maps to #E5E5EA/#111111 in light and flips correctly in dark.
  const closeChip = tokens.card.stats.openBadge;
  const closeIcon = tokens.card.stats.openIcon;

  const handleClose = () => {
    setStudyName('');
    onClose();
  };

  const handleSubmit = () => onSubmit?.(studyName.trim());

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      {/* Dimmed backdrop; tapping outside the card dismisses. */}
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.center}
        >
          {/* Stop propagation so taps inside the card don't dismiss it. */}
          <Pressable style={[styles.card, { backgroundColor: cardBg }]} onPress={() => {}}>
            <View style={styles.closeRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={handleClose} hitSlop={8}>
                {({ pressed }) => (
                  // Press feedback: the chip fills with the brand color and the X flips to white.
                  <CloseIcon
                    circleColor={pressed ? brand : closeChip}
                    iconColor={pressed ? onBrand : closeIcon}
                  />
                )}
              </Pressable>
            </View>

            <Text style={[styles.title, { color: brand }]}>{title}</Text>
            <Text style={styles.description}>{description}</Text>

            <View style={styles.form}>
              <TextInputField
                value={studyName}
                onChangeText={setStudyName}
                placeholder={placeholder}
                mode={resolvedMode}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={handleSubmit}
              />

              <TouchableOpacity
                accessibilityRole="button"
                onPress={handleSubmit}
                style={[styles.button, { backgroundColor: brand }]}
              >
                <Text style={[styles.buttonLabel, { color: onBrand }]}>{ctaLabel}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

/** Close button (circular chip + X) — Figma node 3120:3502, exact vector; colors themed. */
function CloseIcon({
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
        d="M26 25.9955L10 10M26 10L10 25.9955"
        stroke={iconColor}
        strokeWidth={1.875}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: 420,
    gap: 16,
    padding: 32,
    borderRadius: 24,
  },
  closeRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    lineHeight: 30, // > fontSize so Android doesn't clip the title
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    letterSpacing: tracking.bold,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '300',
    fontFamily: fontFamily.light,
    letterSpacing: tracking.light,
    textAlign: 'center',
    color: DESCRIPTION_COLOR,
    includeFontPadding: false,
  },
  form: {
    width: '100%',
    gap: 40, // Figma gap between input and button (node 3122:3517)
    marginTop: 16,
  },
  button: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: layout.radiusPill,
    minHeight: 52,
  },
  buttonLabel: {
    fontSize: 16,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    textAlign: 'center',
    includeFontPadding: false, // Android: keeps the label vertically centered in the button
  },
});
