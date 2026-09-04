import { ApiService, AppServerService as IAppServerService, LoggerService, LocalizationService, RemoteConfigService, StorageService, SubjectConfigService, TokenService } from '../types';

// A lightweight, framework-agnostic AppServerService inspired by the Ionic service
export class DefaultAppServerService implements IAppServerService {
  private APP_SERVER_URL: string | null = null;

  // Paths
  private readonly SUBJECT_PATH = 'users';
  private readonly PROJECT_PATH = 'projects';
  private readonly GITHUB_CONTENT_PATH = 'github/content';
  private readonly QUESTIONNAIRE_SCHEDULE_PATH = 'questionnaire/schedule';
  private readonly QUESTIONNAIRE_STATE_EVENTS_PATH = 'state_events';
  private readonly NOTIFICATIONS_PATH = 'messaging/notifications';
  private readonly STATE_EVENTS_PATH = 'state_events';
  // TO UPDATE: This is a temporary default URL for development purposes. In production, the URL should be set via remote config or environment variables.
  private readonly DEFAULT_APPSERVER_URL = 'https://dev.radarbasedev.co.uk/appserver-2';

  constructor(
    private readonly api: ApiService,
    private readonly storage: StorageService,
    private readonly subjectConfig: SubjectConfigService,
    private readonly logger: LoggerService,
    private readonly remoteConfig: RemoteConfigService,
    private readonly localization: LocalizationService,
    private readonly token: TokenService,
  ) { }

  async init(): Promise<any> {
    await this.updateAppServerURL();
    const [subjectId, projectId, enrolmentDate, attributes, fcmToken] = await Promise.all([
      this.subjectConfig.getParticipantLogin(),
      this.subjectConfig.getProjectName(),
      this.subjectConfig.getEnrolmentDate(),
      this.subjectConfig.getParticipantAttributes(),
      this.getFCMToken(),
    ]);
    await this.addProjectIfMissing(projectId);
    return this.addSubjectIfMissing(subjectId, projectId, enrolmentDate, attributes, fcmToken || undefined);
  }

