import {
  AuthService,
  TokenService,
  TokenPair,
  AnalyticsService,
  LoggerService,
  ConfigService,
  SubjectConfigService
} from '../types';

interface AuthCredentials {
  url?: string;
  refreshToken?: string;
  username?: string;
  password?: string;
  [key: string]: any;
}

export class DefaultAuthService implements AuthService {
  private readonly DEFAULT_MANAGEMENT_PORTAL_URI = '/managementportal';
  private readonly DEFAULT_REFRESH_TOKEN_URI = '/oauth/token';

  constructor(
    private readonly token: TokenService,
    private readonly analytics: AnalyticsService,
    private readonly logger: LoggerService,
    private readonly config: ConfigService,
    private readonly subjectConfig: SubjectConfigService
  ) {}

  async authenticate(credentials: string | AuthCredentials): Promise<TokenPair> {
    try {
      this.logger.log('Starting authentication process');
      this.analytics.logAuthenticationEvent('login', false); // Will update to true on success

      if (this.isManagementPortalAuth(credentials)) {
        return this.authenticateWithManagementPortal(credentials as string);
      } else if (this.isOryAuth(credentials)) {
        return this.authenticateWithOry(credentials as AuthCredentials | string);
      } else {
        throw new Error('Invalid authentication credentials format');
      }
    } catch (error) {
      this.logger.error('Authentication failed', error);
      this.analytics.logAuthenticationEvent('login', false);
      throw error;
    }
  }

  async completeAuthentication(refreshToken: string, baseUrl: string, tokenEndpoint: string): Promise<TokenPair> {
    if (!baseUrl) {
      throw new Error('Base URL is required for authentication');
    }

    try {
      // Set base URI and validate it
      await this.token.setURI(baseUrl);
      
      // Set user properties in analytics
      await this.analytics.setUserProperties({ baseUrl });
      
      // Set token endpoint
      await this.token.setTokenEndpoint(tokenEndpoint);
      
      // Register refresh token
      await this.token.register({ refresh_token: refreshToken });
      
      // Register as source (if applicable)
      await this.registerAsSource();
      
      // Perform initial token refresh
      const tokens = await this.token.refresh();
      
      this.logger.log('Authentication completed successfully');
      this.analytics.logAuthenticationEvent('login', true);
      
      return tokens;
    } catch (error: any) {
      this.logger.error('Authentication completion failed', error);
      this.analytics.logAuthenticationEvent('login', false);
      throw error;
    }
  }

  async reset(): Promise<void> {
    try {
      this.logger.log('Resetting authentication state');
      
      // Clear all tokens
      await this.token.clearTokens();
      
      // Reset any user-specific configuration
      // Note: We might want to preserve some settings based on requirements
      
      this.analytics.logAuthenticationEvent('logout', true);
      this.logger.log('Authentication state reset successfully');
    } catch (error: any) {
      this.logger.error('Failed to reset authentication state', error);
      throw error;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      // Check if we have valid tokens
      const accessToken = await this.token.getAccessToken();
      if (!accessToken) {
        return false;
      }

      // Try to refresh token to validate it's still valid
      await this.token.refresh();
      return true;
    } catch (error: any) {
      this.logger.error('Authentication check failed', error);
      return false;
    }
  }

  private isManagementPortalAuth(credentials: string | AuthCredentials): boolean {
    return typeof credentials === 'string' && credentials.includes('?');
  }

  private isOryAuth(credentials: string | AuthCredentials): boolean {
    return typeof credentials === 'object' && !!(credentials.url || credentials.refreshToken);
  }

  private async authenticateWithManagementPortal(credentials: string): Promise<TokenPair> {
    try {
      const { refreshToken, baseUrl } = await this.getRefreshTokenFromUrl(credentials);
      if (!baseUrl) {
        throw new Error('Base URL is missing from the response');
      }

      // Format and validate the base URL
      const url = new URL(baseUrl);
      const formattedBaseUrl = url.origin;
      
      this.logger.log(`Retrieved refresh token from ${formattedBaseUrl}`);
      
      const tokenEndpoint = `${formattedBaseUrl}${this.DEFAULT_MANAGEMENT_PORTAL_URI}${this.DEFAULT_REFRESH_TOKEN_URI}`;
      return this.completeAuthentication(refreshToken, formattedBaseUrl, tokenEndpoint);
    } catch (error: any) {
      this.logger.error('Management Portal authentication failed', error);
      throw error;
    }
  }

