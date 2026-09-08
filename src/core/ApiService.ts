import { ApiService } from '../types';

/**
 * Reads a successful response as JSON, tolerating an empty body.
 *
 * A 204 — or a 200 with zero content-length, which the RADAR app server returns for a subject that
 * has no protocol attached — makes `res.json()` throw `SyntaxError: Unexpected end of input`. That
 * surfaces as a parse failure rather than "there's nothing here", so callers can't tell a genuinely
 * empty resource from a malformed one. Return `null` for an empty body instead.
 */
async function parseBody<T>(res: Response): Promise<T> {
  if (res.status === 204) return null as T;
  const text = await res.text();
  if (text.trim() === '') return null as T;
  return JSON.parse(text) as T;
}

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
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      method: 'GET',
      headers: { ...this.headers, ...authHeaders, ...(options.headers || {}) },
    });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
    return parseBody<T>(res);
  }

  async post<T = any>(path: string, body: unknown, options: RequestInit = {}): Promise<T> {
    const authHeaders = await this.buildAuthHeaders();
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      method: 'POST',
      headers: { ...this.headers, ...authHeaders, ...(options.headers || {}) },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${res.statusText}`);
    return parseBody<T>(res);
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