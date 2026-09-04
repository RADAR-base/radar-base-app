import {
  AuthService,
  TokenService,
  TokenPair,
  AnalyticsService,
  LoggerService,
  ConfigService,
  SubjectConfigService,
  StorageService,
  EventBus,
  OAuthConfig,
} from '../types';
import { EVENTS } from './EventBus';
import type { AuthStatus } from '../types';

const OAUTH_STATE_KEY = '@radarbase/oauth_pending_state';

export class DefaultAuthService implements AuthService {
  private readonly DEFAULT_MANAGEMENT_PORTAL_URI = '/managementportal';
  private readonly DEFAULT_REFRESH_TOKEN_URI = '/oauth/token';

  private pendingState: string | null = null;

  constructor(
    private readonly token: TokenService,
    private readonly analytics: AnalyticsService,
    private readonly logger: LoggerService,
    private readonly config: ConfigService,
    private readonly subjectConfig: SubjectConfigService,
    private readonly bus: EventBus,
    private readonly storage: StorageService,
    private readonly oauthConfig?: OAuthConfig,
  ) {}

  // ---------------------------------------------------------------------------
  // OAuth authorization-code flow (absorbs OryAuthClient + AuthProvider logic)
  // ---------------------------------------------------------------------------

  async getAuthorizationUrl(): Promise<string> {
    if (!this.oauthConfig) {
      throw new Error('OAuth not configured. Pass authConfig to CoreServiceOverrides.');
    }

    this.pendingState = generateRandomState();
    await this.storage.set(OAUTH_STATE_KEY, this.pendingState);

    const params = new URLSearchParams({
      client_id: this.oauthConfig.clientId,
      response_type: 'code',
      scope: this.oauthConfig.scopes,
      audience: this.oauthConfig.audience,
      redirect_uri: this.oauthConfig.redirectUri,
      state: this.pendingState,
    });

    const authEndpoint = `${this.oauthConfig.endpoint}${this.oauthConfig.authPath ?? '/oauth2/auth'}`;
    return `${authEndpoint}?${params.toString()}`;
  }

