import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  tracking,
  fontFamily,
  getColorTokens,
  layout,
  LoginIcon,
  QrCodeIcon,
  type ThemeColorOverrides,
  type ThemeMode,
} from '@radarbase/app-kit';

/**
 * "Choose your login method" step — Figma node 3060:3279. First step of the registration flow: a
 * title/description and two option cards (Scan QR Code → advances to the QR step; Enter Login
 * Details → runs the OAuth redirect). The flow owns the header, progress bar, and slide; this is
 * just the body.
 */
export interface ChooseMethodViewProps {
  /** Scan-QR option — advance to the QR instructions step. */
  onScanQr: () => void;
  /** Enter-login-details option — run the OAuth redirect. */
  onEnterLoginDetails: () => void;
  /** Reflects `status === 'authenticating'` so the login card can show progress. */
  isAuthenticating?: boolean;
  /** Which theme's tokens to use. Defaults to the device color scheme. */
  mode?: ThemeMode;
  brandColors?: ThemeColorOverrides;
}

export function ChooseMethodView({
  onScanQr,
  onEnterLoginDetails,
  isAuthenticating = false,
  mode,
  brandColors,
}: ChooseMethodViewProps) {
  const insets = useSafeAreaInsets();
  const deviceScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const tokens = getColorTokens(resolvedMode, brandColors);

  const heading = tokens.button.background; // navy heading
  const hintText = tokens.card.hint.text; // #0E5474 — description
  const cardBg = tokens.card.hint.background; // #E3F4FA — option cards
  const optionText = tokens.text.primary; // option card labels

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.heading, { color: heading }]}>Choose your login method</Text>
      <Text style={[styles.description, { color: hintText }]}>
        Before you continue, please make sure you have your login information ready and received
        through email.
      </Text>

      <OptionCard
        backgroundColor={cardBg}
        textColor={optionText}
        icon={<QrCodeIcon width={80} height={80} color={heading} />}
        title="Scan QR Code"
        subtitle="I have a QR Code ready to scan"
        onPress={onScanQr}
      />

      <OptionCard
        backgroundColor={cardBg}
        textColor={optionText}
        icon={<LoginIcon width={80} height={80} color={heading} />}
        title="Enter Login Details"
        subtitle="Complete sign-in in your browser, then return to the app."
        onPress={onEnterLoginDetails}
        busy={isAuthenticating}
      />
    </ScrollView>
  );
}

function OptionCard({
  backgroundColor,
  textColor,
  icon,
  title,
  subtitle,
  onPress,
  busy = false,
}: {
  backgroundColor: string;
  textColor: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress?: () => void;
  busy?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy}
      style={[styles.card, { backgroundColor, opacity: busy ? 0.7 : 1 }]}
    >
      <View style={styles.cardIcon}>{busy ? <ActivityIndicator color={textColor} /> : icon}</View>
      <View style={styles.cardText}>
        <Text style={[styles.cardTitle, { color: textColor }]}>{title}</Text>
        <Text style={[styles.cardSubtitle, { color: textColor }]}>{subtitle}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 64,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    textAlign: 'center',
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  description: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    paddingHorizontal: 64,
    paddingVertical: 32,
    borderRadius: 24,
  },
  cardIcon: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flexShrink: 1,
    gap: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
  cardSubtitle: {
    fontSize: 12,
    fontWeight: '300',
    fontFamily: fontFamily.light,
    lineHeight: 15,
    letterSpacing: tracking.light,
    includeFontPadding: false,
  },
});
