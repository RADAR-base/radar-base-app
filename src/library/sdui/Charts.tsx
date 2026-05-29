import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * Lightweight, dependency-free chart primitives used by built-in SDUI nodes such as
 * `VitalsChartNode`. They are exported from the public surface so consumer-defined nodes
 * can reuse the same minimal visuals without pulling in a charting library.
 */
export interface ChartProps {
  values: number[];
  height?: number;
  color?: string;
}

export function BarChart({ values, height = 60, color = '#007AFF' }: ChartProps) {
  const max = Math.max(1, ...values);
  return (
    <View style={[styles.row, { height }]}>
      {values.map((value, index) => (
        <View key={index} style={styles.barWrapper}>
          <View style={[styles.bar, { height: (value / max) * height, backgroundColor: color }]} />
        </View>
      ))}
    </View>
  );
}

export function Sparkline({ values, height = 32, color = '#AF52DE' }: ChartProps) {
  const max = Math.max(1, ...values);
  return (
    <View style={[styles.row, { height }]}>
      {values.map((value, index) => (
        <View
          key={index}
          style={[styles.dot, { bottom: (value / max) * height, backgroundColor: color }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  barWrapper: {
    flex: 1,
    paddingHorizontal: 2,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginHorizontal: 2,
    position: 'relative',
  },
});
