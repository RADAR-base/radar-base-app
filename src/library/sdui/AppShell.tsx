import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { eventBus } from '../../core/EventBus';
import { useAuth } from '../../core/useAuth';
import {
  CoreServicesProvider,
  useServicesReady,
  useSigningOut,
  useSubjectConfigService,
  type CoreServiceOverrides,
} from '../../core/CoreServicesContext';
import type { BlueprintSource } from './BlueprintLoader';
import { createBundledBlueprintSource, createRemoteBlueprintSource } from './BlueprintLoader';
import { NodeRegistry } from './NodeRegistry';
import { registerBuiltInNodes } from './nodes';
import type { NodeComponent } from './types';
import { SDUIShell } from './SDUIShell';
import { LoginScreen } from './LoginScreen';
import { PostEnrolmentFlow } from './PostEnrolmentFlow';
import { LoadingScreen } from './LoadingScreen';
import type { ThemeColorOverrides } from '../../theme/theme';
import type { StorageService, OAuthConfig } from '../../types';

export interface AppShellProps {
  /**
   * App manifest — a static object (bundled JSON) or an async function for remote fetching.
   * The manifest drives auth config, theme, tabs, and blueprint resolution.
   *
   * Blueprints can be provided in the manifest itself via a `blueprints` field:
   * ```
   * { tabs: [...], blueprints: { "views/home.json": { root: ... } } }
   * ```
   * Or fetched remotely when the manifest includes a `blueprintBaseUrl`.
   */
  manifest: Record<string, unknown> | (() => Promise<Record<string, unknown>>);
  /** Persistent storage implementation (e.g. `createAsyncStorageService()`). */
  storage: StorageService;
  /** Custom node components keyed by type name. Auto-registered with NodeRegistry. */
  plugins?: Record<string, NodeComponent>;
  /** Additional service overrides (logger, remoteConfig, etc). */
  serviceOverrides?: CoreServiceOverrides;
}

/**
 * Top-level app component. Handles manifest loading (local or remote), auth routing
 * (login → post-enrolment → SDUI shell), blueprint resolution, plugin registration,
 * and boot loading screen. This is the only component a host app needs inside `SafeAreaProvider`.
 */
export function AppShell({
  manifest: manifestProp,
  storage,
  plugins,
  serviceOverrides,
}: AppShellProps) {
  // Resolve manifest (sync for objects, async for remote fetchers)
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(
    typeof manifestProp === 'function' ? null : manifestProp,
  );
  const [manifestError, setManifestError] = useState<string | null>(null);
  useEffect(() => {
    if (typeof manifestProp !== 'function') {
      setManifest(manifestProp);
      return;
    }
    let cancelled = false;
    manifestProp()
      .then((m) => { if (!cancelled) setManifest(m); })
      .catch((err) => { if (!cancelled) setManifestError(String(err)); });
    return () => { cancelled = true; };
  }, [manifestProp]);

  // Register built-in + custom nodes with NodeRegistry.
  useMemo(() => {
    registerBuiltInNodes();
    if (plugins) {
      const registry = NodeRegistry.getInstance();
      for (const [type, component] of Object.entries(plugins)) {
        registry.register(type, component);
      }
    }
  }, [plugins]);

  // Unregister custom plugins on unmount / plugins change
  useEffect(() => {
    if (!plugins) return;
    return () => {
      const registry = NodeRegistry.getInstance();
      for (const type of Object.keys(plugins)) {
        registry.unregister(type);
      }
    };
  }, [plugins]);

  // Show loading screen while manifest is being fetched
  if (!manifest) {
    return <LoadingScreen ready={!!manifestError} />;
  }

  // Derive service overrides — auth config comes from the manifest, storage from the prop
  const mergedOverrides: CoreServiceOverrides = {
    ...serviceOverrides,
    storage,
    authConfig: serviceOverrides?.authConfig ?? (manifest.auth as OAuthConfig | undefined),
  };

  return (
    <CoreServicesProvider overrides={mergedOverrides}>
      <AppShellInner
        manifest={manifest}
        serviceOverrides={mergedOverrides}
      />
    </CoreServicesProvider>
  );
}

