import {
  NotificationService,
  NotificationActionType,
  Subject,
  SubjectConfigService,
  StorageService,
  LoggerService,
  RemoteConfigService,
  AnalyticsService,
  EventBus,
} from '../types';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface NotificationMessage {
  id: string | number;
  title: string;
  text: string;
  timestamp: number;
  type: string;
  data?: any;
}

export interface ScheduledNotification {
  id: string;
  message: NotificationMessage;
  scheduledTime: number;
  subject: Subject;
}

/** Dependencies shared by every `NotificationService` implementation. */
export interface NotificationServiceDeps {
  storage: StorageService;
  logger: LoggerService;
  remoteConfig: RemoteConfigService;
  analytics: AnalyticsService;
  subjectConfig: SubjectConfigService;
  eventBus: EventBus;
}

const PUSH_TOKEN_KEY = 'FCM_TOKEN';
const SCHEDULED_NOTIFICATIONS_KEY = 'SCHEDULED_NOTIFICATIONS';

// ---------------------------------------------------------------------------
// DefaultNotificationService — platform-agnostic base
// ---------------------------------------------------------------------------

/**
 * Base `NotificationService` with scheduling, storage, and analytics.
 * Has **no** push-token or OS-level notification logic — subclasses (e.g.
 * `FirebaseNotificationService`) add that by overriding `initPush()`.
 */
export class DefaultNotificationService implements NotificationService {
  protected pushToken: string | null = null;
  protected scheduledNotifications: ScheduledNotification[] = [];

  protected readonly storage: StorageService;
  protected readonly logger: LoggerService;
  protected readonly remoteConfig: RemoteConfigService;
  protected readonly analytics: AnalyticsService;
  protected readonly subjectConfig: SubjectConfigService;
  protected readonly eventBus: EventBus;

  constructor(deps: NotificationServiceDeps) {
    this.storage = deps.storage;
    this.logger = deps.logger;
    this.remoteConfig = deps.remoteConfig;
    this.analytics = deps.analytics;
    this.subjectConfig = deps.subjectConfig;
    this.eventBus = deps.eventBus;
  }

  async init(): Promise<void> {
    this.logger.log('Initializing Notification Service');

    const [storedToken, storedNotifications] = await Promise.all([
      this.storage.get<string>(PUSH_TOKEN_KEY),
      this.storage.get<ScheduledNotification[]>(SCHEDULED_NOTIFICATIONS_KEY),
    ]);
    this.pushToken = storedToken;
    this.scheduledNotifications = storedNotifications || [];

    // Subclasses override this to wire platform-specific push (FCM, APNs, Expo, etc.)
    await this.initPush();

    await this.cleanupExpiredNotifications();
    this.logger.log('Notification Service initialized');
  }

  /**
   * Hook for subclasses to request push permissions, acquire a device token,
   * and register foreground/background message handlers.
   * The base implementation is a no-op.
   */
  protected async initPush(): Promise<void> {
    // no-op — subclasses override
  }

  async getFCMToken(): Promise<string | null> {
    return this.pushToken;
  }

  // ---------------------------------------------------------------------------
  // Publish / cancel
  // ---------------------------------------------------------------------------

  async publish(actionType: NotificationActionType, limit?: number): Promise<any> {
    const user = await this.resolveSubject();

    switch (actionType) {
      case NotificationActionType.SCHEDULE_ALL:
        return this.publishAllNotifications(user, limit);
      case NotificationActionType.TEST:
        return this.publishTestNotification(user);
      case NotificationActionType.CANCEL_ALL:
        return this.cancelAllNotifications(user);
      case NotificationActionType.CANCEL_SINGLE:
        this.logger.log('Cancel single notification requested (no ID provided)');
        return Promise.resolve();
      case NotificationActionType.SEND_ERROR:
        return this.publishCustomNotification(
          user,
          Date.now() + 86400000,
          'Data Send Error',
          'There was a problem sending your data. Please open the app to retry.',
        );
      default:
        return this.publishAllNotifications(user, limit);
    }
  }

