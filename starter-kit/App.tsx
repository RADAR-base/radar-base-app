import React, { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import firebase from '@react-native-firebase/app';

import {
  CoreServicesProvider,
  NodeRegistry,
  SDUIShell,
  createBundledBlueprintSource,
  eventBus,
  useAuth,
  type CoreServiceOverrides,
  type ThemeManifest,
} from '@radarbase/app-kit';

import { createAsyncStorageService, LoginScreen } from './src';
import { DEFAULT_AUTH_CONFIG } from './src/auth';

import appManifest from './config/app-manifest.json';
import homeBlueprint from './config/views/home.json';
import insightsBlueprint from './config/views/insights.json';
import inboxHistoryBlueprint from './config/views/secondary/inbox-history.json';
import questionnaireBlueprint from './config/views/secondary/questionnaire.json';

import CustomDemoNode from './CustomDemoNode';

const BUNDLED_BLUEPRINTS: Record<string, unknown> = {
  'views/home.json': homeBlueprint,
  'views/insights.json': insightsBlueprint,
  'views/secondary/inbox-history.json': inboxHistoryBlueprint,
  'views/secondary/questionnaire.json': questionnaireBlueprint,
};

NodeRegistry.getInstance().register('CustomDemoNode', CustomDemoNode);

const ON_PRIMARY = '#FFFFFF';

export default function App() {
  const serviceOverrides = useMemo<CoreServiceOverrides>(() => {
    const storage = createAsyncStorageService();
    return {
      storage,
      authConfig: DEFAULT_AUTH_CONFIG,
    };
  }, []);

  return (
    <CoreServicesProvider overrides={serviceOverrides}>
      <AppRoot serviceOverrides={serviceOverrides} />
    </CoreServicesProvider>
  );
}

function AppRoot({ serviceOverrides }: { serviceOverrides: CoreServiceOverrides }) {
  const { status, logout } = useAuth();
  useFirebaseBootstrap();

  const theme = appManifest.theme as ThemeManifest;
  const primary = theme.primaryColor;
  const background = theme.backgroundColor ?? '#f8f9fa';
  const textSecondary = theme.textSecondaryColor ?? '#6D6D80';

  if (status === 'unknown') {
    return (
      <FullScreenStatus
        background={background}
        primary={primary}
        text={textSecondary}
        message="Preparing your session..."
      />
    );
  }

  if (status === 'unauthenticated' || status === 'authenticating') {
    return <LoginScreen theme={theme} />;
  }

  return (
    <View style={styles.shellWrapper}>
      <SDUIShell
        manifestSource={async () => appManifest}
        blueprintSource={createBundledBlueprintSource(BUNDLED_BLUEPRINTS)}
        serviceOverrides={serviceOverrides}
        eventBus={{ emit: (event, data) => eventBus.emit(event, data) }}
      />
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={logout}
        style={[styles.logoutPill, { backgroundColor: primary }]}
      >
        <Text style={styles.logoutPillLabel}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

function useFirebaseBootstrap() {
  useEffect(() => {
    try {
      firebase.app();
    } catch {
      // Drop your google-services.json / GoogleService-Info.plist into the native projects,
      // or call firebase.initializeApp({...}) here with your own configuration.
    }
  }, []);
}

function FullScreenStatus({
  background,
  primary,
  text,
  message,
}: {
  background: string;
  primary: string;
  text: string;
  message: string;
}) {
  return (
    <SafeAreaView style={[styles.fullScreen, { backgroundColor: background }]}>
      <ActivityIndicator size="large" color={primary} />
      <Text style={[styles.fullScreenText, { color: text }]}>{message}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shellWrapper: {
    flex: 1,
  },
  fullScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  fullScreenText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  logoutPill: {
    position: 'absolute',
    top: 56,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    opacity: 0.85,
  },
  logoutPillLabel: {
    color: ON_PRIMARY,
    fontSize: 12,
    fontWeight: '600',
  },
});
