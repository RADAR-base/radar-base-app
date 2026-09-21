import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { NodeProps } from '../types';

/**
 * Root container for a screen. Renders its children inside a scrollable view. The
 * `title` prop is consumed by the `SDUIShell` for the screen header, not by this node.
 */
export function ViewNode({ node, render }: NodeProps) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View>{render(asNodeArray(node.children))}</View>
    </ScrollView>
  );
}

function asNodeArray(value: unknown): import('../../contracts/NodeSchema').Node[] | undefined {
  return Array.isArray(value) ? (value as import('../../contracts/NodeSchema').Node[]) : undefined;
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: 15,
    paddingBottom: 32,
  },
});
