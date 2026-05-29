import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Node } from '../../contracts/NodeSchema';
import type { NodeProps } from '../types';

/**
 * Logical grouping with an optional header. Visually similar to a card but without
 * elevation — best for related items that should read as one unit but don't need a
 * surface treatment (e.g. a "Research Tasks" subgroup on the home screen).
 */
export function SectionNode({ node, context, render }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : undefined;
  const theme = context.theme;
  return (
    <View style={styles.container}>
      {title && (
        <Text style={[styles.title, { color: theme.textColor ?? '#000' }]}>{title}</Text>
      )}
      <View>{render(asNodeArray(node.children))}</View>
    </View>
  );
}

function asNodeArray(value: unknown): Node[] | undefined {
  return Array.isArray(value) ? (value as Node[]) : undefined;
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