  async publishAllNotifications(user: Subject, limit?: number): Promise<any> {
    this.logger.log(`Publishing all notifications for user: ${user.subjectId}`);

    const config = await this.remoteConfig.forceFetch();
    const enabled = config.getOrDefault('NOTIFICATIONS_ENABLED', 'true') === 'true';
    if (!enabled) {
      this.logger.log('Notifications disabled via remote config');
      return { published: 0, skipped: 0 };
    }

    const notifications = await this.buildNotifications(user, limit);
    let published = 0;

    for (const notification of notifications) {
      try {
        await this.scheduleNotification(notification, user);
        published++;
      } catch {
        this.logger.log(`Failed to schedule notification: ${notification.id}`);
      }
    }

    this.analytics.logEvent('notifications_published', {
      user_id: user.subjectId,
      count: published,
      total: notifications.length,
    });

    return { published, total: notifications.length };
  }

  async publishTestNotification(user: Subject): Promise<any> {
    const notification: NotificationMessage = {
      id: `test_${Date.now()}`,
      title: 'Test Notification',
      text: 'This is a test notification to verify the system is working correctly.',
      timestamp: Date.now() + 5000,
      type: 'test',
      data: { isTest: true },
    };

    await this.scheduleNotification(notification, user);
    this.analytics.logEvent('test_notification_sent', {
      user_id: user.subjectId,
      notification_id: notification.id,
    });

    return { success: true, notificationId: notification.id };
  }

  async publishCustomNotification(user: Subject, timestamp: number, title: string, text: string): Promise<any> {
    const notification: NotificationMessage = {
      id: `custom_${Date.now()}`,
      title,
      text,
      timestamp,
      type: 'custom',
      data: { isCustom: true },
    };

    await this.scheduleNotification(notification, user);
    this.analytics.logEvent('custom_notification_sent', {
      user_id: user.subjectId,
      notification_id: notification.id,
    });

    return { success: true, notificationId: notification.id };
  }

  async cancelAllNotifications(user: Subject): Promise<any> {
    const initialCount = this.scheduledNotifications.length;
    this.scheduledNotifications = this.scheduledNotifications.filter(
      (n) => n.subject.subjectId !== user.subjectId,
    );
    const cancelledCount = initialCount - this.scheduledNotifications.length;

    await this.storage.set(SCHEDULED_NOTIFICATIONS_KEY, this.scheduledNotifications);
    this.analytics.logEvent('notifications_cancelled', {
      user_id: user.subjectId,
      count: cancelledCount,
    });

    return { cancelled: cancelledCount };
  }

  async cancelSingleNotification(user: Subject, notificationId: string | number): Promise<any> {
    const initialCount = this.scheduledNotifications.length;
    this.scheduledNotifications = this.scheduledNotifications.filter(
      (n) => !(n.subject.subjectId === user.subjectId && n.message.id === notificationId),
    );
    const cancelled = initialCount > this.scheduledNotifications.length;

    if (cancelled) {
      await this.storage.set(SCHEDULED_NOTIFICATIONS_KEY, this.scheduledNotifications);
      this.analytics.logEvent('notification_cancelled', {
        user_id: user.subjectId,
        notification_id: notificationId,
      });
    }

    return { cancelled, notificationId };
  }

  // ---------------------------------------------------------------------------
  // Protected helpers (available to subclasses)
  // ---------------------------------------------------------------------------

  protected async setPushToken(token: string): Promise<void> {
    this.pushToken = token;
    await this.storage.set(PUSH_TOKEN_KEY, token);
  }

  protected async resolveSubject(): Promise<Subject> {
    const [subjectId, projectId] = await Promise.all([
      this.subjectConfig.getParticipantLogin(),
      this.subjectConfig.getProjectName(),
    ]);
    return { subjectId, projectId };
  }

  protected async scheduleNotification(notification: NotificationMessage, user: Subject): Promise<void> {
    const scheduled: ScheduledNotification = {
      id: `${user.subjectId}_${notification.id}`,
      message: notification,
      scheduledTime: notification.timestamp,
      subject: user,
    };

    this.scheduledNotifications.push(scheduled);
    await this.storage.set(SCHEDULED_NOTIFICATIONS_KEY, this.scheduledNotifications);
    this.logger.log(`Scheduled notification: ${notification.id} for ${new Date(notification.timestamp).toISOString()}`);
  }

