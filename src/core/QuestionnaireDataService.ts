import type {
  QuestionnaireDataService,
  ProtocolConfig,
  AssessmentConfig,
  Question,
  QuestionnaireResult,
  StorageService,
  LoggerService,
  EventBus,
} from '../types';
import { EVENTS } from './EventBus';

const STORAGE_KEY = '@radarbase/questionnaire_definitions';
const DEFAULT_QUESTIONNAIRE_TYPE = '_armt';
const DEFAULT_QUESTIONNAIRE_FORMAT = '.json';
const GIT_API_URI = 'https://api.github.com/repos';

export class DefaultQuestionnaireDataService implements QuestionnaireDataService {
  private definitions: Map<string, Question[]> = new Map();

  constructor(
    private readonly storage: StorageService,
    private readonly logger: LoggerService,
    private readonly bus: EventBus,
  ) {}

  async loadDefinitions(protocol: ProtocolConfig, language = 'en'): Promise<void> {
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
        const questions = await this.fetchQuestionnaire(assessment, language);
        if (questions.length > 0) {
          this.definitions.set(assessment.name, formatQuestionHeaders(questions));
        }
      } catch (e) {
        this.logger.log(`Failed to fetch questionnaire for ${assessment.name}: ${e}`);
        // Try English fallback if language-specific fetch failed
        if (language !== 'en') {
          try {
            const questions = await this.fetchQuestionnaire(assessment, 'en');
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
    return this.definitions.get(assessmentName) ?? [];
  }

  async submitResult(result: QuestionnaireResult): Promise<void> {
    this.bus.emit(EVENTS.QUESTIONNAIRE_COMPLETED, result);
    this.logger.log(`Questionnaire submitted: ${result.assessmentName}`);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async fetchQuestionnaire(assessment: AssessmentConfig, language: string): Promise<Question[]> {
    const metadata = assessment.questionnaire!;
    const uri = formatQuestionnaireUri(metadata.repository!, metadata.name, language);

    const response = await fetch(uri);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    // GitHub API returns { content: base64 } for contents endpoint
    if (data.content && data.encoding === 'base64') {
      const decoded = atob(data.content.replace(/\n/g, ''));
      return JSON.parse(decoded) as Question[];
    }
    // Direct raw content
    if (Array.isArray(data)) return data as Question[];

    throw new Error('Unexpected response format');
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

/**
 * Build a GitHub API URL for a questionnaire definition.
 * Mirrors RADAR-Questionnaire's `formatQuestionnaireUri`.
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
    // raw.githubusercontent.com/ORG/REPO/BRANCH/PATH...
    const org = parts[0];
    const repo = parts[1];
    const branch = parts[2] ?? 'master';
    const directory = parts.slice(3).join('/');

    const langSuffix = language !== 'en' ? `_${language}` : '';
    const fileName = `${name}${DEFAULT_QUESTIONNAIRE_TYPE}${langSuffix}${DEFAULT_QUESTIONNAIRE_FORMAT}`;
    const path = directory ? `${directory}${name}/${fileName}` : `${name}/${fileName}`;

    return `${GIT_API_URI}/${org}/${repo}/contents/${path}?ref=${branch}`;
  } catch {
    // If URL parsing fails, try using it as a direct URL
    const langSuffix = language !== 'en' ? `_${language}` : '';
    return `${repository}${name}/${name}${DEFAULT_QUESTIONNAIRE_TYPE}${langSuffix}${DEFAULT_QUESTIONNAIRE_FORMAT}`;
  }
}

/**
 * Ensure all questions in a matrix group inherit the section_header from the first
 * question in the group. Mirrors RADAR-Questionnaire's `formatQuestionsHeaders`.
 */
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
}) => new DefaultQuestionnaireDataService(deps.storage, deps.logger, deps.eventBus);
