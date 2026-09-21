import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NodeProps } from '@radarbase/app-kit';

/**
 * Example custom SDUI node. Registered against the manifest's `widgetsRegistry` entry
 * for `type: "CustomDemoNode"`. Use this as a template when authoring your own nodes —
 * a node component receives `node` (its blueprint slice, with all custom props from
 * the JSON), `context` (theme + dispatch + template vars), and `render` (helper for
 * recursing into `node.children` if you're building a canvas-style node).
 */
export default function CustomDemoNode({ node, context }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : 'Custom Demo Node';
  const message =
    typeof node.message === 'string'
      ? node.message
      : 'This node was registered at runtime via the manifest widgetsRegistry.';

  const accent = context.theme.primaryColor;
  const surface = context.theme.surfaceColor ?? '#eaf7ff';
  const text = context.theme.textColor ?? '#0a3d62';
  const textSecondary = context.theme.textSecondaryColor ?? text;

  return (
    <View style={[styles.container, { backgroundColor: surface, borderColor: accent }]}>
      <Text style={[styles.title, { color: text }]}>{title}</Text>
      <Text style={[styles.text, { color: textSecondary }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  title: {
    fontWeight: '700',
    marginBottom: 6,
  },
  text: {
    fontSize: 13,
  },
});
