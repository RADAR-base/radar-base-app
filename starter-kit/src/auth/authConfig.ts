/**
 * OAuth 2.0 configuration values for the starter app.
 *
 * This file is intentionally **pure data**. No `fetch`, no AsyncStorage, no React. The OAuth
 * flow lives in the core library's `AuthService`; this separation lets you swap or
 * remote-configure these values (Firebase Remote Config, RADAR app server, env vars) without
 * touching the OAuth flow.
 *
 * Override per study by replacing the values below or by passing a different config
 * via `CoreServiceOverrides.authConfig` at startup.
 */
import type { OAuthConfig } from '@radarbase/app-kit';

export const DEFAULT_AUTH_CONFIG: OAuthConfig = {
  clientId: 'aRMT',
  clientSecret: '',
  endpoint: 'https://dev.radarbasedev.co.uk',
  scopes: 'SUBJECT.READ SUBJECT.UPDATE PROJECT.READ MEASUREMENT.CREATE offline_access',
  audience: 'res_ManagementPortal res_gateway res_AppServer',
  redirectUri: 'com.radarbase.starter://enrol',
  authPath: '/hydra/oauth2/auth',
  tokenPath: '/hydra/oauth2/token',
};