function AppShellInner({
  manifest,
  serviceOverrides,
}: {
  manifest: Record<string, unknown>;
  serviceOverrides?: CoreServiceOverrides;
}) {
  const { status, logout } = useAuth();
  const subjectConfig = useSubjectConfigService();
  const servicesReady = useServicesReady();
  const signingOut = useSigningOut();

  const appName = manifest.appName as string | undefined;
  const description = manifest.description as string | undefined;
  const version = manifest.version as string | undefined;
  const themeBlock = manifest.theme as Record<string, unknown> | undefined;
  const theme = (themeBlock?.brandColors as ThemeColorOverrides | undefined) ?? themeBlock as ThemeColorOverrides | undefined;
  const enrolmentBlock = manifest.enrolment as Record<string, unknown> | undefined;
  const loginBlock = manifest.login as Record<string, unknown> | undefined;
  const showSignUp = loginBlock?.showSignUp !== false;
  const blueprintBaseUrl = manifest.blueprintBaseUrl as string | undefined;
  const inlineBlueprints = manifest.blueprints as Record<string, unknown> | undefined;

  // Build blueprint source from manifest:
  // 1. manifest.blueprints — inline bundled blueprints keyed by viewPath
  // 2. manifest.blueprintBaseUrl — remote fetch with inline as fallback
  const blueprintSource = useMemo<BlueprintSource>(() => {
    const bundled = inlineBlueprints ? createBundledBlueprintSource(inlineBlueprints) : undefined;
    if (blueprintBaseUrl) {
      return createRemoteBlueprintSource(blueprintBaseUrl, bundled);
    }
    if (bundled) return bundled;
    return async (viewPath) => {
      throw new Error(
        `No blueprint source for "${viewPath}". Add a "blueprints" map or "blueprintBaseUrl" to the manifest.`,
      );
    };
  }, [inlineBlueprints, blueprintBaseUrl]);

  // Wire settings "Sign out" action to auth reset
  useEffect(() => {
    const handler = () => { logout(); };
    eventBus.on('auth.sign_out', handler);
    return () => eventBus.off('auth.sign_out', handler);
  }, [logout]);

  // Build template context from SubjectConfigService + manifest.
  const [templateContext, setTemplateContext] = useState<Record<string, Record<string, unknown>>>({
    user: { firstName: 'User' },
    app: { version: version ?? '' },
  });
  useEffect(() => {
    if (status !== 'authenticated') return;
    (async () => {
      const [login, project, enrolmentDate] = await Promise.all([
        subjectConfig.getParticipantLogin(),
        subjectConfig.getProjectName(),
        subjectConfig.getEnrolmentDate(),
      ]);
      setTemplateContext({
        user: { firstName: login, login },
        study: {
          name: project,
          enrollmentDate: enrolmentDate
            ? new Date(enrolmentDate).toLocaleDateString()
            : '',
          status: 'Active',
        },
        app: { version: version ?? '' },
      });
    })().catch(() => {});
  }, [status, subjectConfig, version]);

  // After a fresh authentication in THIS session, show the post-enrolment flow before
  // entering the app. Returning users who are already authenticated on launch skip it.
  const [enteredApp, setEnteredApp] = useState(false);
  // Always show a loading screen after the post-enrolment flow so services
  // (config, protocol, questionnaires, schedule) are guaranteed ready before
  // the home page renders — even if they finished during onboarding.
  const [postEnrolmentLoading, setPostEnrolmentLoading] = useState(false);
  // Keeps the loading screen mounted through its exit animation after sign-out
  // cleanup finishes — without this, the screen unmounts instantly when signingOut
  // flips to false and the user sees a jarring cut to the welcome screen.
  const [signOutLoading, setSignOutLoading] = useState(false);
  useEffect(() => {
    if (signingOut) setSignOutLoading(true);
  }, [signingOut]);
  const sawAuthFlow = useRef(false);
  useEffect(() => {
    if (status === 'unauthenticated' || status === 'authenticating') {
      sawAuthFlow.current = true;
      // Reset on sign-out so the next login goes through the full flow with fresh state.
      setEnteredApp(false);
      setPostEnrolmentLoading(false);
      // signOutLoading is NOT reset here — it stays true until LoadingScreen's
      // onHidden fires, ensuring the exit animation completes before LoginScreen.
      setTemplateContext({
        user: { firstName: 'User' },
        app: { version: version ?? '' },
      });
    }
  }, [status, version]);

  // Boot loading overlay
  const [bootLoading, setBootLoading] = useState(true);

  let content: React.ReactNode = null;
  if (signOutLoading) {
    // Sign-out loading — visible while services tear down, then animates off.
    // ready={!signingOut}: becomes ready once cleanup finishes, then LoadingScreen
    // runs its min-duration + exit animation before calling onHidden.
    content = (
      <LoadingScreen
        brandColors={theme}
        ready={!signingOut}
        onHidden={() => setSignOutLoading(false)}
      />
    );
  } else if (status === 'unauthenticated' || status === 'authenticating') {
    content = (
      <LoginScreen brandColors={theme} appName={appName} description={description} showSignUp={showSignUp} />
    );
  } else if (status !== 'unknown') {
    if (sawAuthFlow.current && !enteredApp) {
      content = (
        <PostEnrolmentFlow
          onDone={() => { setEnteredApp(true); setPostEnrolmentLoading(true); }}
          enrolment={enrolmentBlock as any}
          brandColors={theme}
        />
      );
    } else if (!servicesReady || postEnrolmentLoading) {
      // Core services (config, protocol, questionnaires, schedule) are still bootstrapping,
      // or we just finished onboarding and need to confirm everything is ready.
      content = (
        <LoadingScreen
          brandColors={theme}
          ready={servicesReady}
          onHidden={() => setPostEnrolmentLoading(false)}
        />
      );
    } else {
      content = (
        <View style={styles.shellWrapper}>
          <SDUIShell
            manifestSource={async () => manifest}
            blueprintSource={blueprintSource}
            serviceOverrides={serviceOverrides}
            eventBus={{ emit: (event, data) => eventBus.emit(event, data) }}
            templateContext={templateContext}
          />
        </View>
      );
    }
  }

  return (
    <View style={styles.root}>
      {content}
      {bootLoading && (
        <LoadingScreen
          brandColors={theme}
          ready={!signingOut && status !== 'unknown' && (status === 'unauthenticated' || status === 'authenticating' || servicesReady)}
          onHidden={() => setBootLoading(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  shellWrapper: {
    flex: 1,
  },
});
