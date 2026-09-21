import {
  NotificationService,
  NotificationActionType,
  Subject,
  StorageService,
  LoggerService,
  RemoteConfigService,
  AnalyticsService
} from '../types';
// Replace static import with dynamic require + fallback for web/demo environments
let messagingModule: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  messagingModule = require('@react-native-firebase/messaging');
} catch {
  messagingModule = null;
}
const messaging: any = messagingModule?.default || messagingModule || (() => ({
  requestPermission: async () => { },
  getToken: async () => null,
  onTokenRefresh: (_cb: (token: string) => void) => ({ unsubscribe: () => { } }),
  onMessage: (_cb: (msg: any) => void) => ({ unsubscribe: () => { } }),
}));
import { AppState, Platform } from 'react-native';

interface NotificationMessage {
  id: string | number;
  title: string;
  text: string;
  timestamp: number;
  type: string;
  data?: any;
}

interface ScheduledNotification {
  id: string;
  message: NotificationMessage;
  scheduledTime: number;
  subject: Subject;
}

export class DefaultNotificationService implements NotificationService {
  private readonly FCM_TOKEN_KEY = 'FCM_TOKEN';
  private readonly SCHEDULED_NOTIFICATIONS_KEY = 'SCHEDULED_NOTIFICATIONS';
  private readonly NOTIFICATION_SETTINGS_KEY = 'NOTIFICATION_SETTINGS';

  private fcmToken: string | null = null;
  private scheduledNotifications: ScheduledNotification[] = [];

  constructor(
    private readonly storage: StorageService,
    private readonly logger: LoggerService,
    private readonly remoteConfig: RemoteConfigService,
    private readonly analytics: AnalyticsService
  ) { }

  async init(): Promise<void> {
    try {
      this.logger.log('Initializing Notification Service');

      // Request permission (iOS) and get token
      if (Platform.OS === 'ios') {
        await messaging().requestPermission();
      }
      this.fcmToken = await messaging().getToken();
      if (this.fcmToken) {
        await this.storage.set(this.FCM_TOKEN_KEY, this.fcmToken);
      } else {
        // fallback to stored token
        this.fcmToken = await this.storage.get<string>(this.FCM_TOKEN_KEY);
      }

      // Load scheduled notifications
      const stored = await this.storage.get<ScheduledNotification[]>(this.SCHEDULED_NOTIFICATIONS_KEY);
      this.scheduledNotifications = stored || [];

      // Listen for token refresh
      messaging().onTokenRefresh(async (token: string) => {
        this.fcmToken = token;
        await this.storage.set(this.FCM_TOKEN_KEY, token);
      });

      // Background/quit state handlers can be configured in index.js if needed

      // Clean up expired notifications
      await this.cleanupExpiredNotifications();

      this.logger.log('Notification Service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Notification Service', error);
      throw error;
    }
  }

  async publish(actionType: NotificationActionType, limit?: number): Promise<any> {
    try {
      this.logger.log(`Publishing notifications with action: ${actionType}`);

      // Get current user (would typically come from auth service)
      const user: Subject = {
        subjectId: 'current_user', // This would come from actual auth state
        projectId: 'current_project'
      };

      // Ensure basic foreground listener (no-op) is installed once
      messaging().onMessage(async () => {
        // In-app handling could go here
      });

      switch (actionType) {
        case NotificationActionType.SCHEDULE_ALL:
          return this.publishAllNotifications(user, limit);
        case NotificationActionType.TEST:
          return this.publishTestNotification(user);
        case NotificationActionType.CANCEL_ALL:
          return this.cancelAllNotifications(user);
        case NotificationActionType.CANCEL_SINGLE:
          // For single cancellation, we'd need a notification ID
          this.logger.log('Cancel single notification requested');
          return Promise.resolve();
        case NotificationActionType.SEND_ERROR:
          return this.publishCustomNotification(
            user,
            Date.now() + 86400000, // 24 hours from now
            'Data Send Error',
            'There was a problem sending your data. Please open the app to retry.'
          );
        default:
          return this.publishAllNotifications(user, limit);
      }
    } catch (error) {
      this.logger.error(`Failed to publish notifications for action: ${actionType}`, error);
      throw error;
    }
  }

