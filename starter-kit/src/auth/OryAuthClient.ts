import type { TokenPair } from '@radarbase/app-kit';
import {
  type OryConfig,
  resolveAuthorizationEndpoint,
  resolveTokenEndpoint,
} from './oryConfig';

/**
 * Minimal abstraction the OAuth client uses to persist the CSRF `state` parameter between
 * the authorize call and the redirect callback. The starter wires this to AsyncStorage at
 * boot via `createOryAuthClient(...)`.
 */
export interface AuthStateStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const STATE_STORE_KEY = 'radar.starter.oauthState';

/**
 * Encapsulates the OAuth 2.0 authorization-code flow against an Ory/Hydra IdP:
 *   1. `buildAuthorizationUrl()` — generate a CSRF state, persist it, return the URL to open in the browser.
 *   2. `exchangeCodeForTokens(code, state)` — verify state, POST the code to the token endpoint, return tokens.
 *
 * Token *persistence* and *refresh* are delegated to the library's `TokenService`; this class only
 * owns the steps that need RADAR-base specific knowledge (client id, scopes, audience, redirect URI).
 *
 * The class is intentionally side-effect free outside of `stateStore` and `fetch`; it can be unit-tested
 * with an in-memory store and a mocked `fetch`.
 */
export class OryAuthClient {
  constructor(
    public readonly config: OryConfig,
    private readonly stateStore: AuthStateStore,
  ) { }

  get baseUrl(): string {
    return this.config.endpoint;
  }

  get tokenEndpoint(): string {
    return resolveTokenEndpoint(this.config);
  }

  async buildAuthorizationUrl(): Promise<string> {
    const state = generateRandomState();
    await this.stateStore.set(STATE_STORE_KEY, state);

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      scope: this.config.scopes,
      audience: this.config.audience,
      redirect_uri: this.config.redirectUri,
      state,
    });

    return `${resolveAuthorizationEndpoint(this.config)}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string, state: string): Promise<TokenPair> {
    if (!code) {
      throw new Error('Authorization code is missing from the OAuth callback.');
    }
    if (!state) {
      throw new Error('State parameter is missing from the OAuth callback.');
    }

    const stored = await this.stateStore.get(STATE_STORE_KEY);
    if (!stored || stored !== state) {
      throw new Error('OAuth state mismatch — possible CSRF attack. Login aborted.');
    }
    await this.stateStore.remove(STATE_STORE_KEY);

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      code,
      redirect_uri: this.config.redirectUri,
    });
    if (this.config.clientSecret) {
      body.append('client_secret', this.config.clientSecret);
    }

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Token exchange failed (${response.status} ${response.statusText}): ${detail || 'no response body'}`,
      );
    }

    const tokens = (await response.json()) as TokenPair;
    if (!tokens.access_token) {
      throw new Error('Token response did not include an access_token.');
    }
    return tokens;
  }
}

export function createOryAuthClient(config: OryConfig, stateStore: AuthStateStore): OryAuthClient {
  return new OryAuthClient(config, stateStore);
}

/**
 * Generates an RFC 6749 compliant `state` value. Strong enough for CSRF protection on a
 * native app; not used as a cryptographic key. Uses Math.random as a portable fallback;
 * if you want hardened entropy, replace with `react-native-get-random-values`.
 */
function generateRandomState(): string {
  const timestamp = Date.now().toString(36);
  let entropy = Math.random().toString(36).slice(2);
  while (entropy.length < 24) entropy += Math.random().toString(36).slice(2);
  return `${timestamp}${entropy}`.slice(0, 40);
}
