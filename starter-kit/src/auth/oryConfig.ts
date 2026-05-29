/**
 * Ory OAuth 2.0 configuration values for the starter.
 *
 * This file is intentionally **pure data**. No `fetch`, no AsyncStorage, no React. Behaviour
 * lives in `OryAuthClient`; that separation lets you swap or remote-configure these values
 * (Firebase Remote Config, RADAR app server, env vars) without touching the OAuth flow.
 *
 * Override per study by replacing the values below or by passing a different `OryConfig`
 * object into `createOryAuthClient(...)` at startup.
 */
export interface OryConfig {
  /** OAuth client id registered with the Ory/Hydra instance. */
  clientId: string;
  /** Optional client secret. Empty for public/native clients (the typical case). */
  clientSecret?: string;
  /** Base URL of the identity provider (no trailing slash). */
  endpoint: string;
  /** Space-separated OAuth scopes. */
  scopes: string;
  /** OAuth audience(s) — RADAR-base specific. */
  audience: string;
  /** Redirect URI registered with the IdP. Must match the app's deep-link scheme. */
  redirectUri: string;
  /** Path on `endpoint` for the authorization endpoint. */
  authPath: string;
  /** Path on `endpoint` for the token endpoint. */
  tokenPath: string;
}

export const DEFAULT_ORY_CONFIG: OryConfig = {
  clientId: 'aRMT',
  clientSecret: '',
  endpoint: 'https://dev.radarbasedev.co.uk',
  scopes: 'SUBJECT.READ SUBJECT.UPDATE PROJECT.READ MEASUREMENT.CREATE offline_access',
  audience: 'res_ManagementPortal res_gateway res_AppServer',
  redirectUri: 'com.onsentia.starter-app://',
  authPath: '/hydra/oauth2/auth',
  tokenPath: '/hydra/oauth2/token',
};

export function resolveTokenEndpoint(cfg: OryConfig): string {
  return `${cfg.endpoint}${cfg.tokenPath}`;
}

export function resolveAuthorizationEndpoint(cfg: OryConfig): string {
  return `${cfg.endpoint}${cfg.authPath}`;
}