  async publishAllNotifications(user: Subject, limit?: number): Promise<any> {
    try {
      this.logger.log(`Publishing all notifications for user: ${user.subjectId}`);

      // Get notification configuration from remote config
      const config = await this.remoteConfig.forceFetch();
      const notificationsEnabled = config.getOrDefault('NOTIFICATIONS_ENABLED', 'true') === 'true';

      if (!notificationsEnabled) {
        this.logger.log('Notifications disabled via remote config');
        return { published: 0, skipped: 0 };
      }

      // Generate sample notifications (in a real app, these would come from the backend)
      const notifications = await this.generateNotifications(user, limit);
      let published = 0;

      for (const notification of notifications) {
        try {
          await this.scheduleNotification(notification, user);
          published++;
        } catch (error) {
          this.logger.error(`Failed to schedule notification: ${notification.id}`, error);
        }
      }

      this.analytics.logEvent('notifications_published', {
        user_id: user.subjectId,
        count: published,
        total: notifications.length
      });

      return { published, total: notifications.length };
    } catch (error) {
      this.logger.error('Failed to publish all notifications', error);
      throw error;
    }
  }

  async publishTestNotification(user: Subject): Promise<any> {
    try {
      this.logger.log(`Publishing test notification for user: ${user.subjectId}`);

      const testNotification: NotificationMessage = {
        id: `test_${Date.now()}`,
        title: 'Test Notification',
        text: 'This is a test notification to verify the system is working correctly.',
        timestamp: Date.now() + 5000, // 5 seconds from now
        type: 'test',
        data: { isTest: true }
      };

      await this.scheduleNotification(testNotification, user);

      this.analytics.logEvent('test_notification_sent', {
        user_id: user.subjectId,
        notification_id: testNotification.id
      });

      return { success: true, notificationId: testNotification.id };
    } catch (error) {
      this.logger.error('Failed to publish test notification', error);
      throw error;
    }
  }

  async publishCustomNotification(user: Subject, timestamp: number, title: string, text: string): Promise<any> {
    try {
      this.logger.log(`Publishing custom notification for user: ${user.subjectId}`);

      const customNotification: NotificationMessage = {
        id: `custom_${Date.now()}`,
        title,
        text,
        timestamp,
        type: 'custom',
        data: { isCustom: true }
      };

      await this.scheduleNotification(customNotification, user);

      this.analytics.logEvent('custom_notification_sent', {
        user_id: user.subjectId,
        notification_id: customNotification.id,
        title,
        scheduled_time: timestamp
      });

      return { success: true, notificationId: customNotification.id };
    } catch (error) {
      this.logger.error('Failed to publish custom notification', error);
      throw error;
    }
  }

  async cancelAllNotifications(user: Subject): Promise<any> {
    try {
      this.logger.log(`Cancelling all notifications for user: ${user.subjectId}`);

      // Filter out notifications for this user
      const initialCount = this.scheduledNotifications.length;
      this.scheduledNotifications = this.scheduledNotifications.filter(
        notification => notification.subject.subjectId !== user.subjectId
      );

      const cancelledCount = initialCount - this.scheduledNotifications.length;

      // Persist the updated list
      await this.storage.set(this.SCHEDULED_NOTIFICATIONS_KEY, this.scheduledNotifications);

      // In a real implementation, this would also cancel notifications in the OS
      // await this.cancelOSNotifications(user);

      this.analytics.logEvent('notifications_cancelled', {
        user_id: user.subjectId,
        count: cancelledCount
      });

      return { cancelled: cancelledCount };
    } catch (error) {
      this.logger.error('Failed to cancel all notifications', error);
      throw error;
    }
  }

