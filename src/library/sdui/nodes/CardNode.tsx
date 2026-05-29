import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Node } from '../../contracts/NodeSchema';
import type { NodeProps } from '../types';

/**
 * Elevated surface holding one or more child nodes. Use this when the children should
 * read as a discrete unit (e.g. a daily-check prompt with an action button).
 */
export function CardNode({ node, context, render }: NodeProps) {
  const theme = context.theme;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surfaceColor ?? '#fff',
          borderRadius: theme.button?.borderRadius ?? 8,
        },
      ]}
    >
      {render(asNodeArray(node.children))}
    </View>
  );
}

function asNodeArray(value: unknown): Node[] | undefined {
  return Array.isArray(value) ? (value as Node[]) : undefined;
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
});
