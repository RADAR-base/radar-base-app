import React, { useEffect, useMemo } from 'react';
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
  AppShell,
  getColorTokens,
  layout,
  createAsyncStorageService,
  type ThemeColorOverrides,
} from '@radarbase/app-kit';

import appConfig from './config';
import CustomDemoNode from './CustomDemoNode';

const PLUGINS = { CustomDemoNode };

export default function App() {
  const storage = useMemo(() => createAsyncStorageService(), []);

  useFirebaseBootstrap();

  const [fontsLoaded] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const scheme = useColorScheme();
  const bootBackground = getColorTokens(
    scheme === 'dark' ? 'dark' : 'light',
    (appConfig.theme as Record<string, unknown>)?.brandColors as ThemeColorOverrides,
  ).background.primary;
  if (!fontsLoaded) return <View style={[styles.root, { backgroundColor: bootBackground }]} />;

  return (
    <SafeAreaProvider>
      <View style={styles.appBackdrop}>
        <View style={styles.screenFrame}>
          <AppShell
            manifest={appConfig}
            storage={storage}
            plugins={PLUGINS}
          />
        </View>
      </View>
    </SafeAreaProvider>
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
  appBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  screenFrame: {
    flex: 1,
    borderRadius: layout.radiusScreen,
    overflow: 'hidden',
  },
});