  private async authenticateWithOry(credentials: string | AuthCredentials): Promise<TokenPair> {
    let baseUrl: string;
    let refreshToken: string;

    if (typeof credentials === 'string') {
      try {
        const url = new URL(credentials);
        const encodedData = url.searchParams.get('data');
        const referrer = url.searchParams.get('referrer');
        
        if (!referrer) {
          throw new Error('Referrer URL is missing');
        }
        
        baseUrl = new URL(referrer).origin;
        
        if (!encodedData) {
          throw new Error('Ory auth data is missing');
        }
        
        const data = JSON.parse(decodeURIComponent(encodedData));
        if (!data.refresh_token) {
          throw new Error('Refresh token is missing from auth data');
        }
        
        refreshToken = data.refresh_token;
      } catch (e: any) {
        throw new Error(`Invalid auth URL format: ${e?.message || String(e)}`);
      }
    } else {
      if (!credentials.url) {
        throw new Error('Base URL is missing from auth object');
      }
      
      try {
        baseUrl = new URL(credentials.url).origin;
      } catch (e) {
        throw new Error(`Invalid base URL format: ${credentials.url}`);
      }
      
      if (!credentials.refreshToken) {
        throw new Error('Refresh token is missing from auth object');
      }
      
      refreshToken = credentials.refreshToken;
    }

    const tokenEndpoint = `${baseUrl}/hydra/oauth2/token`;
    return this.completeAuthentication(refreshToken, baseUrl, tokenEndpoint);
  }

  private async getRefreshTokenFromUrl(url: string): Promise<{ refreshToken: string; baseUrl: string }> {
    // This would typically make an HTTP request to extract the refresh token
    // For now, we'll simulate the response
    const urlObj = new URL(url);
    const token = urlObj.searchParams.get('refresh_token');
    const baseUrl = urlObj.searchParams.get('base_url');
    
    if (!token || !baseUrl) {
      throw new Error('Invalid authentication URL: missing refresh_token or base_url');
    }
    
    return {
      refreshToken: token,
      baseUrl: baseUrl as string
    };
  }

  private async registerAsSource(): Promise<void> {
    try {
      // This would typically register the app as a data source
      // Implementation depends on the specific backend requirements
      this.logger.log('Registering as data source');
      
      // Example: Could involve setting subject configuration
      // await this.subjectConfig.registerAsSource();
    } catch (error: any) {
      this.logger.error('Failed to register as source', error);
      // Don't throw - this might not be critical for all setups
    }
  }

  // Additional utility methods
  async getCurrentUser(): Promise<any> {
    try {
      const isAuth = await this.isAuthenticated();
      if (!isAuth) {
        return null;
      }

      // Get user information from subject config or token
      return {
        subjectId: await this.subjectConfig.getParticipantLogin(),
        projectId: await this.subjectConfig.getProjectName(),
        isAuthenticated: true
      };
    } catch (error: any) {
      this.logger.error('Failed to get current user', error);
      return null;
    }
  }

  async refreshTokens(): Promise<TokenPair> {
    try {
      const tokens = await this.token.refresh();
      this.analytics.logAuthenticationEvent('token_refresh', true);
      return tokens;
    } catch (error: any) {
      this.analytics.logAuthenticationEvent('token_refresh', false);
      throw error;
    }
  }
}

export const authServiceFactory = (deps: {
  token: TokenService;
  analytics: AnalyticsService;
  logger: LoggerService;
  config: ConfigService;
  subjectConfig: SubjectConfigService;
}) => new DefaultAuthService(
  deps.token,
  deps.analytics,
  deps.logger,
  deps.config,
  deps.subjectConfig
);
