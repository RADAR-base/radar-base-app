import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import type { ActionPayload, NodeProps } from '../types';

const ON_PRIMARY = '#FFFFFF';

/**
 * Tappable button. Building an `ActionPayload` from the node's props and dispatching it
 * through the engine's `ActionDispatcher`. The dispatcher handles `OpenCustomView` (push
 * onto the secondary-view stack), `Navigate` (switch active tab), `OpenExternalUrl`, and
 * `TriggerEvent` (host EventBus).
 */
export function ActionNode({ node, context }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : 'Action';
  const action = typeof node.action === 'string' ? node.action : 'TriggerEvent';
  const theme = context.theme;

  const onPress = () => {
    context.dispatch(buildAction(action, node));
  };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.button,
        {
          backgroundColor: theme.primaryColor,
          borderRadius: theme.button?.borderRadius ?? 8,
        },
      ]}
    >
      <Text style={styles.label}>{title}</Text>
    </TouchableOpacity>
  );
}

function buildAction(action: string, node: Record<string, unknown>): ActionPayload {
  switch (action) {
    case 'OpenCustomView':
      return {
        type: 'OpenCustomView',
        viewUrl: String(node.viewUrl ?? ''),
        params: isRecord(node.params) ? node.params : undefined,
      };
    case 'Navigate':
      return { type: 'Navigate', tabId: String(node.tabId ?? '') };
    case 'OpenExternalUrl':
      return { type: 'OpenExternalUrl', url: String(node.url ?? '') };
    case 'TriggerEvent':
    default:
      return {
        type: 'TriggerEvent',
        eventName: String(node.eventName ?? action),
        payload: node.payload,
      };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginTop: 4,
  },
  label: {
    color: ON_PRIMARY,
    fontSize: 15,
    fontWeight: '600',
  },
});
