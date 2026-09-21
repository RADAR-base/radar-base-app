import { Linking } from 'react-native';
import type { ActionPayload } from './types';

export interface ActionDispatcherOptions {
  /** Called when an `OpenCustomView` action fires. The engine wires this to its secondary-view stack. */
  onOpenCustomView: (viewUrl: string, params?: Record<string, unknown>) => void;
  /** Called when a `Navigate` action targets a tab. */
  onNavigate: (tabId: string) => void;
  /** Optional EventBus pass-through for `TriggerEvent`. */
  onTriggerEvent?: (eventName: string, payload?: unknown) => void;
}

/**
 * Builds the `dispatch` function the engine passes to nodes through `SDUIContext`. The
 * dispatcher routes the declarative action payloads into runtime side-effects (open a
 * secondary view, switch tab, open a URL, emit an event).
 *
 * Unknown action types are logged and ignored so a forward-compatible config doesn't
 * crash older app versions.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createActionDispatcher(opts: ActionDispatcherOptions) {
  return async function dispatch(action: ActionPayload): Promise<void> {
    const a = action as Record<string, unknown> & { type: string };
    switch (a.type) {
      case 'OpenCustomView':
        opts.onOpenCustomView(
          String(a.viewUrl ?? ''),
          isRecord(a.params) ? a.params : undefined,
        );
        return;
      case 'Navigate':
        opts.onNavigate(String(a.tabId ?? ''));
        return;
      case 'OpenExternalUrl': {
        const url = String(a.url ?? '');
        if (!url) return;
        try {
          const supported = await Linking.canOpenURL(url);
          if (supported) await Linking.openURL(url);
        } catch (err) {
          console.warn('[SDUI] OpenExternalUrl failed:', err);
        }
        return;
      }
      case 'TriggerEvent':
        opts.onTriggerEvent?.(String(a.eventName ?? ''), a.payload);
        return;
      default:
        console.warn(`[SDUI] Unknown action type: ${a.type}`, action);
    }
  };
}
