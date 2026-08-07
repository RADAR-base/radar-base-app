import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import firebase from '@react-native-firebase/app';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import {
  CoreServicesProvider,
  NodeRegistry,
  SDUIShell,
  createBundledBlueprintSource,
  eventBus,
  getColorTokens,
  useAuth,
  useScheduleService,
  LoadingScreen,
  type CoreServiceOverrides,
  type ThemeManifest,
  type ProtocolConfig,
} from '@radarbase/app-kit';

import { createAsyncStorageService, LoginScreen, PostEnrolmentFlow } from './src';
import { DEFAULT_AUTH_CONFIG } from './src/auth';

import appManifest from './config/app-manifest.json';
import homeBlueprint from './config/views/home.json';
import profileBlueprint from './config/views/profile.json';
import inboxHistoryBlueprint from './config/views/secondary/inbox-history.json';
import questionnaireBlueprint from './config/views/secondary/questionnaire.json';
import comingSoonBlueprint from './config/views/coming-soon.json';
import calendarBlueprint from './config/views/calendar.json';

import CustomDemoNode from './CustomDemoNode';
import protocolConfig from './config/protocol.json';

const BUNDLED_BLUEPRINTS: Record<string, unknown> = {
  'views/home.json': homeBlueprint,
  'views/profile.json': profileBlueprint,
  'views/coming-soon.json': comingSoonBlueprint,
  'views/secondary/inbox-history.json': inboxHistoryBlueprint,
  'views/secondary/questionnaire.json': questionnaireBlueprint,
  'views/calendar.json': calendarBlueprint,
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

  // Load Inter (the app's typeface — see the theme's `fontFamily`). Hold rendering until it's ready
  // so text doesn't flash in the system font first.
  const [fontsLoaded] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // While fonts load, paint the loading screen's own background color instead of white — so the
  // reload flows straight into the loader with no white flash between them.
  const scheme = useColorScheme();
  const bootBackground = getColorTokens(
    scheme === 'dark' ? 'dark' : 'light',
    (appManifest.theme as ThemeManifest).brandColors,
  ).background.primary;
  if (!fontsLoaded) return <View style={[styles.root, { backgroundColor: bootBackground }]} />;

  return (
    <SafeAreaProvider>
      <CoreServicesProvider overrides={serviceOverrides}>
        <AppRoot serviceOverrides={serviceOverrides} />
      </CoreServicesProvider>
    </SafeAreaProvider>
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

  // After a fresh authentication in THIS session (i.e. the user came through the login flow), show
  // the post-enrolment flow (complete → enable notifications) before entering the app. Returning
  // users who are already authenticated on launch never pass through unauthenticated/authenticating,
  // so they skip straight in.
  const [enteredApp, setEnteredApp] = useState(false);
  const sawAuthFlow = useRef(false);
  useEffect(() => {
    if (status === 'unauthenticated' || status === 'authenticating') {
      sawAuthFlow.current = true;
    }
  }, [status]);

  const theme = appManifest.theme as ThemeManifest;

  // Boot loading overlay: covers the app until auth status resolves, then slides off to the left to
  // reveal the first screen. Kept mounted (not early-returned) until its `onHidden` fires after the
  // slide, so the exit animates without stranding a touch-blocking remnant — see LoadingScreen.
  const [bootLoading, setBootLoading] = useState(true);

  let content: React.ReactNode = null;
  if (status === 'unauthenticated' || status === 'authenticating') {
    content = (
      <LoginScreen theme={theme} appName={appManifest.appName} description={appManifest.description} />
    );
  } else if (status !== 'unknown') {
    // Authenticated. A fresh in-session enrolment runs the post-enrolment flow before the shell;
    // returning users skip straight in.
    content =
      sawAuthFlow.current && !enteredApp ? (
        <PostEnrolmentFlow onDone={() => setEnteredApp(true)} brandColors={theme.brandColors} />
      ) : (
        <View style={styles.shellWrapper}>
          <SDUIShell
            manifestSource={async () => appManifest}
            blueprintSource={createBundledBlueprintSource(BUNDLED_BLUEPRINTS)}
            serviceOverrides={serviceOverrides}
            eventBus={{ emit: (event, data) => eventBus.emit(event, data) }}
            // TEMPORARY placeholder: `useAuth()` doesn't expose any profile data yet (no
            // firstName/name field), so there's nothing real to source this from. Replace
            // with actual session/profile data once that's available — e.g. decoded from
            // the OAuth access token or a profile-fetch call — for `header.showName` to
            // show a real user rather than this static value.
            templateContext={{ user: { firstName: 'User' } }}
          />
        </View>
      );
  }

  return (
    <View style={styles.root}>
      {content}
      {bootLoading && (
        <LoadingScreen
          brandColors={theme.brandColors}
          ready={status !== 'unknown'}
          onHidden={() => setBootLoading(false)}
        />
      )}
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  shellWrapper: {
    flex: 1,
  },
});
