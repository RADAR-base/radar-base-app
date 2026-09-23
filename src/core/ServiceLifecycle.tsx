/**
 * React-side lifecycle management for core services.
 *
 * Services own their lifecycle; this hook orchestrates them in a fixed,
 * known order. `config.init()` is kicked off eagerly (before auth) since it
 * internally bootstraps analytics, cache, and remote config. Everything
 * else waits for authentication.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { ServiceBag } from './ServiceContainer';

/** Maximum time (ms) to wait for services before proceeding anyway. */
const INIT_TIMEOUT_MS = 20_000;

export interface ServicesLifecycleCallbacks {
  onReady: () => void;
  onNotReady: () => void;
  onSigningOut: (active: boolean) => void;
  onInitError?: (message: string) => void;
}

export function useServicesLifecycle(
  services: ServiceBag,
  { onReady, onNotReady, onSigningOut, onInitError }: ServicesLifecycleCallbacks,
): void {
  const { auth, eventBus } = services;
  const initedRef = useRef(false);

  // Eagerly kick off config.init() on mount so remote config, analytics,
  // and cache start loading before the user authenticates.
  const eagerPromiseRef = useRef<Promise<void> | null>(null);
  useEffect(() => {
    if (!eagerPromiseRef.current) {
      eagerPromiseRef.current = services.config.init().catch(() => {});
    }
  }, [services]);

  // ---- Full initialisation (runs on mount + on fresh auth) ----

  const initServices = useCallback(async () => {
    if (initedRef.current) return;

    const isAuth = await auth.isAuthenticated();
    if (!isAuth) {
      // Don't call onReady() here — the boot loading screen already dismisses
      // for unauthenticated users via `status === 'unauthenticated'`. Calling
      // onReady() set servicesReady=true, which raced with the auth handler's
      // onNotReady() and caused the post-enrolment loading screen to dismiss
      // before services had finished bootstrapping.
      return;
    }

    initedRef.current = true;

    // Race the actual init against a timeout so the user is never stuck on a
    // loading screen indefinitely if a service hangs or the network is down.
    const doInit = async () => {
      await eagerPromiseRef.current;

      // AppServer must register the subject BEFORE the schedule can fetch
      // protocol and tasks — otherwise every request 404s and data loads empty.
      await services.appServer.init().catch(() => {});
      await Promise.all([
        services.schedule.init()
          .then(() => services.schedule.fetchSchedule())
          .catch(() => {}),
        services.notifications.init().catch(() => {}),
      ]);
    };

    const timeout = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), INIT_TIMEOUT_MS),
    );

    const result = await Promise.race([
      doInit().then(() => 'ok' as const),
      timeout,
    ]);

    if (result === 'timeout') {
      onInitError?.('Some services could not be reached. Data may be incomplete.');
    }

    onReady();
  }, [auth, services, onReady, onInitError]);

  // ---- Mount + auth state transitions ----

  useEffect(() => {
    initServices().catch(() => {
      onReady(); // Never leave the user stuck on a loading screen.
    });

    const handler = (data: { status: string }) => {
      if (data.status === 'authenticated' && !initedRef.current) {
        // Fresh login — show loading screen while services bootstrap.
        onNotReady();
        initServices().catch(() => { onReady(); });
      } else if (data.status === 'unauthenticated' && initedRef.current) {
        // Sign-out — show loading while tearing down all user-scoped state.
        // Tokens are already cleared by AuthService.reset() before this fires.
        onSigningOut(true);
        initedRef.current = false;
        eagerPromiseRef.current = null;

        // Sync teardown
        services.schedule.destroy();
        services.config.reset();

        // Async cleanup (all in parallel)
        Promise.all([
          Promise.resolve(services.kafka.clear()).catch(() => {}),
          Promise.resolve(services.questionnaireData.clear()).catch(() => {}),
          Promise.resolve(services.cache.clear()).catch(() => {}),
        ]).finally(() => {
          onSigningOut(false);
          onNotReady();
        });
      }
    };

    eventBus.on('auth.state_changed', handler);
    return () => {
      eventBus.off('auth.state_changed', handler);
      services.schedule.destroy();
    };
  }, [initServices, services, eventBus, onReady, onNotReady, onSigningOut]);
}
