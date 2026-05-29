import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ThemeManifest } from '@radarbase/app-kit';
import { useAuth } from '../auth';

export interface LoginScreenProps {
  /** Theme tokens from the loaded manifest's `theme` block. Drives all colors on this screen. */
  theme: ThemeManifest;
  /** Optional welcome heading. Defaults to "Welcome". */
  title?: string;
  /** Optional subtitle copy under the heading. */
  subtitle?: string;
  /** Optional call-to-action label on the primary button. Defaults to "Sign in". */
  ctaLabel?: string;
}

export function LoginScreen({
  theme,
  title = 'Welcome',
  subtitle = 'Sign in to access your study dashboard.',
  ctaLabel = 'Sign in',
}: LoginScreenProps) {
  const { status, error, startLogin, clearError } = useAuth();
  const isAuthenticating = status === 'authenticating';

  const onPressLogin = async () => {
    if (error) clearError();
    try {
      await startLogin();
    } catch {
      // `AuthProvider` already mirrors the error into state; nothing more to do here.
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.backgroundColor ?? '#FFFFFF' }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.contentWrapper}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.textColor ?? '#000' }]}>{title}</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondaryColor ?? '#6D6D80' }]}>
                {subtitle}
              </Text>
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
                <Text style={[styles.helperText, { color: theme.textSecondaryColor ?? '#6D6D80' }]}>
                  Complete sign-in in your browser, then return to the app.
                </Text>
              )}

              {error && (
                <View style={[styles.errorBanner, { borderColor: theme.primaryColor }]}>
                  <Text
                    style={[styles.errorText, { color: theme.textColor ?? '#000' }]}
                    numberOfLines={4}
                  >
                    {error}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Single hardcoded color in this file: foreground text rendered on top of `theme.primaryColor`.
 * The manifest theme doesn't expose a `textOnPrimary` token; white reads safely on the
 * conventional darker/saturated primary colors apps choose. Override locally if you set a
 * light primary.
 */
const ON_PRIMARY = '#FFFFFF';

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
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
