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
  endpoint: 'http://radar-hydra:4445',
  scopes: 'SUBJECT.READ SUBJECT.UPDATE PROJECT.READ MEASUREMENT.CREATE offline_access',
  audience: 'res_ManagementPortal res_gateway res_AppServer',
  redirectUri: 'org.radarbase.starter://',
  authPath: '/oauth2/auth',
  tokenPath: '/oauth2/token',
};
