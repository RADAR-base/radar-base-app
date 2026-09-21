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

export interface ServicesLifecycleCallbacks {
  onReady: () => void;
  onNotReady: () => void;
  onSigningOut: (active: boolean) => void;
}

export function useServicesLifecycle(
  services: ServiceBag,
  { onReady, onNotReady, onSigningOut }: ServicesLifecycleCallbacks,
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
      onReady();
      return;
    }

    initedRef.current = true;

    // Wait for the eager config init, then bootstrap auth-dependent services.
    await eagerPromiseRef.current;
    await Promise.all([
      services.appServer.init().catch(() => {}),
      services.schedule.init()
        .then(() => services.schedule.fetchSchedule())
        .catch(() => {}),
      services.notifications.init().catch(() => {}),
    ]);

    onReady();
  }, [auth, services, onReady]);

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