  async handleAuthCallback(code: string, state: string): Promise<void> {
    try {
      if (!this.oauthConfig) throw new Error('OAuth not configured.');
      if (!code) throw new Error('Authorization code is missing.');
      if (!state) throw new Error('State parameter is missing.');

      // Restore pendingState from storage if lost (e.g. web page reload, app cold start)
      if (!this.pendingState) {
        this.pendingState = await this.storage.get<string>(OAUTH_STATE_KEY);
      }
      if (!this.pendingState) return; // No pending auth flow
      if (this.pendingState !== state) {
        this.pendingState = null;
        await this.storage.set(OAUTH_STATE_KEY, null);
        throw new Error('OAuth state mismatch — possible CSRF attack.');
      }

      this.pendingState = null;
      await this.storage.set(OAUTH_STATE_KEY, null);
      this.emitAuthState('authenticating');

      const tokenEndpoint = `${this.oauthConfig.endpoint}${this.oauthConfig.tokenPath ?? '/oauth2/token'}`;

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.oauthConfig.clientId,
        code,
        redirect_uri: this.oauthConfig.redirectUri,
      });
      if (this.oauthConfig.clientSecret) {
        body.append('client_secret', this.oauthConfig.clientSecret);
      }

      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: body.toString(),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Token exchange failed (${response.status}): ${detail || 'no response body'}`);
      }

      const tokens: TokenPair = await response.json();
      if (!tokens.access_token) throw new Error('Token response missing access_token.');
      if (!tokens.refresh_token) throw new Error('Token response missing refresh_token.');

      // Store tokens and configure endpoints — single token call, no refresh needed
      await this.token.setURI(this.oauthConfig.endpoint);
      await this.token.setTokenEndpoint(tokenEndpoint);
      await this.token.register({ refresh_token: tokens.refresh_token, access_token: tokens.access_token });

      await this.analytics.setUserProperties({ baseUrl: this.oauthConfig.endpoint });
      await this.analytics.logAuthenticationEvent('login', true);
      this.logger.log('Authentication completed successfully');
      this.emitAuthState('authenticated');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Authentication failed.';
      this.emitAuthState('unauthenticated', msg);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Existing auth methods (Management Portal, legacy Ory credential flows)
  // ---------------------------------------------------------------------------

  async authenticate(credentials: string | Record<string, any>): Promise<TokenPair> {
    try {
      this.logger.log('Starting authentication process');
      if (this.isManagementPortalAuth(credentials)) {
        return this.authenticateWithManagementPortal(credentials as string);
      } else if (this.isOryAuth(credentials)) {
        return this.authenticateWithOry(credentials as Record<string, any> | string);
      } else {
        throw new Error('Invalid authentication credentials format');
      }
    } catch (error) {
      this.logger.error('Authentication failed', error);
      this.analytics.logAuthenticationEvent('login', false);
      throw error;
    }
  }

  async completeAuthentication(refreshToken: string, baseUrl: string, tokenEndpoint: string, accessToken?: string): Promise<TokenPair> {
    if (!baseUrl) throw new Error('Base URL is required for authentication');

    try {
      await this.token.setURI(baseUrl);
      await this.analytics.setUserProperties({ baseUrl });
      await this.token.setTokenEndpoint(tokenEndpoint);
      await this.token.register({ refresh_token: refreshToken, access_token: accessToken });
      await this.registerAsSource();

      let tokens: TokenPair;
      if (accessToken) {
        tokens = { access_token: accessToken, refresh_token: refreshToken };
      } else {
        tokens = await this.token.refresh();
      }

      this.logger.log('Authentication completed successfully');
      this.analytics.logAuthenticationEvent('login', true);
      this.emitAuthState('authenticated');
      return tokens;
    } catch (error: any) {
      this.logger.error('Authentication completion failed', error);
      this.analytics.logAuthenticationEvent('login', false);
      this.emitAuthState('unauthenticated', error?.message);
      throw error;
    }
  }

  async reset(): Promise<void> {
    try {
      this.logger.log('Resetting authentication state');
      await this.token.clearTokens();
      this.analytics.logAuthenticationEvent('logout', true);
      this.emitAuthState('unauthenticated');
    } catch (error: any) {
      this.logger.error('Failed to reset authentication state', error);
      throw error;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const accessToken = await this.token.getAccessToken();
      return !!accessToken;
    } catch (error: any) {
      this.logger.error('Authentication check failed', error);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private emitAuthState(status: AuthStatus, error?: string): void {
    this.bus.emit(EVENTS.AUTH_STATE_CHANGED, { status, error: error ?? null });
  }

  private isManagementPortalAuth(credentials: string | Record<string, any>): boolean {
    return typeof credentials === 'string' && credentials.includes('?');
  }

  private isOryAuth(credentials: string | Record<string, any>): boolean {
    return typeof credentials === 'object' && !!(credentials.url || credentials.refreshToken);
  }

  private async authenticateWithManagementPortal(credentials: string): Promise<TokenPair> {
    const { refreshToken, baseUrl } = await this.getRefreshTokenFromUrl(credentials);
    if (!baseUrl) throw new Error('Base URL is missing from the response');
    const url = new URL(baseUrl);
    const formattedBaseUrl = url.origin;
    const tokenEndpoint = `${formattedBaseUrl}${this.DEFAULT_MANAGEMENT_PORTAL_URI}${this.DEFAULT_REFRESH_TOKEN_URI}`;
    return this.completeAuthentication(refreshToken, formattedBaseUrl, tokenEndpoint);
  }

  private async authenticateWithOry(credentials: string | Record<string, any>): Promise<TokenPair> {
    let baseUrl: string;
    let refreshToken: string;

    if (typeof credentials === 'string') {
      const url = new URL(credentials);
      const encodedData = url.searchParams.get('data');
      const referrer = url.searchParams.get('referrer');
      if (!referrer) throw new Error('Referrer URL is missing');
      baseUrl = new URL(referrer).origin;
      if (!encodedData) throw new Error('Ory auth data is missing');
      const data = JSON.parse(decodeURIComponent(encodedData));
      if (!data.refresh_token) throw new Error('Refresh token is missing from auth data');
      refreshToken = data.refresh_token;
    } else {
      if (!credentials.url) throw new Error('Base URL is missing from auth object');
      baseUrl = new URL(credentials.url).origin;
      if (!credentials.refreshToken) throw new Error('Refresh token is missing from auth object');
      refreshToken = credentials.refreshToken;
    }

    const tokenEndpoint = `${baseUrl}/hydra/oauth2/token`;
    return this.completeAuthentication(refreshToken, baseUrl, tokenEndpoint);
  }

  private async getRefreshTokenFromUrl(url: string): Promise<{ refreshToken: string; baseUrl: string }> {
    const urlObj = new URL(url);
    const token = urlObj.searchParams.get('refresh_token');
    const baseUrl = urlObj.searchParams.get('base_url');
    if (!token || !baseUrl) throw new Error('Invalid authentication URL: missing refresh_token or base_url');
    return { refreshToken: token, baseUrl };
  }

  private async registerAsSource(): Promise<void> {
    try {
      this.logger.log('Registering as data source');
    } catch (error: any) {
      this.logger.error('Failed to register as source', error);
    }
  }
}

function generateRandomState(): string {
  const timestamp = Date.now().toString(36);
  let entropy = Math.random().toString(36).slice(2);
  while (entropy.length < 24) entropy += Math.random().toString(36).slice(2);
  return `${timestamp}${entropy}`.slice(0, 40);
}

export const authServiceFactory = (deps: {
  token: TokenService;
  analytics: AnalyticsService;
  logger: LoggerService;
  config: ConfigService;
  subjectConfig: SubjectConfigService;
  eventBus: EventBus;
  storage: StorageService;
  oauthConfig?: OAuthConfig;
}) => new DefaultAuthService(
  deps.token,
  deps.analytics,
  deps.logger,
  deps.config,
  deps.subjectConfig,
  deps.eventBus,
  deps.storage,
  deps.oauthConfig,
);
