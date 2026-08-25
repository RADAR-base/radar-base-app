import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ActionPayload } from './types';
import type { AppManifest } from '../contracts/ManifestSchema';
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

/**
 * Placeholder notifications for building/demoing the UI. Generated relative to *now* so the "Today"
 * section is always populated. TODO: replace `buildDemoNotifications` with a real source once the
 * server endpoint exists — `AppServerService` already has `pullAllPublishedNotifications` /
 * `updateNotificationState`; wire those in `NotificationsProvider` (map their DTO → `AppNotification`)
 * and back `markRead` with `updateNotificationState`. Nothing else changes.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

function at(dayOffset: number, hour: number, minute: number): number {
  const d = new Date(Date.now() - dayOffset * DAY_MS);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

function buildDemoNotifications(): AppNotification[] {
  return [
    {
      id: 'n1',
      type: 'expired',
      title: 'Task expired',
      description: 'Your daily questionnaire window has closed for today.',
      timestamp: at(0, 9, 0),
      read: false,
      action: { type: 'Navigate', tabId: 'tab_calendar' },
    },
    {
      id: 'n2',
      type: 'default',
      title: 'Daily tasks ready',
      description: 'You have tasks due today — tap to view your dashboard.',
      timestamp: at(0, 8, 0),
      read: true,
      action: { type: 'Navigate', tabId: 'tab_home' },
    },
    {
      id: 'n3',
      type: 'warning',
      title: 'Reading out of range',
      description: 'A recent measurement was outside the expected range.',
      timestamp: at(1, 14, 30),
      read: true,
      action: { type: 'OpenCustomView', viewUrl: 'views/secondary/settings.json' },
    },
    {
      id: 'n4',
      type: 'info',
      title: 'New study resource',
      description: 'A new article is available in your study materials.',
      timestamp: at(2, 10, 0),
      read: true,
      action: { type: 'OpenCustomView', viewUrl: 'views/secondary/inbox-history.json' },
    },
  ];
}

type ManifestAlerts = AppManifest['alerts'];

/** Reads a string field off a passthrough alert action/rule — the schema only types `type`, so the
 *  rest (`title`, `body`, `message`, `severity`) come through untyped. */
function alertString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}

/** The notification look (icon + color) for an alert action — severity wins, otherwise a plain bell. */
function alertNotificationType(action: Record<string, unknown>): NotificationType {
  const severity = alertString(action, 'severity')?.toLowerCase();
  if (severity === 'warning' || severity === 'error' || severity === 'critical') return 'warning';
  if (severity === 'info') return 'info';
  return 'default';
}

/** Fallback title for actions that carry only a message (e.g. `ShowBanner` has `severity` + `message`
 *  but no `title`): the capitalized severity, else the action `type`. */
function alertNotificationTitle(action: Record<string, unknown>): string {
  const severity = alertString(action, 'severity');
  if (severity) return severity.charAt(0).toUpperCase() + severity.slice(1);
  return alertString(action, 'type') ?? 'Notification';
}

/**
 * Builds the notifications list from the manifest's `alerts` block. Each rule's `actions[]` becomes a
 * notification, read straight off the action: `type` (→ icon/color), `title`, and `body` (falling back
 * to `message`). An action with no `body`/`message` is skipped — it isn't a user-facing notification
 * (e.g. `AddTask`, which only schedules a task). Alerts carry no timestamp, so entries are staggered a
 * minute apart to keep the day grouping and order stable. Returns `[]` when `alerts` is absent/disabled.
 */
export function notificationsFromAlerts(alerts: ManifestAlerts): AppNotification[] {
  if (!alerts?.enabled || !alerts.rules?.length) return [];
  const out: AppNotification[] = [];
  for (const rule of alerts.rules) {
    for (const rawAction of rule.actions ?? []) {
      const action = rawAction as Record<string, unknown>;
      const title = alertString(action, 'title');
      const message = alertString(action, 'body') ?? alertString(action, 'message');
      if (!message) continue;
      out.push({
        id: `${rule.id}-${alertString(action, 'type') ?? 'action'}-${out.length}`,
        type: alertNotificationType(action),
        title: title ?? alertNotificationTitle(action),
        description: message ?? '',
        timestamp: Date.now() - out.length * 60_000,
        read: false,
      });
    }
  }
  return out;
}

interface NotificationsValue {
  notifications: AppNotification[];
  markRead: (id: string) => void;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

/**
 * Holds the notification state, shared so the notifications page and the header bell's unread dot read
 * the same data. Wrap the app once — `SDUIShell` does, passing the manifest's `alerts`.
 *
 * The list is built from the manifest's alert actions (see {@link notificationsFromAlerts}); when the
 * manifest declares no alerts it falls back to {@link buildDemoNotifications} so the page isn't empty
 * during development. `alerts` is read once at mount (it doesn't change within a session).
 */
export function NotificationsProvider({
  children,
  alerts,
}: {
  children: React.ReactNode;
  alerts?: ManifestAlerts;
}) {
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    const fromAlerts = notificationsFromAlerts(alerts);
    return fromAlerts.length > 0 ? fromAlerts : buildDemoNotifications();
  });
  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  // A task becoming ready (its completion window opens) adds a notification card. `ScheduleService`
  // emits TASK_READY once per task; the id guard also drops any duplicate on re-subscribe.
  const { eventBus } = useCoreServices();
  useEffect(() => {
    const handler = (payload: { instanceId?: string; title?: string }) => {
      const instanceId = typeof payload?.instanceId === 'string' ? payload.instanceId : undefined;
      if (!instanceId) return;
      const id = `ready-${instanceId}`;
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
 * Notifications data + actions from the shared provider. Falls back to its own in-memory state when
 * there's no provider (e.g. a node rendered in isolation / tests) so the hook always works.
 */
export function useNotifications(): NotificationsValue {
  const ctx = useContext(NotificationsContext);
  const [local, setLocal] = useState<AppNotification[]>(buildDemoNotifications);
  const localMarkRead = useCallback((id: string) => {
    setLocal((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);
  return ctx ?? { notifications: local, markRead: localMarkRead };
}

/** Number of unread notifications — drives the header bell's red dot. */
export function useUnreadNotificationCount(): number {
  const { notifications } = useNotifications();
  return notifications.reduce((count, n) => (n.read ? count : count + 1), 0);
}
