import React, { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
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
  useScheduleService,
  type CoreServiceOverrides,
  type ThemeManifest,
  type ProtocolConfig,
} from '@radarbase/app-kit';

import { createAsyncStorageService, LoginScreen } from './src';
import { DEFAULT_AUTH_CONFIG } from './src/auth';

import appManifest from './config/app-manifest.json';
import homeBlueprint from './config/views/home.json';
import profileBlueprint from './config/views/profile.json';
import inboxHistoryBlueprint from './config/views/secondary/inbox-history.json';
import questionnaireBlueprint from './config/views/secondary/questionnaire.json';
import comingSoonBlueprint from './config/views/coming-soon.json';

import CustomDemoNode from './CustomDemoNode';
import protocolConfig from './config/protocol.json';

const BUNDLED_BLUEPRINTS: Record<string, unknown> = {
  'views/home.json': homeBlueprint,
  'views/profile.json': profileBlueprint,
  'views/coming-soon.json': comingSoonBlueprint,
  'views/secondary/inbox-history.json': inboxHistoryBlueprint,
  'views/secondary/questionnaire.json': questionnaireBlueprint,
};

NodeRegistry.getInstance().register('CustomDemoNode', CustomDemoNode);

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

function useScheduleInit() {
  const schedule = useScheduleService();
  useEffect(() => {
    (async () => {
      await schedule.init();
      await schedule.loadProtocol(protocolConfig as ProtocolConfig);
    })();
    return () => schedule.destroy();
  }, [schedule]);
}

function AppRoot({ serviceOverrides }: { serviceOverrides: CoreServiceOverrides }) {
  const { status } = useAuth();
  useFirebaseBootstrap();
  useScheduleInit();

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
});
