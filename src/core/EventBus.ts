// import mitt, { Emitter } from 'mitt'; // Will be available after npm install
import { EventBus as EventBusInterface } from '../types/index';

type Events = {
  [event: string]: any;
};

// Simple event emitter implementation (will be replaced with mitt after install)
class SimpleEmitter {
  private events: { [key: string]: Function[] } = {};

  emit(event: string, data?: any): void {
    if (this.events[event]) {
      this.events[event].forEach(handler => handler(data));
    }
  }

  on(event: string, handler: Function): void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(handler);
  }

  off(event: string, handler: Function): void {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter(h => h !== handler);
    }
  }
}

class EventBusImpl implements EventBusInterface {
  private emitter: SimpleEmitter;

  constructor() {
    this.emitter = new SimpleEmitter();
  }

  emit<T = any>(event: string, data?: T): void {
    this.emitter.emit(event, data);
  }

  on<T = any>(event: string, handler: (data: T) => void): void {
    this.emitter.on(event, handler);
  }

  off<T = any>(event: string, handler: (data: T) => void): void {
    this.emitter.off(event, handler);
  }

  once<T = any>(event: string, handler: (data: T) => void): void {
    const wrappedHandler = (data: T) => {
      handler(data);
      this.emitter.off(event, wrappedHandler);
    };
    this.emitter.on(event, wrappedHandler);
  }
}

// Singleton instance
export const eventBus = new EventBusImpl();

// Common event constants
export const EVENTS = {
  // Navigation Events
  NAVIGATE: 'navigate',
  GO_BACK: 'goBack',
  
  // Data Events
  DATA_UPDATED: 'dataUpdated',
  DATA_SYNCED: 'dataSynced',
  
  // Task Events
  TASK_STARTED: 'taskStarted',
  TASK_COMPLETED: 'taskCompleted',
  TASK_SKIPPED: 'taskSkipped',
  
  // Auth Events
  AUTH_STATE_CHANGED: 'authStateChanged',
  LOGIN_SUCCESS: 'loginSuccess',
  LOGOUT: 'logout',
  
  // Notification Events
  NOTIFICATION_RECEIVED: 'notificationReceived',
  NOTIFICATION_CLICKED: 'notificationClicked',
  
  // Widget Events
  WIDGET_MOUNTED: 'widgetMounted',
  WIDGET_UNMOUNTED: 'widgetUnmounted',
  WIDGET_CONFIG_CHANGED: 'widgetConfigChanged',
  
  // App Events
  APP_STATE_CHANGED: 'appStateChanged',
  THEME_CHANGED: 'themeChanged',
  CONFIG_RELOADED: 'configReloaded',
} as const;

export type EventType = typeof EVENTS[keyof typeof EVENTS]; 