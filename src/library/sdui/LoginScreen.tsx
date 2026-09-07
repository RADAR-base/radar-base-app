import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { layout, type ThemeColorOverrides } from '../../theme/theme';
import { useAuth } from '../../core/useAuth';
import { useSlideOverlay } from './useSlideOverlay';

import { GradientMeshBackground } from './GradientMeshBackground';
import { StudyNameModal } from './StudyNameModal';
import { WelcomeCard } from './WelcomeCard';
import { RegistrationFlow } from './RegistrationFlow';

export interface LoginScreenProps {
  /** Brand color overrides from the manifest's `theme` block. */
  brandColors?: ThemeColorOverrides;
  /** Study/app name for the welcome card. Sourced from the manifest's `appName`. */
  appName?: string;
  /** Description copy for the welcome card. Sourced from the manifest's `description`. */
  description?: string;
  /** Show the "Sign Up" button on the welcome card. Defaults to `true`. */
  showSignUp?: boolean;
}

export function LoginScreen({
  brandColors,
  appName,
  description,
  showSignUp,
}: LoginScreenProps) {
  const { status, error, startLogin, clearError, cancelLogin } = useAuth();
  const isAuthenticating = status === 'authenticating';
  const insets = useSafeAreaInsets();
  const [signUpOpen, setSignUpOpen] = useState(false);
  const [loginIdOpen, setLoginIdOpen] = useState(false);

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
          primaryColor={brandColors?.brand}
          tertiaryColor={brandColors?.accent}
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
            brandColors={brandColors}
            showSignUp={showSignUp}
          />
        </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>

      <StudyNameModal
        visible={signUpOpen}
        onClose={() => setSignUpOpen(false)}
        onSubmit={() => setSignUpOpen(false)}
        brandColors={brandColors}
      />

      {/* "Enter Login Details" opens this study-ID prompt (same modal as Sign Up). Pressing Search
          kicks off the OAuth login in the browser, exactly as the button used to do directly. The
          entered ID isn't yet used to resolve the portal URL — that stays the configured default. */}
      <StudyNameModal
        visible={loginIdOpen}
        onClose={() => setLoginIdOpen(false)}
        onSubmit={() => {
          setLoginIdOpen(false);
          void onPressLogin();
        }}
        title="Enter Study ID"
        description="Enter your study ID and we'll find your login portal"
        placeholder="Study ID"
        ctaLabel="Search"
        brandColors={brandColors}
      />

      {enrolment.visible && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.roundedOverlay, enrolment.overlayStyle]}>
          <RegistrationFlow
            onExit={enrolment.close}
            onEnterLoginDetails={() => setLoginIdOpen(true)}
            onResetLogin={cancelLogin}
            isAuthenticating={isAuthenticating}
            brandColors={brandColors}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    // Fallback shown for the first frame before the Skia canvas paints.
    backgroundColor: '#482fc4',
  },
  // Rounds the sliding registration overlay so it reads as a rounded card over the welcome screen.
  roundedOverlay: {
    borderRadius: layout.radiusScreen,
    overflow: 'hidden',
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
});
