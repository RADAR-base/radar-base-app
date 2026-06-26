import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type {
  DashboardRangeConfig,
  DashboardSeriesConfig,
  DashboardWidgetConfig,
} from '../../../types';
import { BarChart, Sparkline } from '../Charts';
import { useDashboardData } from '../useDashboardData';
import type { NodeProps } from '../types';

/**
 * Renders a vitals chart for a single metric. Three visual variants:
 *   - `mini`     — sparkline only.
 *   - `compact`  — card for horizontal "My Data" row (ring or bar chart).
 *   - `detailed` — full bar chart with title, description, and range pills.
 */
export function VitalsChartNode({ node, context }: NodeProps) {
  const vitalType = typeof node.vitalType === 'string' ? node.vitalType : 'metric';
  const variant: 'mini' | 'compact' | 'detailed' =
    node.variant === 'mini' ? 'mini' : node.variant === 'compact' ? 'compact' : 'detailed';
  const inlineValues = Array.isArray(node.values)
    ? (node.values as number[]).filter((v) => typeof v === 'number')
    : undefined;
  const label = typeof node.title === 'string' ? node.title : labelForVital(vitalType);
  const description = typeof node.description === 'string' ? node.description : undefined;
  const unit = typeof node.unit === 'string' ? node.unit : unitForVital(vitalType);

  const config: DashboardWidgetConfig = useMemo(
    () => ({
      series: [
        {
          id: vitalType,
          label,
          chartType: variant === 'mini' ? 'sparkline' : 'bar',
          unit,
          values: inlineValues,
        } satisfies DashboardSeriesConfig,
      ],
      ranges:
        variant === 'detailed' && Array.isArray(node.ranges)
          ? (node.ranges as DashboardRangeConfig[])
          : undefined,
      placeholder: inlineValues && inlineValues.length > 0 ? 'none' : 'random',
    }),
    [variant, label, unit, vitalType, inlineValues, node.ranges],
  );

  const { loading, error, series } = useDashboardData(config);
  const resolved = series[0];

  const ranges = useMemo<DashboardRangeConfig[]>(() => config.ranges ?? [], [config.ranges]);
  const [activeRangeId, setActiveRangeId] = useState<string | null>(ranges[0]?.id ?? null);
  const activeRange = useMemo<DashboardRangeConfig | null>(
    () => ranges.find((r) => r.id === activeRangeId) ?? null,
    [ranges, activeRangeId],
  );

  const theme = context.theme;
  const secondary = theme.secondaryColor ?? '#8FA764';
  const surface = theme.surfaceColor ?? '#FFFFFF';
  const text = theme.textColor ?? '#1C3549';
  const textSecondary = theme.textSecondaryColor ?? '#8E8E93';
  const background = theme.backgroundColor ?? '#EDF1F5';
  const radius = theme.button?.borderRadius ?? 12;

  const values = useMemo(() => {
    if (!resolved) return [];
    return activeRange ? resolved.values.slice(-activeRange.bucketCount) : resolved.values;
  }, [resolved, activeRange]);
  const lastValue = values.length > 0 ? values[values.length - 1] : null;
  const chartColor = resolved?.color ?? secondary;

  // Color overrides for specific vital types
  const ringColor = vitalType === 'stress' ? '#C9A96E' : chartColor;

  // ── Compact: card for horizontal "My Data" scroll ──
  if (variant === 'compact') {
    const useBarChart = vitalType === 'steps';
    const score = lastValue ?? (values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 70);

    return (
      <View style={[styles.compactCard, { backgroundColor: surface, borderRadius: radius }]}>
        <View style={styles.compactHeader}>
          <Text style={[styles.compactLabel, { color: text }]}>{label}</Text>
          <Text style={[styles.compactArrow, { color: textSecondary }]}>{'\u2192'}</Text>
        </View>
        {useBarChart ? (
          <View style={styles.compactChartArea}>
            <BarChart values={values.length > 0 ? values.slice(-7) : [40, 65, 50, 70, 80, 45, 60]} height={50} color={chartColor} />
          </View>
        ) : (
          <View style={styles.ringContainer}>
            <CircleProgress size={80} strokeWidth={8} progress={Math.min(1, score / 100)} color={ringColor} />
            <Text style={[styles.ringValue, { color: text }]}>{Math.round(score)}</Text>
          </View>
        )}
      </View>
    );
  }

  // ── Detailed: full-width card ──
  return (
    <View style={[styles.container, { backgroundColor: surface, borderRadius: radius }]}>
      <Text style={[styles.title, { color: text }]}>{label}</Text>
      {description && (
        <Text style={[styles.description, { color: textSecondary }]}>{description}</Text>
      )}

      {ranges.length > 0 && (
        <View style={styles.rangeRow}>
          {ranges.map((range) => {
            const isActive = range.id === activeRangeId;
            return (
              <TouchableOpacity
                key={range.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => setActiveRangeId(range.id)}
                style={[
                  styles.rangePill,
                  { backgroundColor: isActive ? secondary : background },
                ]}
              >
                <Text
                  style={[styles.rangeText, { color: isActive ? '#FFFFFF' : textSecondary }]}
                >
                  {range.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {loading && values.length === 0 && (
        <Text style={[styles.statusText, { color: textSecondary }]}>Loading data...</Text>
      )}
      {error && <Text style={styles.errorText}>Error: {error}</Text>}

      {values.length > 0 && (
        <>
          {lastValue !== null && (
            <Text style={[styles.lastValue, { color: textSecondary }]}>
              {formatNumber(lastValue)}
              {unit ? ` ${unit}` : ''}
            </Text>
          )}
          {variant === 'mini' ? (
            <Sparkline values={values} color={chartColor} />
          ) : (
            <BarChart values={values} color={chartColor} />
          )}
        </>
      )}

      {!loading && !error && values.length === 0 && (
        <Text style={[styles.statusText, { color: textSecondary }]}>No data available.</Text>
      )}
    </View>
  );
}

/**
 * Minimal circular progress ring using bordered Views.
 */
function CircleProgress({
  size,
  strokeWidth,
  progress,
  color,
}: {
  size: number;
  strokeWidth: number;
  progress: number;
  color: string;
}) {
  const trackColor = '#E8F0E0';
  const r = size / 2;
  return (
    <View style={{ width: size, height: size }}>
      {/* Track */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: r,
          borderWidth: strokeWidth,
          borderColor: trackColor,
        }}
      />
      {/* Fill — right half */}
      <View style={{ position: 'absolute', width: size, height: size, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', width: r, height: size, left: r, overflow: 'hidden' }}>
          <View
            style={{
              width: size,
              height: size,
              borderRadius: r,
              borderWidth: strokeWidth,
              borderColor: color,
              right: r,
              transform: [{ rotate: `${Math.min(progress, 0.5) * 360}deg` }],
            }}
          />
        </View>
        {progress > 0.5 && (
          <View style={{ position: 'absolute', width: r, height: size, overflow: 'hidden' }}>
            <View
              style={{
                width: size,
                height: size,
                borderRadius: r,
                borderWidth: strokeWidth,
                borderColor: color,
                transform: [{ rotate: `${(progress - 0.5) * 360}deg` }],
              }}
            />
          </View>
        )}
      </View>
    </View>
  );
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function labelForVital(vital: string): string {
  switch (vital) {
    case 'heart_rate': return 'Heart Rate';
    case 'sleep_minutes':
    case 'sleep_hours': return 'Sleep';
    case 'steps': return 'Steps';
    case 'spo2': return 'Blood Oxygen';
    case 'stress': return 'Stress';
    default: return vital.replace(/_/g, ' ');
  }
}

function unitForVital(vital: string): string | undefined {
  switch (vital) {
    case 'heart_rate': return 'bpm';
    case 'sleep_minutes': return 'min';
    case 'steps': return 'steps';
    case 'spo2': return '%';
    default: return undefined;
  }
}

const styles = StyleSheet.create({
  /* Detailed */
  container: {
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  description: { fontSize: 12, marginBottom: 10 },
  rangeRow: { flexDirection: 'row', marginBottom: 12, flexWrap: 'wrap', gap: 6 },
  rangePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  rangeText: { fontSize: 12, fontWeight: '600' },
  lastValue: { fontSize: 12, marginBottom: 6 },
  statusText: { fontSize: 13, fontStyle: 'italic', marginVertical: 6 },
  errorText: { fontSize: 13, color: '#dc3545', marginVertical: 6 },
  /* Compact */
  compactCard: {
    width: 145,
    padding: 12,
    marginRight: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  compactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  compactLabel: { fontSize: 13, fontWeight: '600' },
  compactArrow: { fontSize: 16 },
  compactChartArea: {
    paddingTop: 4,
  },
  ringContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    position: 'absolute',
    fontSize: 22,
    fontWeight: '700',
  },
});
