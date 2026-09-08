import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fontFamily } from '../../theme/theme';

/**
 * Lightweight, dependency-free chart primitives used by built-in SDUI nodes such as
 * `VitalsChartNode`. They are exported from the public surface so consumer-defined nodes
 * can reuse the same minimal visuals without pulling in a charting library.
 */
export interface ChartProps {
  values: number[];
  height?: number;
  color?: string;
  showDayLabels?: boolean;
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function BarChart({ values, height = 60, color = '#8FA764', showDayLabels = true }: ChartProps) {
  const max = Math.max(1, ...values);
  const displayValues = values.length > 7 ? values.slice(-7) : values;
  return (
    <View>
      <View style={[barStyles.row, { height }]}>
        {displayValues.map((value, index) => (
          <View key={index} style={barStyles.barWrapper}>
            <View
              style={[
                barStyles.bar,
                {
                  height: (value / max) * height,
                  backgroundColor: color,
                },
              ]}
            />
          </View>
        ))}
      </View>
      {showDayLabels && (
        <View style={barStyles.labelRow}>
          {displayValues.map((_, index) => (
            <View key={index} style={barStyles.labelWrapper}>
              <Text style={barStyles.dayLabel}>
                {DAY_LABELS[index % DAY_LABELS.length]}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function Sparkline({ values, height = 32, color = '#8FA764' }: ChartProps) {
  const max = Math.max(1, ...values);
  return (
    <View style={[sparkStyles.row, { height }]}>
      {values.map((value, index) => (
        <View
          key={index}
          style={[sparkStyles.dot, { bottom: (value / max) * height, backgroundColor: color }]}
        />
      ))}
    </View>
  );
}

const barStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  barWrapper: {
    flex: 1,
    paddingHorizontal: 3,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 4,
  },
  labelRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  labelWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  dayLabel: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    includeFontPadding: false,
    fontWeight: '600',
    color: '#8E8E93',
  },
});

const sparkStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginHorizontal: 2,
    position: 'relative',
  },
});
