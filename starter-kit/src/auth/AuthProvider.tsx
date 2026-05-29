import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Linking } from 'react-native';
import { useAuthService, type AuthService } from '@radarbase/app-kit';
import { listenForOAuthCallbacks, type OAuthCallback } from './DeepLinkHandler';
import { OryAuthClient } from './OryAuthClient';

export type AuthStatus = 'unknown' | 'unauthenticated' | 'authenticating' | 'authenticated';

interface AuthState {
  status: AuthStatus;
  error: string | null;
}

interface AuthActions {
  /**
   * Build the IdP authorization URL and hand it off to the system browser. The user returns
   * via the redirect URI; `AuthProvider`'s deep-link listener picks up the callback and
   * completes the flow without any further action from the caller.
   */
  startLogin: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export type AuthContextValue = AuthState & AuthActions;

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  client: OryAuthClient;
  children: React.ReactNode;
}

/**
 * Wires the starter's deep-link → OAuth-code-exchange flow into the library's `AuthService`
 * / `TokenService`. Lives in the React tree above the AppShell, so authentication state
 * survives sign-in transitions without remounting the rest of the app.
 *
 * Must be rendered inside a `CoreServicesProvider` configured with a real `StorageService`
 * (see `createAsyncStorageService`) — otherwise tokens won't persist across cold starts.
 */
export function AuthProvider({ client, children }: AuthProviderProps) {
  const authService = useAuthService();

  const [state, setState] = useState<AuthState>({ status: 'unknown', error: null });
  // Hold the latest services in a ref so the deep-link effect can stay subscribed across
  // re-renders without thrashing the listener.
  const servicesRef = useRef<{ auth: AuthService; client: OryAuthClient }>({
    auth: authService,
    client,
  });
  useEffect(() => {
    servicesRef.current = { auth: authService, client };
  }, [authService, client]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const isAuthenticated = await authService.isAuthenticated();
        if (cancelled) return;
        setState({ status: isAuthenticated ? 'authenticated' : 'unauthenticated', error: null });
      } catch {
        if (cancelled) return;
        setState({ status: 'unauthenticated', error: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authService]);

  useEffect(() => {
    return listenForOAuthCallbacks(async (callback) => {
      await completeOAuthCallback(callback, servicesRef.current, setState);
    });
  }, []);

  const startLogin = useCallback(async () => {
    setState((prev) => ({ status: 'authenticating', error: prev.error }));
    try {
      const url = await client.buildAuthorizationUrl();
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        throw new Error('No browser available to open the authentication URL.');
      }
      await Linking.openURL(url);
    } catch (error) {
      setState({ status: 'unauthenticated', error: errorMessage(error) });
      throw error;
    }
  }, [client]);

  const logout = useCallback(async () => {
    try {
      await authService.reset();
    } finally {
      setState({ status: 'unauthenticated', error: null });
    }
  }, [authService]);

  const clearError = useCallback(() => {
    setState((prev) => ({ status: prev.status, error: null }));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, startLogin, logout, clearError }),
    [state, startLogin, logout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used within an AuthProvider.');
  }
  return ctx;
}

async function completeOAuthCallback(
  callback: OAuthCallback,
  services: { auth: AuthService; client: OryAuthClient },
  setState: React.Dispatch<React.SetStateAction<AuthState>>,
): Promise<void> {
  if (callback.error) {
    setState({
      status: 'unauthenticated',
      error: callback.errorDescription ?? callback.error,
    });
    return;
  }

  setState({ status: 'authenticating', error: null });
  try {
    const tokens = await services.client.exchangeCodeForTokens(callback.code, callback.state);
    if (!tokens.refresh_token) {
      throw new Error('Token response did not include a refresh_token; cannot persist session.');
    }

    await services.auth.completeAuthentication(
      tokens.refresh_token,
      services.client.baseUrl,
      services.client.tokenEndpoint,
    );

    setState({ status: 'authenticated', error: null });
  } catch (error) {
    setState({ status: 'unauthenticated', error: errorMessage(error) });
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Authentication failed.';
}