  protected async cleanupExpiredNotifications(): Promise<void> {
    const now = Date.now();
    const initialCount = this.scheduledNotifications.length;
    this.scheduledNotifications = this.scheduledNotifications.filter((n) => n.scheduledTime > now);
    const cleanedCount = initialCount - this.scheduledNotifications.length;

    if (cleanedCount > 0) {
      await this.storage.set(SCHEDULED_NOTIFICATIONS_KEY, this.scheduledNotifications);
      this.logger.log(`Cleaned up ${cleanedCount} expired notifications`);
    }
  }

  /** Override to source notifications from a real backend instead of placeholders. */
  protected async buildNotifications(_user: Subject, limit?: number): Promise<NotificationMessage[]> {
    const count = limit || 5;
    const out: NotificationMessage[] = [];
    for (let i = 0; i < count; i++) {
      out.push({
        id: `notification_${Date.now()}_${i}`,
        title: `Reminder ${i + 1}`,
        text: "Don't forget to complete your daily assessment.",
        timestamp: Date.now() + (i + 1) * 3600000,
        type: 'reminder',
        data: { taskType: 'assessment', priority: 'normal' },
      });
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// FirebaseNotificationService — FCM push token + foreground handling
// ---------------------------------------------------------------------------

let messagingModule: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  messagingModule = require('@react-native-firebase/messaging');
} catch {
  messagingModule = null;
}

function getMessaging(): any | null {
  const mod = messagingModule?.default || messagingModule;
  if (typeof mod === 'function') {
    try { return mod(); } catch { return null; }
  }
  return null;
}

/**
 * Firebase Cloud Messaging implementation. Extends `DefaultNotificationService` with:
 *  - iOS permission request
 *  - FCM token acquisition + refresh listener
 *  - Foreground remote-message handler (emits `notifications.foreground_message`)
 *
 * Falls back gracefully when the Firebase messaging module isn't installed.
 */
export class FirebaseNotificationService extends DefaultNotificationService {
  private cleanupHandlers: Array<() => void> = [];

  protected override async initPush(): Promise<void> {
    const { Platform } = require('react-native');
    const msg = getMessaging();

    if (!msg) {
      this.logger.log('Firebase messaging module not available — push notifications disabled');
      return;
    }

    try {
      // iOS requires explicit permission
      if (Platform.OS === 'ios') {
        await msg.requestPermission();
      }

      // Acquire token
      const token: string | null = await msg.getToken();
      if (token) {
        await this.setPushToken(token);
        this.logger.log(`FCM token acquired: ${token.substring(0, 12)}…`);
      }

      // Token refresh
      this.listen(msg, 'onTokenRefresh', async (newToken: string) => {
        await this.setPushToken(newToken);
        this.logger.log('FCM token refreshed');
        this.eventBus.emit('notifications.token_refreshed', { token: newToken });
      });

      // Foreground messages
      this.listen(msg, 'onMessage', async (remoteMessage: any) => {
        this.logger.log(
          `Foreground message received: ${remoteMessage?.notification?.title ?? remoteMessage?.messageId}`,
        );
        this.eventBus.emit('notifications.foreground_message', remoteMessage);
      });
    } catch (err) {
      this.logger.log(`Firebase messaging init failed, using stored token fallback: ${err}`);
    }
  }

  /** Subscribe to a Firebase messaging event, storing the unsub handle for cleanup. */
  private listen(msg: any, method: string, handler: (...args: any[]) => void): void {
    if (typeof msg[method] !== 'function') return;
    const sub = msg[method](handler);
    const unsub =
      typeof sub?.unsubscribe === 'function' ? () => sub.unsubscribe()
      : typeof sub === 'function' ? sub
      : null;
    if (unsub) this.cleanupHandlers.push(unsub);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the best available `NotificationService`:
 *  - `FirebaseNotificationService` when `@react-native-firebase/messaging` is loadable
 *  - `DefaultNotificationService` otherwise (scheduling only, no push)
 */
export const notificationServiceFactory = (deps: NotificationServiceDeps): NotificationService =>
  messagingModule
    ? new FirebaseNotificationService(deps)
    : new DefaultNotificationService(deps);
