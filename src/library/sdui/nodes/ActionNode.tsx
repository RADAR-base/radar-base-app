import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import type { ActionPayload, NodeProps } from '../types';
import { fontFamily } from '../../../theme/theme';

/**
 * Tappable button. Supports two visual variants:
 *   - `filled` (default) — solid primary background
 *   - `outline` — bordered with transparent background
 */
export function ActionNode({ node, context }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : 'Action';
  const action = typeof node.action === 'string' ? node.action : 'TriggerEvent';
  const variant = node.variant === 'outline' ? 'outline' : 'filled';
  const theme = context.theme;

  const onPress = () => {
    context.dispatch(buildAction(action, node));
  };

  const radius = theme.button?.borderRadius ?? 12;

  if (variant === 'outline') {
    return (
      <TouchableOpacity
        accessibilityRole="button"
        onPress={onPress}
        style={[
          styles.button,
          styles.outlineButton,
          { borderColor: theme.primaryColor, borderRadius: radius },
        ]}
      >
        <Text style={[styles.label, { color: theme.primaryColor }]}>{title}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: theme.primaryColor, borderRadius: radius },
      ]}
    >
      <Text style={[styles.label, { color: '#FFFFFF' }]}>{title}</Text>
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
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  label: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
    includeFontPadding: false,
    fontWeight: '600',
  },
});
