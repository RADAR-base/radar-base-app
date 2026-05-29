import { TokenService, TokenPair, StorageService, LoggerService } from '../types';

export class DefaultTokenService implements TokenService {
  private readonly TOKEN_STORE = {
    ACCESS_TOKEN: 'ACCESS_TOKEN',
    REFRESH_TOKEN: 'REFRESH_TOKEN',
    REFRESH_TOKEN_TIMEOUT: 'REFRESH_TOKEN_TIMEOUT',
    BASE_URI: 'BASE_URI',
    TOKEN_ENDPOINT: 'TOKEN_ENDPOINT',
  };

  private baseUri: string = '';
  private tokenEndpoint: string = '';
  private isRefreshing = false;
  private refreshPromise: Promise<TokenPair> | null = null;

  constructor(
    private readonly storage: StorageService,
    private readonly logger: LoggerService
  ) {}

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
        throw new Error('No refresh token available');
      }

      const endpoint = await this.getTokenEndpoint();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
      }

      const tokens: TokenPair = await response.json();
      
      // Store the new tokens
      await this.storage.set(this.TOKEN_STORE.ACCESS_TOKEN, tokens.access_token);
      if (tokens.refresh_token) {
        await this.storage.set(this.TOKEN_STORE.REFRESH_TOKEN, tokens.refresh_token);
      }

      this.logger.log('Token refreshed successfully');
      return tokens;
    } catch (error) {
      this.logger.error('Token refresh failed', error);
      throw error;
    }
  }

  async register(refreshParams: { refresh_token: string }): Promise<void> {
    await this.storage.set(this.TOKEN_STORE.REFRESH_TOKEN, refreshParams.refresh_token);
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
  }
}

export const tokenServiceFactory = (deps: {
  storage: StorageService;
  logger: LoggerService;
}) => new DefaultTokenService(deps.storage, deps.logger);
