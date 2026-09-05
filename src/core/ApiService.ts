import { ApiService } from '../types';

class SimpleApiService implements ApiService {
  private baseUrl: string = '';
  private headers: Record<string, string> = { 'Content-Type': 'application/json' };
  private authTokenProvider: (() => Promise<string | null>) | null = null;

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '');
  }

  setHeaders(headers: Record<string, string>): void {
    this.headers = { ...this.headers, ...headers };
  }

  setAuthTokenProvider(provider: () => Promise<string | null>): void {
    this.authTokenProvider = provider;
  }

  async get<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    const authHeaders = await this.buildAuthHeaders();
    const url = this.resolveUrl(path);
    const res = await fetch(url, {
      ...options,
      method: 'GET',
      headers: { ...this.headers, ...authHeaders, ...(options.headers || {}) },
    });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  }

  async post<T = any>(path: string, body: unknown, options: RequestInit = {}): Promise<T> {
    const authHeaders = await this.buildAuthHeaders();
    const url = this.resolveUrl(path);
    const res = await fetch(url, {
      ...options,
      method: 'POST',
      headers: { ...this.headers, ...authHeaders, ...(options.headers || {}) },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  }

  /** If path is already an absolute URL, use it as-is; otherwise prepend baseUrl. */
  private resolveUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${this.baseUrl}${path}`;
  }

  private async buildAuthHeaders(): Promise<Record<string, string>> {
    if (!this.authTokenProvider) return {};
    try {
      const token = await this.authTokenProvider();
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }
}

export const apiService = new SimpleApiService(); 