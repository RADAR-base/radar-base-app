import {
  TokenService,
  TokenPair,
  StorageService,
  LoggerService,
  EventBus,
  OAuthClientCredentials,
} from '../types';
import { EVENTS } from './EventBus';

const EXPIRY_BUFFER_MS = 1_800_000; // refresh 30m before actual expiry
const REFRESH_RETRY_DELAY_MS = 1_000;
const MAX_REFRESH_ATTEMPTS = 2;

export class DefaultTokenService implements TokenService {
  private readonly TOKEN_STORE = {
    ACCESS_TOKEN: 'ACCESS_TOKEN',
    REFRESH_TOKEN: 'REFRESH_TOKEN',
    EXPIRES_AT: 'EXPIRES_AT',
    TOKEN_ENDPOINT: 'TOKEN_ENDPOINT',
    CLIENT_ID: 'OAUTH_CLIENT_ID',
    CLIENT_SECRET: 'OAUTH_CLIENT_SECRET',
  };

  private tokenEndpoint: string = '';
  private clientId: string | null = null;
  private clientSecret: string | undefined;
  private expiresAt: number | null = null;
  private isRefreshing = false;
  private refreshPromise: Promise<TokenPair> | null = null;

  constructor(
    private readonly storage: StorageService,
    private readonly logger: LoggerService,
    private readonly bus: EventBus,
    initialClient?: OAuthClientCredentials,
  ) {
    if (initialClient?.clientId) {
      this.applyClientCredentials(initialClient);
    }
  }