  async cancelSingleNotification(user: Subject, notificationId: string | number): Promise<any> {
    try {
      this.logger.log(`Cancelling notification ${notificationId} for user: ${user.subjectId}`);

      const initialCount = this.scheduledNotifications.length;
      this.scheduledNotifications = this.scheduledNotifications.filter(
        notification => !(notification.subject.subjectId === user.subjectId &&
          notification.message.id === notificationId)
      );

      const cancelled = initialCount > this.scheduledNotifications.length;

      if (cancelled) {
        await this.storage.set(this.SCHEDULED_NOTIFICATIONS_KEY, this.scheduledNotifications);

        this.analytics.logEvent('notification_cancelled', {
          user_id: user.subjectId,
          notification_id: notificationId
        });
      }

      return { cancelled, notificationId };
    } catch (error) {
      this.logger.error(`Failed to cancel notification ${notificationId}`, error);
      throw error;
    }
  }

  // Additional utility methods
  async setFCMToken(token: string): Promise<void> {
    this.fcmToken = token;
    await this.storage.set(this.FCM_TOKEN_KEY, token);
    this.logger.log('FCM token updated');
  }

  async getFCMToken(): Promise<string | null> {
    return this.fcmToken;
  }

  async getScheduledNotifications(user?: Subject): Promise<ScheduledNotification[]> {
    if (user) {
      return this.scheduledNotifications.filter(
        notification => notification.subject.subjectId === user.subjectId
      );
    }
    return [...this.scheduledNotifications];
  }

  private async initializeFCM(): Promise<void> { /* no-op with RN Firebase */ }

  private async scheduleNotification(notification: NotificationMessage, user: Subject): Promise<void> {
    const scheduledNotification: ScheduledNotification = {
      id: `${user.subjectId}_${notification.id}`,
      message: notification,
      scheduledTime: notification.timestamp,
      subject: user
    };

    this.scheduledNotifications.push(scheduledNotification);
    await this.storage.set(this.SCHEDULED_NOTIFICATIONS_KEY, this.scheduledNotifications);

    // In a real implementation, this would schedule the notification with the OS
    // await this.scheduleOSNotification(scheduledNotification);

    this.logger.log(`Scheduled notification: ${notification.id} for ${new Date(notification.timestamp)}`);
  }

  private async cleanupExpiredNotifications(): Promise<void> {
    const now = Date.now();
    const initialCount = this.scheduledNotifications.length;

    this.scheduledNotifications = this.scheduledNotifications.filter(
      notification => notification.scheduledTime > now
    );

    const cleanedCount = initialCount - this.scheduledNotifications.length;

    if (cleanedCount > 0) {
      await this.storage.set(this.SCHEDULED_NOTIFICATIONS_KEY, this.scheduledNotifications);
      this.logger.log(`Cleaned up ${cleanedCount} expired notifications`);
    }
  }

  private async generateNotifications(user: Subject, limit?: number): Promise<NotificationMessage[]> {
    // This would typically fetch notifications from the backend
    // For now, we'll generate sample notifications
    const notifications: NotificationMessage[] = [];
    const maxNotifications = limit || 5;

    for (let i = 0; i < maxNotifications; i++) {
      notifications.push({
        id: `notification_${Date.now()}_${i}`,
        title: `Reminder ${i + 1}`,
        text: `Don't forget to complete your daily assessment.`,
        timestamp: Date.now() + (i + 1) * 3600000, // Every hour
        type: 'reminder',
        data: { taskType: 'assessment', priority: 'normal' }
      });
    }

    return notifications;
  }
}

export const notificationServiceFactory = (deps: {
  storage: StorageService;
  logger: LoggerService;
  remoteConfig: RemoteConfigService;
  analytics: AnalyticsService;
}) => new DefaultNotificationService(
  deps.storage,
  deps.logger,
  deps.remoteConfig,
  deps.analytics
);
