import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ActionPayload } from './types';
import { useCoreServices } from '../../core/CoreServicesContext';
import { EVENTS } from '../../core/EventBus';

export type NotificationType = 'default' | 'warning' | 'expired' | 'info';

export interface AppNotification {
  id: string;
  /** Drives the icon + color (see `NotificationType` in `NotificationListNode`). */
  type: NotificationType;
  title: string;
  description: string;
  /** Epoch ms — drives both the day grouping and the time label. */
  timestamp: number;
  read: boolean;
  /** Where the card's arrow button takes the user (dispatched via `SDUIContext.dispatch`). */
  action?: ActionPayload;
}

/** Maximum number of notifications to fetch from the server. */
const FETCH_LIMIT = 10;

// ---------------------------------------------------------------------------
// AppServer DTO → AppNotification mapping
// ---------------------------------------------------------------------------

/** Shape returned by `GET /projects/{p}/users/{s}/messaging/notifications`. */
interface ServerNotificationDto {
  id: number | string;
  title?: string;
  body?: string;
  message?: string;
  type?: string;
  scheduledTime?: string;
  createdAt?: string;
  updatedAt?: string;
  delivered?: boolean;
  /** `true` when the server already knows the user opened it. */
  read?: boolean;
  /** AppServer state: DELIVERED, READ, DISMISSED, etc. */
  state?: string;
}

function serverTypeToNotificationType(serverType?: string): NotificationType {
  if (!serverType) return 'default';
  const t = serverType.toLowerCase();
  if (t === 'warning' || t === 'error' || t === 'critical' || t === 'alert') return 'warning';
  if (t === 'info' || t === 'information') return 'info';
  if (t === 'expired') return 'expired';
  return 'default';
}

function mapServerNotification(dto: ServerNotificationDto): AppNotification {
  const ts = dto.scheduledTime ?? dto.createdAt ?? dto.updatedAt;
  return {
    id: String(dto.id),
    type: serverTypeToNotificationType(dto.type),
    title: dto.title ?? 'Notification',
    description: dto.body ?? dto.message ?? '',
    timestamp: ts ? new Date(ts).getTime() : Date.now(),
    read: dto.read ?? dto.state === 'READ' ?? false,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface NotificationsValue {
  notifications: AppNotification[];
  markRead: (id: string) => void;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

/**
 * Fetches the most recent notifications from the AppServer
 * (`/projects/{p}/users/{s}/messaging/notifications`) and exposes them via context.
 *
 * `markRead` optimistically updates the local state and fires
 * `AppServerService.updateNotificationState` in the background.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const { appServer, subjectConfig, eventBus } = useCoreServices();
  const fetchedRef = useRef(false);

  // Fetch from AppServer on mount
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    (async () => {
      try {
        const [subjectId, projectId] = await Promise.all([
          subjectConfig.getParticipantLogin(),
          subjectConfig.getProjectName(),
        ]);

        if (!subjectId || subjectId === 'anonymous' || !projectId || projectId === 'default') {
          return;
        }

        const response = await appServer.pullAllPublishedNotifications({ projectId, subjectId });
        const dtos: ServerNotificationDto[] = Array.isArray(response?.notifications)
          ? response.notifications
          : Array.isArray(response)
            ? response
            : [];

        const now = Date.now();
        const mapped = dtos
          .map(mapServerNotification)
          .filter((n) => n.timestamp <= now)
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, FETCH_LIMIT);

        setNotifications(mapped);
      } catch {
        // Server unreachable — list stays empty until task-ready events arrive
      }
    })();
  }, [appServer, subjectConfig]);

  // Mark as read — optimistic local update + server call
  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));

    (async () => {
      try {
        const [subjectId, projectId] = await Promise.all([
          subjectConfig.getParticipantLogin(),
          subjectConfig.getProjectName(),
        ]);
        if (subjectId && subjectId !== 'anonymous' && projectId && projectId !== 'default') {
          await appServer.updateNotificationState({ projectId, subjectId }, id, 'READ');
        }
      } catch {
        // Best-effort — local state already updated
      }
    })();
  }, [appServer, subjectConfig]);

  // Live: task-ready events add notification cards
  useEffect(() => {
    const handler = (payload: { taskId?: string; title?: string }) => {
      const taskId = typeof payload?.taskId === 'string' ? payload.taskId : undefined;
      if (!taskId) return;
      const id = `ready-${taskId}`;
      const title =
        typeof payload?.title === 'string' && payload.title.length > 0 ? payload.title : 'Task';
      setNotifications((prev) => {
        if (prev.some((n) => n.id === id)) return prev;
        const card: AppNotification = {
          id,
          type: 'default',
          title,
          description: 'This task is ready to complete. Begin whenever you are ready.',
          timestamp: Date.now(),
          read: false,
          action: { type: 'Navigate', tabId: 'tab_home' },
        };
        return [card, ...prev];
      });
    };
    eventBus.on(EVENTS.TASK_READY, handler);
    return () => eventBus.off(EVENTS.TASK_READY, handler);
  }, [eventBus]);

  const value = useMemo(() => ({ notifications, markRead }), [notifications, markRead]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

/**
 * Notifications data + actions from the shared provider. Falls back to empty state when
 * there's no provider (e.g. a node rendered in isolation / tests).
 */
export function useNotifications(): NotificationsValue {
  const ctx = useContext(NotificationsContext);
  const [local] = useState<AppNotification[]>([]);
  const localMarkRead = useCallback((_id: string) => {}, []);
  return ctx ?? { notifications: local, markRead: localMarkRead };
}

/** Number of unread notifications — drives the header bell's red dot. */
export function useUnreadNotificationCount(): number {
  const { notifications } = useNotifications();
  return notifications.reduce((count, n) => (n.read ? count : count + 1), 0);
}
