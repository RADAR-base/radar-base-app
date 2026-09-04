import type {
  SubjectConfigService,
  StorageService,
  LoggerService,
  TokenService,
} from '../types';

const STORAGE_KEY = '@radarbase/mp_subject';

/** Management Portal subject DTO (subset used by the app). */
export interface ManagementPortalSubject {
  login: string;
  createdDate?: string;
  attributes?: Record<string, unknown>;
  project?: {
    projectName?: string;
    id?: number;
  };
}

interface CachedSubject {
  login: string;
  projectName: string;
  enrolmentDate: string;
  attributes: Record<string, unknown>;
  /** JWT `sub` this cache was fetched for — invalidate when the session subject changes. */
  tokenSub: string;
}

/**
 * Resolves participant/project identity from Management Portal.
 *
 * Flow: decode subject login from the access-token JWT (`sub` / `user_name`) →
 * `GET {baseUrl}/managementportal/api/subjects/{login}` → cache login, projectName,
 * enrolment date, and attributes for appserver schedule/protocol calls.
 */
export class ManagementPortalSubjectConfigService implements SubjectConfigService {
  /** Public MP subjects API under the Management Portal context path. */
  static readonly SUBJECTS_PATH = '/managementportal/api/subjects';

  private cache: CachedSubject | null = null;
  private loadPromise: Promise<CachedSubject> | null = null;

  constructor(
    private readonly token: TokenService,
    private readonly storage: StorageService,
    private readonly logger: LoggerService,
    /** OAuth / platform base URL, e.g. `https://dev.radarbasedev.co.uk`. */
    private readonly baseUrl: string,
  ) {}

  async getParticipantLogin(): Promise<string> {
    return (await this.ensureLoaded()).login;
  }

  async getProjectName(): Promise<string> {
    return (await this.ensureLoaded()).projectName;
  }

  async getEnrolmentDate(): Promise<string | Date> {
    return (await this.ensureLoaded()).enrolmentDate;
  }

  async getParticipantAttributes(): Promise<Record<string, unknown>> {
    return (await this.ensureLoaded()).attributes;
  }

  /** Drop in-memory + persisted cache (e.g. on logout). */
  async clear(): Promise<void> {
    this.cache = null;
    this.loadPromise = null;
    await this.storage.set(STORAGE_KEY, null);
  }

  private async ensureLoaded(): Promise<CachedSubject> {
    if (this.cache) return this.cache;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.load().finally(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
  }

  private async load(): Promise<CachedSubject> {
    const accessToken = await this.requireAccessToken();
    const tokenSub = subjectIdFromAccessToken(accessToken);
    if (!tokenSub) {
      throw new Error(
        'Access token has no subject id (expected JWT claim `sub` or `user_name`).',
      );
    }

    const stored = await this.storage.get<CachedSubject>(STORAGE_KEY);
    if (stored?.login && stored.projectName && stored.tokenSub === tokenSub) {
      this.cache = stored;
      this.logger.log(
        `[SubjectConfig] using cached subject login=${stored.login} project=${stored.projectName}`,
      );
      return stored;
    }

    const subject = await this.fetchSubject(tokenSub, accessToken);
    const projectName = subject.project?.projectName;
    if (!projectName) {
      throw new Error(
        `Management Portal subject "${subject.login || tokenSub}" has no project.projectName.`,
      );
    }

    const cached: CachedSubject = {
      login: subject.login || tokenSub,
      projectName,
      enrolmentDate: subject.createdDate || new Date().toISOString(),
      attributes: subject.attributes ?? {},
      tokenSub,
    };

    this.cache = cached;
    await this.storage.set(STORAGE_KEY, cached);
    this.logger.log(
      `[SubjectConfig] loaded from MP — login=${cached.login} project=${cached.projectName}`,
    );
    return cached;
  }

  private async requireAccessToken(): Promise<string> {
    let access = await this.token.getAccessToken();
    if (!access) {
      const pair = await this.token.refresh();
      access = pair.access_token;
    }
    if (!access) throw new Error('No access token available for Management Portal subject lookup.');
    return access;
  }

  private async fetchSubject(
    subjectId: string,
    accessToken: string,
  ): Promise<ManagementPortalSubject> {
    const base = this.baseUrl.replace(/\/$/, '');
    const url = `${base}${ManagementPortalSubjectConfigService.SUBJECTS_PATH}/${encodeURIComponent(subjectId)}`;
    this.logger.log(`[SubjectConfig] GET ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Management Portal subject fetch failed: ${response.status} ${response.statusText}` +
          (detail ? ` — ${detail}` : ''),
      );
    }

    return (await response.json()) as ManagementPortalSubject;
  }
}

/**
 * RADAR access tokens identify the subject via `sub` (Hydra) or sometimes `user_name` (legacy MP).
 */
export function subjectIdFromAccessToken(accessToken: string): string | null {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return null;
  const sub = payload.sub;
  if (typeof sub === 'string' && sub.length > 0) return sub;
  const userName = payload.user_name;
  if (typeof userName === 'string' && userName.length > 0) return userName;
  return null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const subjectConfigServiceFactory = (deps: {
  token: TokenService;
  storage: StorageService;
  logger: LoggerService;
  /** Platform base URL from `OAuthConfig.endpoint`. */
  baseUrl: string;
}) =>
  new ManagementPortalSubjectConfigService(
    deps.token,
    deps.storage,
    deps.logger,
    deps.baseUrl,
  );
