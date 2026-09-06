import type {
  QuestionnaireDataService,
  DataPipelineService,
  AppServerService,
  RemoteConfigService,
  ProtocolConfig,
  AssessmentConfig,
  Question,
  QuestionnaireResult,
  StorageService,
  LoggerService,
  EventBus,
} from '../types';
import { EVENTS } from './EventBus';
import { SchemaType } from './pipeline';

const STORAGE_KEY = '@radarbase/questionnaire_definitions';
const DEFAULT_QUESTIONNAIRE_TYPE = '_armt';
const DEFAULT_QUESTIONNAIRE_FORMAT = '.json';
const GIT_API_URI = 'https://api.github.com/repos';
const MAX_RETRY_ATTEMPTS = 2;
const RETRY_BASE_DELAY_MS = 1_000;

/** Remote config key — 'appserver' (default) or 'github' for direct GitHub API calls. */
const GITHUB_FETCH_STRATEGY_KEY = 'github_fetch_strategy';

type FetchStrategy = 'appserver' | 'github';

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = MAX_RETRY_ATTEMPTS,
  baseDelay = RETRY_BASE_DELAY_MS,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

export class DefaultQuestionnaireDataService implements QuestionnaireDataService {
  private definitions: Map<string, Question[]> = new Map();
  private fetchStrategy: FetchStrategy = 'appserver';

  constructor(
    private readonly storage: StorageService,
    private readonly logger: LoggerService,
    private readonly bus: EventBus,
    private readonly pipeline: DataPipelineService,
    private readonly appServer: AppServerService,
    private readonly remoteConfig: RemoteConfigService,
  ) {}

  async loadDefinitions(protocol: ProtocolConfig, language = 'en'): Promise<void> {
    // Resolve fetch strategy from remote config
    await this.resolveFetchStrategy();

    // Restore cached definitions
    const cached = await this.storage.get<Record<string, Question[]>>(STORAGE_KEY);
    if (cached) {
      for (const [name, questions] of Object.entries(cached)) {
        this.definitions.set(name, questions);
      }
    }

    // Fetch definitions for each assessment that has a questionnaire config
    for (const assessment of protocol.protocols) {
      if (!assessment.questionnaire?.repository) continue;
      if (this.definitions.has(assessment.name)) continue;

      try {
        const questions = await retryWithBackoff(() =>
          this.fetchQuestionnaire(assessment, language),
        );
        if (questions.length > 0) {
          this.definitions.set(assessment.name, formatQuestionHeaders(questions));
        }
      } catch (e) {
        this.logger.log(
          `Failed to fetch questionnaire for ${assessment.name} after retries: ${e}`,
        );
        // Try English fallback if language-specific fetch failed
        if (language !== 'en') {
          try {
            const questions = await retryWithBackoff(() =>
              this.fetchQuestionnaire(assessment, 'en'),
            );
            if (questions.length > 0) {
              this.definitions.set(assessment.name, formatQuestionHeaders(questions));
            }
          } catch {
            this.logger.log(`Fallback fetch also failed for ${assessment.name}`);
          }
        }
      }
    }

    await this.persist();
    this.logger.log(`QuestionnaireDataService: loaded ${this.definitions.size} definitions`);
  }

  registerBundled(assessmentName: string, questions: Question[]): void {
    this.definitions.set(assessmentName, formatQuestionHeaders(questions));
  }

  async getQuestions(assessmentName: string): Promise<Question[]> {
    if (this.definitions.size === 0) {
      const cached = await this.storage.get<Record<string, Question[]>>(STORAGE_KEY);
      if (cached) {
        for (const [name, questions] of Object.entries(cached)) {
          this.definitions.set(name, questions);
        }
      }
    }
    return this.definitions.get(assessmentName) ?? [];
  }

