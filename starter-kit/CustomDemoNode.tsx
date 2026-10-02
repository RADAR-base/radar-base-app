import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  tracking,
  fontFamily,
  getColorTokens,
  layout as layoutTokens,
  cardShadow,
} from '@radarbase/app-kit';
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
  const description =
    typeof node.description === 'string'
      ? node.description
      : 'This node was registered at runtime via the manifest widgetsRegistry.';

  const tokens = getColorTokens(context.colorScheme ?? 'light', context.theme.brandColors);

  return (
    <View style={[styles.card, { backgroundColor: tokens.card.stats.background }]}>
      <Text style={[styles.title, { color: tokens.text.primary }]}>{title}</Text>
      <Text style={[styles.description, { color: tokens.card.stats.description }]}>
        {description}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: layoutTokens.radiusCard,
    padding: layoutTokens.cardPadding,
    gap: layoutTokens.gap,
    ...cardShadow,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    letterSpacing: tracking.bold,
    includeFontPadding: false,
  },
  description: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
});
