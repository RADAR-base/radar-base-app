import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import {
  getColorTokens,
  layout,
  mix,
  resolveBackground,
  type ThemeColorOverrides,
  type ThemeMode,
} from '../../theme/theme';
import { useAuth } from '../../core/useAuth';
import { useSlideOverlay } from './useSlideOverlay';

import { GradientMeshBackground } from './GradientMeshBackground';
import { StudyNameModal } from './StudyNameModal';
import { WelcomeCard } from './WelcomeCard';
import { RegistrationFlow } from './RegistrationFlow';

export interface LoginScreenProps {
  /** Brand color overrides driving the gradient mesh and all themed elements. */
  brandColors?: ThemeColorOverrides;
  /** Study/app name for the welcome card. Sourced from the manifest's `appName`. */
  appName?: string;
  /** Description copy for the welcome card. Sourced from the manifest's `description`. */
  description?: string;
  /** Whether to show the sign-up action on the welcome card. Defaults to `true`. */
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

  // The gradient mesh is brand-derived. In light mode it uses the brand colors directly; in dark mode
  // it uses the *same* darkened brand the rest of the app uses (via getColorTokens / resolveBackground),
  // so the welcome screen isn't a bright peach panel against the near-black dark app.
  const deviceScheme = useColorScheme();
  const mode: ThemeMode = deviceScheme === 'dark' ? 'dark' : 'light';
  const dark = mode === 'dark';
  const brand = brandColors?.brand;
  const accent = brandColors?.accent;
  const background = brandColors?.background;
  const themeObj = { brandColors } as { brandColors?: ThemeColorOverrides };
  const meshPrimary = dark ? getColorTokens('dark', brandColors).header.headerBackground : brand;
  const meshSecondary = dark && accent ? mix(accent, '#000000', 0.8) : accent;
  const meshTertiary = dark ? resolveBackground(themeObj, 'dark') : background;
  const meshFallback = dark ? resolveBackground(themeObj, 'dark') : '#482fc4';

  const onPressLogin = async () => {
    if (error) clearError();
    try {
      await startLogin();
    } catch {
      // useAuth already mirrors the error into state via EventBus; nothing more to do here.
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: meshFallback }]}>
      <Animated.View style={[StyleSheet.absoluteFill, enrolment.baseStyle]}>
        <GradientMeshBackground
          mode={mode}
          primaryColor={meshPrimary}
          secondaryColor={meshSecondary}
          tertiaryColor={meshTertiary}
          frosted
          frostTint={dark ? 'rgba(0, 0, 0, 0.28)' : undefined}
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

      <StudyNameModal
        visible={loginIdOpen}
        onClose={() => setLoginIdOpen(false)}
        onSubmit={() => {
          setLoginIdOpen(false);
          void onPressLogin();
        }}
        title="Enter Study ID"
        description={`We'll take you to the right login portal, where you can sign in with your email and password.`}
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
    backgroundColor: '#482fc4',
  },
  roundedOverlay: {
    borderRadius: layout.radiusScreen,
    overflow: 'hidden',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
});