  async refresh(): Promise<TokenPair> {
    // Prevent multiple simultaneous refresh attempts
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = this.performRefreshWithRetry();

    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  private async performRefreshWithRetry(): Promise<TokenPair> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_REFRESH_ATTEMPTS; attempt++) {
      try {
        return await this.performRefresh();
      } catch (error: any) {
        lastError = error;
        // Don't retry on 4xx (auth errors — token revoked, invalid grant, etc.)
        const status = error?.status;
        if (typeof status === 'number' && status >= 400 && status < 500) {
          break;
        }
        if (attempt < MAX_REFRESH_ATTEMPTS - 1) {
          this.logger.log(`[TokenService] refresh attempt ${attempt + 1} failed, retrying...`);
          await new Promise(r => setTimeout(r, REFRESH_RETRY_DELAY_MS));
        }
      }
    }
    throw lastError;
  }

  private async performRefresh(): Promise<TokenPair> {
    const refreshToken = await this.storage.get<string>(this.TOKEN_STORE.REFRESH_TOKEN);
    if (!refreshToken) {
      const access = await this.storage.get<string>(this.TOKEN_STORE.ACCESS_TOKEN);
      this.logger.error(
        `[TokenService] refresh aborted — no refresh token in storage ` +
        `(access=${tokenPresence(access)}, refresh=missing, ` +
        `endpointConfigured=${!!(this.tokenEndpoint || (await this.storage.get(this.TOKEN_STORE.TOKEN_ENDPOINT)))})`,
      );
      throw new Error('No refresh token available');
    }

    const { clientId, clientSecret } = await this.resolveClientCredentials();
    if (!clientId) {
      throw new Error(
        'OAuth client_id is not configured. Call configureOAuthClient() before refresh.',
      );
    }

    const endpoint = await this.getTokenEndpoint();

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    });
    if (clientSecret) {
      body.append('client_secret', clientSecret);
    }

    this.logger.log(
      `[TokenService] refreshing — client_id=${clientId} hasSecret=${!!clientSecret} ` +
      `refresh=${tokenPresence(refreshToken)} endpoint=${endpoint}`,
    );

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const error: any = new Error(
        `Token refresh failed: ${response.status} ${response.statusText}` +
        (detail ? ` — ${detail}` : ''),
      );
      error.status = response.status;

      // 401/403 means the refresh token is revoked or invalid — emit unauthenticated
      if (response.status === 401 || response.status === 403) {
        this.logger.log('[TokenService] refresh token rejected, emitting unauthenticated');
        this.bus.emit(EVENTS.AUTH_STATE_CHANGED, {
          status: 'unauthenticated',
          error: 'Session expired. Please log in again.',
        });
      }

      throw error;
    }

    const tokens: TokenPair = await response.json();

    // Store tokens + compute expiry
    await this.storage.set(this.TOKEN_STORE.ACCESS_TOKEN, tokens.access_token);
    if (tokens.refresh_token) {
      await this.storage.set(this.TOKEN_STORE.REFRESH_TOKEN, tokens.refresh_token);
    }
    if (tokens.expires_in) {
      this.expiresAt = Date.now() + tokens.expires_in * 1000;
      await this.storage.set(this.TOKEN_STORE.EXPIRES_AT, this.expiresAt);
    }

    this.logger.log(
      `[TokenService] refresh ok — access=${tokenPresence(tokens.access_token)} ` +
      `refreshRotated=${tokenPresence(tokens.refresh_token)} ` +
      `expiresIn=${tokens.expires_in ?? 'unknown'}s`,
    );
    return tokens;
  }

  async register(refreshParams: { refresh_token: string; access_token?: string; expires_in?: number }): Promise<void> {
    this.logger.log(
      `[TokenService] register — writing refresh=${tokenPresence(refreshParams.refresh_token)} ` +
      `access=${tokenPresence(refreshParams.access_token)}`,
    );
    await this.storage.set(this.TOKEN_STORE.REFRESH_TOKEN, refreshParams.refresh_token);
    if (refreshParams.access_token) {
      await this.storage.set(this.TOKEN_STORE.ACCESS_TOKEN, refreshParams.access_token);
    }
    if (refreshParams.expires_in) {
      this.expiresAt = Date.now() + refreshParams.expires_in * 1000;
      await this.storage.set(this.TOKEN_STORE.EXPIRES_AT, this.expiresAt);
    }

    // Read-back to catch storage adapter / key issues during enrolment.
    const [storedRefresh, storedAccess] = await Promise.all([
      this.storage.get<string>(this.TOKEN_STORE.REFRESH_TOKEN),
      this.storage.get<string>(this.TOKEN_STORE.ACCESS_TOKEN),
    ]);
    this.logger.log(
      `[TokenService] register read-back — refresh=${tokenPresence(storedRefresh)} ` +
      `access=${tokenPresence(storedAccess)} ` +
      `refreshMatch=${storedRefresh === refreshParams.refresh_token} ` +
      `accessMatch=${!refreshParams.access_token || storedAccess === refreshParams.access_token}`,
    );
  }

  async configureOAuthClient(credentials: OAuthClientCredentials): Promise<void> {
    this.applyClientCredentials(credentials);
    await Promise.all([
      this.storage.set(this.TOKEN_STORE.CLIENT_ID, this.clientId),
      this.storage.set(this.TOKEN_STORE.CLIENT_SECRET, this.clientSecret ?? null),
    ]);
  }

  getRefreshParams(refreshToken: string): { refresh_token: string } {
    return { refresh_token: refreshToken };
  }

  async setTokenEndpoint(endpoint: string): Promise<void> {
    await this.storage.set(this.TOKEN_STORE.TOKEN_ENDPOINT, endpoint);
    this.tokenEndpoint = endpoint;
  }

  async getTokenEndpoint(): Promise<string> {
    if (this.tokenEndpoint) {
      return this.tokenEndpoint;
    }

    const endpoint = await this.storage.get<string>(this.TOKEN_STORE.TOKEN_ENDPOINT);
    if (!endpoint) {
      throw new Error('Token endpoint not configured');
    }

    this.tokenEndpoint = endpoint;
    return endpoint;
  }

  async getAccessToken(): Promise<string | null> {
    const accessToken = await this.storage.get<string>(this.TOKEN_STORE.ACCESS_TOKEN);
    if (!accessToken) return null;

    if (await this.isTokenExpired()) {
      try {
        const tokens = await this.refresh();
        return tokens.access_token;
      } catch {
        return null;
      }
    }

    return accessToken;
  }

  async clearTokens(): Promise<void> {
    await Promise.all([
      this.storage.set(this.TOKEN_STORE.ACCESS_TOKEN, null),
      this.storage.set(this.TOKEN_STORE.REFRESH_TOKEN, null),
      this.storage.set(this.TOKEN_STORE.EXPIRES_AT, null),
      this.storage.set(this.TOKEN_STORE.TOKEN_ENDPOINT, null),
    ]);
    this.tokenEndpoint = '';
    this.expiresAt = null;
    // Keep OAuth client credentials — they identify the app, not the session.
    // Base URL is cleared by AuthService.reset() via ConfigService.
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async isTokenExpired(): Promise<boolean> {
    if (this.expiresAt) {
      return Date.now() >= this.expiresAt - EXPIRY_BUFFER_MS;
    }
    const stored = await this.storage.get<number>(this.TOKEN_STORE.EXPIRES_AT);
    if (stored) {
      this.expiresAt = stored;
      return Date.now() >= stored - EXPIRY_BUFFER_MS;
    }
    // No expiry info — assume valid (will fail on use if actually expired)
    return false;
  }

  private applyClientCredentials(credentials: OAuthClientCredentials): void {
    this.clientId = credentials.clientId;
    const secret = credentials.clientSecret?.trim();
    this.clientSecret = secret ? secret : undefined;
  }

  private async resolveClientCredentials(): Promise<{
    clientId: string | null;
    clientSecret?: string;
  }> {
    if (this.clientId) {
      return { clientId: this.clientId, clientSecret: this.clientSecret };
    }

    const [storedId, storedSecret] = await Promise.all([
      this.storage.get<string>(this.TOKEN_STORE.CLIENT_ID),
      this.storage.get<string>(this.TOKEN_STORE.CLIENT_SECRET),
    ]);
    if (storedId) {
      this.clientId = storedId;
      this.clientSecret = storedSecret?.trim() ? storedSecret : undefined;
    }
    return { clientId: this.clientId, clientSecret: this.clientSecret };
  }
}

export const tokenServiceFactory = (deps: {
  storage: StorageService;
  logger: LoggerService;
  bus: EventBus;
  /** Applied immediately so cold-start refresh has client_id before the first API call. */
  oauthClient?: OAuthClientCredentials;
}) => {
  const service = new DefaultTokenService(deps.storage, deps.logger, deps.bus, deps.oauthClient);
  if (deps.oauthClient?.clientId) {
    // Persist so refresh still works if authConfig is omitted on a later boot.
    void service.configureOAuthClient(deps.oauthClient);
  }
  return service;
};

/** Safe token summary for logs — presence + length only. */
function tokenPresence(value: unknown): string {
  if (value == null) return 'missing';
  if (typeof value !== 'string') return `non-string(${typeof value})`;
  if (!value) return 'empty';
  return `present(len=${value.length})`;
}