  private async getHeaders(): Promise<Record<string, string>> {
    if (!this.APP_SERVER_URL) await this.updateAppServerURL();
    const tokens = await this.token.refresh();
    this.api.setHeaders({ 'Authorization': `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' });
    return ({});
  }

  async getProject(projectId: string): Promise<any> {
    await this.getHeaders();
    return this.api.get(`/${this.PROJECT_PATH}/${projectId}`);
  }

  async addProjectIfMissing(projectId: string): Promise<any> {
    try {
      return await this.getProject(projectId);
    } catch (e: any) {
      if (e?.message?.includes('404')) return this.addProjectToServer(projectId);
      throw e;
    }
  }

  async addProjectToServer(projectId: string): Promise<any> {
    await this.getHeaders();
    return this.api.post(`/${this.PROJECT_PATH}`, { projectId });
  }

  async getSubject(projectId: string, subjectId: string): Promise<any> {
    await this.getHeaders();
    return this.api.get(`/${this.PROJECT_PATH}/${projectId}/${this.SUBJECT_PATH}/${subjectId}`);
  }

  async addSubjectIfMissing(
    subjectId: string,
    projectId: string,
    enrolmentDate: string | Date,
    attributes: Record<string, unknown>,
    fcmToken?: string
  ): Promise<any> {
    try {
      const subject = await this.getSubject(projectId, subjectId);
      return this.updateSubject(subject, {
        fcmToken: "fcmToken",
        lastOpened: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: this.localization.getLanguage().value,
        attributes,
      });
    } catch (e: any) {
      if (e?.message?.includes('404')) {
        return this.addSubjectToServer(subjectId, projectId, enrolmentDate, "fcmToken", attributes);
      }
      throw e;
    }
  }

  async addSubjectToServer(
    subjectId: string,
    projectId: string,
    enrolmentDate: string | Date,
    fcmToken?: string,
    attributes?: Record<string, unknown>
  ): Promise<any> {
    await this.getHeaders();
    return this.api.post(`/${this.PROJECT_PATH}/${projectId}/${this.SUBJECT_PATH}`, {
      enrolmentDate: new Date(enrolmentDate).toISOString(),
      projectId,
      subjectId,
      fcmToken,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: this.localization.getLanguage().value,
      attributes,
    });
  }

  async updateSubject(subject: any, properties: Record<string, unknown>): Promise<any> {
    await this.getHeaders();
    const updatedSubject = { ...subject, ...properties };
    const projectId = subject.projectId;
    const subjectId = subject.subjectId;
    return this.api.post(`/${this.PROJECT_PATH}/${projectId}/${this.SUBJECT_PATH}/${subjectId}`, updatedSubject);
  }

  async fetchFromGithub(githubUrl: string): Promise<any> {
    await this.getHeaders();
    return this.api.get(`/${this.GITHUB_CONTENT_PATH}?url=${encodeURIComponent(githubUrl)}`);
  }

  async getProtocol(): Promise<any> {
    const [subjectId, projectId] = await Promise.all([
      this.subjectConfig.getParticipantLogin(),
      this.subjectConfig.getProjectName(),
    ]);
    await this.getHeaders();
    return this.api.get(`/${this.PROJECT_PATH}/${projectId}/${this.SUBJECT_PATH}/${subjectId}/protocols`);
  }

  async getSchedule(): Promise<any> {
    const [subjectId, projectId] = await Promise.all([
      this.subjectConfig.getParticipantLogin(),
      this.subjectConfig.getProjectName(),
    ]);
    await this.getHeaders();
    return this.api.get(`/${this.PROJECT_PATH}/${projectId}/${this.SUBJECT_PATH}/${subjectId}/${this.QUESTIONNAIRE_SCHEDULE_PATH}`);
  }

  async getScheduleForDates(startTime: Date, endTime: Date): Promise<any> {
    const [subjectId, projectId] = await Promise.all([
      this.subjectConfig.getParticipantLogin(),
      this.subjectConfig.getProjectName(),
    ]);
    await this.getHeaders();
    const params = new URLSearchParams({ startTime: startTime.toISOString(), endTime: endTime.toISOString() });
    try {
      return await this.api.get(`/${this.PROJECT_PATH}/${projectId}/${this.SUBJECT_PATH}/${subjectId}/${this.QUESTIONNAIRE_SCHEDULE_PATH}?${params.toString()}`);
    } catch {
      return [];
    }
  }

  async generateSchedule(): Promise<any> {
    const [subjectId, projectId] = await Promise.all([
      this.subjectConfig.getParticipantLogin(),
      this.subjectConfig.getProjectName(),
    ]);
    await this.getHeaders();
    return this.api.post(`/${this.PROJECT_PATH}/${projectId}/${this.SUBJECT_PATH}/${subjectId}/${this.QUESTIONNAIRE_SCHEDULE_PATH}`, {});
  }

  async pullAllPublishedNotifications(subject: { projectId: string; subjectId: string }): Promise<any> {
    await this.getHeaders();
    return this.api.get(`/${this.PROJECT_PATH}/${subject.projectId}/${this.SUBJECT_PATH}/${subject.subjectId}/${this.NOTIFICATIONS_PATH}`);
  }

  async deleteNotification(subject: { projectId: string; subjectId: string }, notification: { id: string | number }): Promise<any> {
    await this.getHeaders();
    return this.api.post(`/${this.PROJECT_PATH}/${subject.projectId}/${this.SUBJECT_PATH}/${subject.subjectId}/${this.NOTIFICATIONS_PATH}/${notification.id}`, { _method: 'DELETE' });
  }

  async updateTaskState(taskId: string | number, state: string): Promise<any> {
    const [subjectId, projectId] = await Promise.all([
      this.subjectConfig.getParticipantLogin(),
      this.subjectConfig.getProjectName(),
    ]);
    await this.getHeaders();
    return this.api.post(
      `/${this.PROJECT_PATH}/${projectId}/${this.SUBJECT_PATH}/${subjectId}/${this.QUESTIONNAIRE_SCHEDULE_PATH}/${taskId}/${this.QUESTIONNAIRE_STATE_EVENTS_PATH}`,
      { taskId, state, time: new Date().toISOString(), associatedInfo: '' }
    );
  }

  async updateNotificationState(subject: { projectId: string; subjectId: string }, notificationId: string | number, state: string): Promise<any> {
    await this.getHeaders();
    return this.api.post(
      `/${this.PROJECT_PATH}/${subject.projectId}/${this.SUBJECT_PATH}/${subject.subjectId}/${this.NOTIFICATIONS_PATH}/${notificationId}/${this.STATE_EVENTS_PATH}`,
      { notificationId, state, time: new Date().toISOString() }
    );
  }

  async addNotification(notification: { notificationDto: any }, subjectId: string, projectId: string): Promise<any> {
    await this.getHeaders();
    try {
      const res = await this.api.post(
        `/${this.PROJECT_PATH}/${projectId}/${this.SUBJECT_PATH}/${subjectId}/${this.NOTIFICATIONS_PATH}`,
        notification.notificationDto
      );
      this.logger.log('Successfully sent! Updating notification Id');
      return res;
    } catch (err: any) {
      this.logger.log('Http request returned an error: ' + (err?.message || 'unknown'));
      if (String(err?.status) === '409') {
        this.logger.log('Notification already exists, storing notification data..');
        return notification.notificationDto || notification;
      }
      return this.logger.error('Failed to send notification', err);
    }
  }

  async getFCMToken(): Promise<string | null> {
    return this.storage.get('FCM_TOKEN');
  }

  async updateAppServerURL(): Promise<string> {
    const cfg = await this.remoteConfig.forceFetch();
    const url = cfg.getOrDefault('APP_SERVER_URL', this.DEFAULT_APPSERVER_URL);
    this.APP_SERVER_URL = url;
    this.api.setBaseUrl(url);
    return url;
  }

  getAppServerURL(): string | null {
    return this.APP_SERVER_URL;
  }
}

export const appServerServiceFactory = (deps: {
  api: ApiService;
  storage: StorageService;
  subjectConfig: SubjectConfigService;
  logger: LoggerService;
  remoteConfig: RemoteConfigService;
  localization: LocalizationService;
  token: TokenService;
}) => new DefaultAppServerService(
  deps.api,
  deps.storage,
  deps.subjectConfig,
  deps.logger,
  deps.remoteConfig,
  deps.localization,
  deps.token
);


