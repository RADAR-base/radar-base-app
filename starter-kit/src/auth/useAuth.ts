import { useAuthContext, type AuthContextValue, type AuthStatus } from './AuthProvider';

/**
 * Consumer-facing hook. Returns the current auth status + actions (`startLogin`, `logout`,
 * `clearError`). Throws if used outside an `AuthProvider`.
 */
export function useAuth(): AuthContextValue {
  return useAuthContext();
}

export type { AuthContextValue, AuthStatus };
