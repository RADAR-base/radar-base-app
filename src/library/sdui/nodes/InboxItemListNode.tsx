import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Node } from '../../contracts/NodeSchema';
import type { NodeProps } from '../types';

/**
 * Per-category inbox list (Tasks / Updates / Reminders). MVP renders a placeholder card
 * showing the configured filters; a future iteration will plug in a real inbox data
 * provider. Used by `InboxItemListCoordinatorNode` as a child.
 */
export function InboxItemListNode({ node, context }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : 'Inbox';
  const filter = isRecord(node.filter) ? node.filter : {};
  const theme = context.theme;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.surfaceColor ?? '#fff' },
      ]}
    >
      <Text style={[styles.title, { color: theme.textColor ?? '#000' }]}>{title}</Text>
      <Text style={[styles.body, { color: theme.textSecondaryColor ?? '#6D6D80' }]}>
        Filters: {summarizeFilter(filter)}
      </Text>
      <Text style={[styles.placeholder, { color: theme.textSecondaryColor ?? '#6D6D80' }]}>
        Inbox data provider not yet wired (Phase 4).
      </Text>
    </View>
  );
}

function summarizeFilter(filter: Record<string, unknown>): string {
  if (Object.keys(filter).length === 0) return '(none)';
  return Object.entries(filter)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : String(v)}`)
    .join(', ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Exported only because `InboxItemListCoordinatorNode` consumes the same Node shape
export type { Node };

const styles = StyleSheet.create({
  container: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#1C3549',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  body: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  placeholder: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
