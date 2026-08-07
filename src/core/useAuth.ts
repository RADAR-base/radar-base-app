import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { useAuthService, useEventBus } from './CoreServicesContext';
import { EVENTS } from './EventBus';
import type { AuthStatus } from '../types';

export interface UseAuthResult {
  status: AuthStatus;
  error: string | null;
  startLogin: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  /**
   * Cancel an in-progress login: if the status is `authenticating` (e.g. the user opened the
   * OAuth browser but returned without finishing), reset it to `unauthenticated` and clear any
   * error. UI-only — it doesn't touch stored tokens, so a real callback that still arrives later
   * will re-drive the status via the EventBus.
   */
  cancelLogin: () => void;
}

export function useAuth(): UseAuthResult {
  const auth = useAuthService();
  const bus = useEventBus();
  const [status, setStatus] = useState<AuthStatus>('unknown');
  const [error, setError] = useState<string | null>(null);

  // Check initial auth state + subscribe to changes via EventBus
  useEffect(() => {
    auth.isAuthenticated().then(isAuth => {
      setStatus(isAuth ? 'authenticated' : 'unauthenticated');
    }).catch(() => setStatus('unauthenticated'));

    const handler = (data: { status: AuthStatus; error?: string | null }) => {
      setStatus(data.status);
      setError(data.error ?? null);
    };
    bus.on(EVENTS.AUTH_STATE_CHANGED, handler);
    return () => bus.off(EVENTS.AUTH_STATE_CHANGED, handler);
  }, [auth, bus]);

  // Listen for OAuth deep-link callbacks
  useEffect(() => {
    const handle = (event: { url: string }) => {
      const cb = parseOAuthCallback(event.url);
      if (!cb) return;
      if (cb.error) {
        setStatus('unauthenticated');
        setError(cb.errorDescription ?? cb.error);
        return;
      }
      auth.handleAuthCallback(cb.code, cb.state).catch(() => {
        // Error state is already emitted by handleAuthCallback via EventBus
      });
    };

    const sub = Linking.addEventListener('url', handle);
    Linking.getInitialURL()
      .then(url => { if (url) handle({ url }); })
      .catch(() => { });

    return () => sub.remove();
  }, [auth]);

  const startLogin = useCallback(async () => {
    setStatus('authenticating');
    setError(null);
    try {
      const url = await auth.getAuthorizationUrl();
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) throw new Error('No browser available to open the authentication URL.');
      await Linking.openURL(url);
    } catch (err) {
      setStatus('unauthenticated');
      setError(err instanceof Error ? err.message : 'Failed to start login.');
    }
  }, [auth]);

  const logout = useCallback(async () => {
    try {
      await auth.reset();
    } finally {
      setStatus('unauthenticated');
      setError(null);
    }
  }, [auth]);

  const clearError = useCallback(() => setError(null), []);

  const cancelLogin = useCallback(() => {
    setStatus((prev) => (prev === 'authenticating' ? 'unauthenticated' : prev));
    setError(null);
  }, []);

  return { status, error, startLogin, logout, clearError, cancelLogin };
}

function parseOAuthCallback(rawUrl: string): {
  code: string;
  state: string;
  error?: string;
  errorDescription?: string;
} | null {
  if (!rawUrl.includes('code=') && !rawUrl.includes('error=')) return null;
  try {
    const url = new URL(rawUrl);
    const p = url.searchParams;
    return {
      code: p.get('code') ?? '',
      state: p.get('state') ?? '',
      error: p.get('error') ?? undefined,
      errorDescription: p.get('error_description') ?? undefined,
    };
  } catch {
    return {
      code: '',
      state: '',
      error: 'invalid_callback',
      errorDescription: `Failed to parse OAuth callback URL: ${rawUrl}`,
    };
  }
}
