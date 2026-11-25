import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NodeProps } from '../types';

/**
 * Bare-bones HealthKit node — placeholder for blueprint-driven health data display.
 * The actual HealthKit permission flow is handled by `HealthKitService` (injected via
 * `serviceOverrides.healthKit`), not by this node. This node is for rendering health
 * data widgets in dashboard blueprints once implemented.
 */
export function HealthKitNode({ node }: NodeProps) {
  const title = typeof node.title === 'string' ? node.title : 'Health Data';

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    padding: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
});
