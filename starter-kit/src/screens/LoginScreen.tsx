import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useAuth, useSlideOverlay, type ThemeManifest } from '@radarbase/app-kit';

import { GradientMeshBackground, StudyNameModal, WelcomeCard } from '../components';
import { RegistrationFlow } from './RegistrationFlow';

export interface LoginScreenProps {
  /** Theme tokens from the loaded manifest's `theme` block. Drives all colors on this screen. */
  theme: ThemeManifest;
  /** Study/app name for the welcome card. Sourced from the manifest's `appName`. */
  appName?: string;
  /** Description copy for the welcome card. Sourced from the manifest's `description`. */
  description?: string;
  /** Optional welcome heading. Defaults to "Welcome". */
  title?: string;
  /** Optional subtitle copy under the heading. */
  subtitle?: string;
  /** Optional call-to-action label on the primary button. Defaults to "Sign in". */
  ctaLabel?: string;
}

export function LoginScreen({
  theme,
  appName,
  description,
  title = 'Welcome',
  subtitle = 'Sign in to access your study dashboard.',
  ctaLabel = 'Sign in',
}: LoginScreenProps) {
  const { status, error, startLogin, clearError, cancelLogin } = useAuth();
  const isAuthenticating = status === 'authenticating';
  const insets = useSafeAreaInsets();
  const [signUpOpen, setSignUpOpen] = useState(false);

  // Pushes the enrolment page in from the right; the welcome screen slides left in lockstep.
  const enrolment = useSlideOverlay();

  const onPressLogin = async () => {
    if (error) clearError();
    try {
      await startLogin();
    } catch {
      // useAuth already mirrors the error into state via EventBus; nothing more to do here.
    }
  };

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, enrolment.baseStyle]}>
        <GradientMeshBackground
          primaryColor={theme.brandColors?.primary}
          secondaryColor={theme.brandColors?.secondary}
          tertiaryColor={theme.brandColors?.tertiary}
          frosted
          paused={enrolment.visible}
        />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top }]}>
          <WelcomeCard
            studyName={appName}
            description={description}
            onGetStarted={enrolment.open}
            onSignUp={() => setSignUpOpen(true)}
            safeAreaBottomInset={insets.bottom}
            brandColors={theme.brandColors}
          />
            {/* <View style={styles.legacyContent}>
              <View style={styles.contentWrapper}>
              <View style={styles.header}>
                <Text style={[styles.title, { color: TEXT_ON_MESH }]}>{title}</Text>
                <Text style={[styles.subtitle, { color: TEXT_ON_MESH_MUTED }]}>{subtitle}</Text>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ busy: isAuthenticating, disabled: isAuthenticating }}
                  disabled={isAuthenticating}
                  onPress={onPressLogin}
                  style={[
                    styles.primaryButton,
                    { backgroundColor: theme.primaryColor, opacity: isAuthenticating ? 0.7 : 1 },
                  ]}
                >
                  {isAuthenticating ? (
                    <ActivityIndicator color={ON_PRIMARY} />
                  ) : (
                    <Text style={[styles.primaryButtonLabel, { color: ON_PRIMARY }]}>{ctaLabel}</Text>
                  )}
                </TouchableOpacity>

                {isAuthenticating && (
                  <Text style={[styles.helperText, { color: TEXT_ON_MESH_MUTED }]}>
                    Complete sign-in in your browser, then return to the app.
                  </Text>
                )}

                {error && (
                  <View style={[styles.errorBanner, { borderColor: theme.primaryColor }]}>
                    <Text style={[styles.errorText, { color: TEXT_ON_MESH }]} numberOfLines={4}>
                      {error}
                    </Text>
                  </View>
                )}
              </View>
              </View>
            </View> */}
        </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>

      <StudyNameModal
        visible={signUpOpen}
        onClose={() => setSignUpOpen(false)}
        onSubmit={() => setSignUpOpen(false)}
        brandColors={theme.brandColors}
      />

      {enrolment.visible && (
        <Animated.View style={[StyleSheet.absoluteFill, enrolment.overlayStyle]}>
          <RegistrationFlow
            onExit={enrolment.close}
            onEnterLoginDetails={onPressLogin}
            onResetLogin={cancelLogin}
            isAuthenticating={isAuthenticating}
            brandColors={theme.brandColors}
          />
        </Animated.View>
      )}
    </View>
  );
}

/**
 * Single hardcoded color in this file: foreground text rendered on top of `theme.primaryColor`.
 * The manifest theme doesn't expose a `textOnPrimary` token; white reads safely on the
 * conventional darker/saturated primary colors apps choose. Override locally if you set a
 * light primary.
 */
const ON_PRIMARY = '#FFFFFF';

/**
 * Foreground text colors used over the animated gradient mesh, which is dark and
 * saturated. The manifest theme's text tokens are tuned for a light background, so we
 * override to light values here for legibility. Adjust if you change the mesh palette.
 */
const TEXT_ON_MESH = '#FFFFFF';
const TEXT_ON_MESH_MUTED = 'rgba(255, 255, 255, 0.78)';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    // Fallback shown for the first frame before the Skia canvas paints.
    backgroundColor: '#482fc4',
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  legacyContent: {
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  contentWrapper: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  actions: {
    marginBottom: 24,
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  helperText: {
    marginTop: 12,
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  errorBanner: {
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
