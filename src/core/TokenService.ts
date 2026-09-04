import {
  TokenService,
  TokenPair,
  StorageService,
  LoggerService,
  OAuthClientCredentials,
} from '../types';

export class DefaultTokenService implements TokenService {
  private readonly TOKEN_STORE = {
    ACCESS_TOKEN: 'ACCESS_TOKEN',
    REFRESH_TOKEN: 'REFRESH_TOKEN',
    REFRESH_TOKEN_TIMEOUT: 'REFRESH_TOKEN_TIMEOUT',
    BASE_URI: 'BASE_URI',
    TOKEN_ENDPOINT: 'TOKEN_ENDPOINT',
    CLIENT_ID: 'OAUTH_CLIENT_ID',
    CLIENT_SECRET: 'OAUTH_CLIENT_SECRET',
  };

  private baseUri: string = '';
  private tokenEndpoint: string = '';
  private clientId: string | null = null;
  private clientSecret: string | undefined;
  private isRefreshing = false;
  private refreshPromise: Promise<TokenPair> | null = null;

  constructor(
    private readonly storage: StorageService,
    private readonly logger: LoggerService,
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
    this.refreshPromise = this.performRefresh();

    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  private async performRefresh(): Promise<TokenPair> {
    try {
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

      // React Native's fetch often drops a raw URLSearchParams body (Ory then returns
      // "The POST body can not be empty"). Stringify explicitly, matching AuthService.
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
        throw new Error(
          `Token refresh failed: ${response.status} ${response.statusText}` +
          (detail ? ` — ${detail}` : ''),
        );
      }

      const tokens: TokenPair = await response.json();

      await this.storage.set(this.TOKEN_STORE.ACCESS_TOKEN, tokens.access_token);
      if (tokens.refresh_token) {
        await this.storage.set(this.TOKEN_STORE.REFRESH_TOKEN, tokens.refresh_token);
      }

      this.logger.log(
        `[TokenService] refresh ok — access=${tokenPresence(tokens.access_token)} ` +
        `refreshRotated=${tokenPresence(tokens.refresh_token)}`,
      );
      return tokens;
    } catch (error) {
      this.logger.error('Token refresh failed', error);
      throw error;
    }
  }

  async register(refreshParams: { refresh_token: string; access_token?: string }): Promise<void> {
    this.logger.log(
      `[TokenService] register — writing refresh=${tokenPresence(refreshParams.refresh_token)} ` +
      `access=${tokenPresence(refreshParams.access_token)}`,
    );
    await this.storage.set(this.TOKEN_STORE.REFRESH_TOKEN, refreshParams.refresh_token);
    if (refreshParams.access_token) {
      await this.storage.set(this.TOKEN_STORE.ACCESS_TOKEN, refreshParams.access_token);
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

  async getURI(): Promise<string> {
    const uri = await this.storage.get<string>(this.TOKEN_STORE.BASE_URI);
    if (!uri) {
      throw new Error('Base URI not set. Please complete authentication first.');
    }
    this.baseUri = uri;
    return uri;
  }

  async setURI(uri: string): Promise<string> {
    if (!uri) {
      throw new Error('Base URI cannot be null or empty');
    }

    // Validate URI format
    try {
      const url = new URL(uri);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Invalid base URI. Please use a valid HTTP/HTTPS URL.');
      }
    } catch (e) {
      throw new Error('Invalid base URI format. Please use a valid URL.');
    }

    // Remove trailing slashes
    let lastSlashIndex = uri.length;
    while (lastSlashIndex > 0 && uri[lastSlashIndex - 1] === '/') {
      lastSlashIndex--;
    }
    const cleanUri = uri.substring(0, lastSlashIndex);

    await this.storage.set(this.TOKEN_STORE.BASE_URI, cleanUri);
    this.baseUri = cleanUri;
    return cleanUri;
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
    return this.storage.get<string>(this.TOKEN_STORE.ACCESS_TOKEN);
  }

  async clearTokens(): Promise<void> {
    await Promise.all([
      this.storage.set(this.TOKEN_STORE.ACCESS_TOKEN, null),
      this.storage.set(this.TOKEN_STORE.REFRESH_TOKEN, null),
      this.storage.set(this.TOKEN_STORE.BASE_URI, null),
      this.storage.set(this.TOKEN_STORE.TOKEN_ENDPOINT, null),
    ]);
    this.baseUri = '';
    this.tokenEndpoint = '';
    // Keep OAuth client credentials — they identify the app, not the session.
  }

  // ---------------------------------------------------------------------------
  // OAuth client credentials
  // ---------------------------------------------------------------------------

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
  /** Applied immediately so cold-start refresh has client_id before the first API call. */
  oauthClient?: OAuthClientCredentials;
}) => {
  const service = new DefaultTokenService(deps.storage, deps.logger, deps.oauthClient);
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