  async submitResult(result: QuestionnaireResult): Promise<void> {
    await this.pipeline.submit(SchemaType.ASSESSMENT, {
      task: { name: result.assessmentName },
      data: {
        answers: result.answers,
        timestamps: result.timestamps,
        startTime: result.startTime,
        endTime: result.endTime,
      },
    });
    await this.pipeline.submit(SchemaType.TIMEZONE, {});
    await this.pipeline.flush();

    this.bus.emit(EVENTS.QUESTIONNAIRE_COMPLETED, result);
    this.logger.log(`Questionnaire submitted: ${result.assessmentName}`);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async resolveFetchStrategy(): Promise<void> {
    try {
      const config = await this.remoteConfig.forceFetch();
      const strategy = config.getOrDefault(GITHUB_FETCH_STRATEGY_KEY, 'appserver');
      this.fetchStrategy = strategy === 'github' ? 'github' : 'appserver';
    } catch {
      this.fetchStrategy = 'appserver';
    }
    this.logger.log(`Questionnaire fetch strategy: ${this.fetchStrategy}`);
  }

  private async fetchQuestionnaire(
    assessment: AssessmentConfig,
    language: string,
  ): Promise<Question[]> {
    const metadata = assessment.questionnaire!;
    const githubUrl = formatQuestionnaireUri(metadata.repository!, metadata.name, language);

    this.logger.log(
      `Fetching questionnaire for ${assessment.name} via ${this.fetchStrategy}: ${githubUrl}`,
    );

    const data =
      this.fetchStrategy === 'appserver'
        ? await this.fetchViaAppServer(githubUrl)
        : await this.fetchDirectFromGithub(githubUrl);

    return parseGithubContent(data);
  }

  private async fetchViaAppServer(githubUrl: string): Promise<any> {
    return this.appServer.fetchFromGithub(githubUrl);
  }

  private async fetchDirectFromGithub(githubUrl: string): Promise<any> {
    const response = await fetch(githubUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  private async persist(): Promise<void> {
    const obj: Record<string, Question[]> = {};
    for (const [name, questions] of this.definitions) {
      obj[name] = questions;
    }
    await this.storage.set(STORAGE_KEY, obj);
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Parse GitHub API content response (base64-encoded) or direct JSON array. */
function parseGithubContent(data: any): Question[] {
  // GitHub API returns { content: base64, encoding: 'base64' }
  if (data.content && data.encoding === 'base64') {
    const decoded = atob(data.content.replace(/\n/g, ''));
    return JSON.parse(decoded) as Question[];
  }
  // Direct JSON array (raw content or appserver proxy)
  if (Array.isArray(data)) return data as Question[];

  throw new Error('Unexpected response format');
}

/**
 * Build a GitHub API URL for a questionnaire definition.
 *
 * Input repository URL pattern:
 *   https://raw.githubusercontent.com/ORG/REPO/BRANCH/PATH/
 * Output:
 *   https://api.github.com/repos/ORG/REPO/contents/PATH/NAME/NAME_armt_LANG.json?ref=BRANCH
 */
function formatQuestionnaireUri(repository: string, name: string, language: string): string {
  try {
    const url = new URL(repository);
    const parts = url.pathname.split('/').filter(Boolean);
    const org = parts[0];
    const repo = parts[1];
    const branch = parts[2] ?? 'master';
    const directory = parts.slice(3).join('/');

    const langSuffix = language !== 'en' ? `_${language}` : '';
    const fileName = `${name}${DEFAULT_QUESTIONNAIRE_TYPE}${langSuffix}${DEFAULT_QUESTIONNAIRE_FORMAT}`;
    const path = directory ? `${directory}/${name}/${fileName}` : `${name}/${fileName}`;

    return `${GIT_API_URI}/${org}/${repo}/contents/${path}?ref=${branch}`;
  } catch {
    const langSuffix = language !== 'en' ? `_${language}` : '';
    return `${repository}${name}/${name}${DEFAULT_QUESTIONNAIRE_TYPE}${langSuffix}${DEFAULT_QUESTIONNAIRE_FORMAT}`;
  }
}

function formatQuestionHeaders(questions: Question[]): Question[] {
  const groupHeaders: Record<string, string> = {};

  for (const q of questions) {
    if (q.matrix_group_name && q.section_header) {
      if (!groupHeaders[q.matrix_group_name]) {
        groupHeaders[q.matrix_group_name] = q.section_header;
      }
    }
  }

  return questions.map(q => {
    if (q.matrix_group_name && !q.section_header && groupHeaders[q.matrix_group_name]) {
      return { ...q, section_header: groupHeaders[q.matrix_group_name] };
    }
    return q;
  });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const questionnaireDataServiceFactory = (deps: {
  storage: StorageService;
  logger: LoggerService;
  eventBus: EventBus;
  dataPipeline: DataPipelineService;
  appServer: AppServerService;
  remoteConfig: RemoteConfigService;
}) =>
  new DefaultQuestionnaireDataService(
    deps.storage,
    deps.logger,
    deps.eventBus,
    deps.dataPipeline,
    deps.appServer,
    deps.remoteConfig,
  );
