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

const ON_PRIMARY = '#FFFFFF';

/**
 * Renders a vitals chart for a single metric. Two visual variants:
 *   - `mini`     — sparkline only, no title or range pills (suitable as a card body).
 *   - `detailed` — bar chart with title, description, and optional range pills.
 *
 * Data resolution falls through (in order of precedence):
 *   1. inline `values` declared in the blueprint,
 *   2. an API `dataSource` (uses `useDashboardData` under the hood),
 *   3. randomized placeholder data when `placeholder: 'random'`.
 *
 * Until the health data layer lands (Phase 4), most authors will use inline `values`.
 */
export function VitalsChartNode({ node, context }: NodeProps) {
  const vitalType = typeof node.vitalType === 'string' ? node.vitalType : 'metric';
  const variant: 'mini' | 'detailed' = node.variant === 'mini' ? 'mini' : 'detailed';
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
  const primary = theme.primaryColor;
  const surface = theme.surfaceColor ?? '#FFFFFF';
  const text = theme.textColor ?? '#000';
  const textSecondary = theme.textSecondaryColor ?? '#6D6D80';
  const background = theme.backgroundColor ?? '#F2F2F7';
  const radius = theme.button?.borderRadius ?? 8;

  const values = useMemo(() => {
    if (!resolved) return [];
    return activeRange ? resolved.values.slice(-activeRange.bucketCount) : resolved.values;
  }, [resolved, activeRange]);
  const lastValue = values.length > 0 ? values[values.length - 1] : null;
  const chartColor = resolved?.color ?? primary;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: surface, borderColor: primary, borderRadius: radius },
      ]}
    >
      {variant === 'detailed' && (
        <>
          <Text style={[styles.title, { color: text }]}>{label}</Text>
          {description && (
            <Text style={[styles.description, { color: textSecondary }]}>{description}</Text>
          )}
        </>
      )}

      {variant === 'detailed' && ranges.length > 0 && (
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
                  { backgroundColor: isActive ? primary : background },
                ]}
              >
                <Text
                  style={[styles.rangeText, { color: isActive ? ON_PRIMARY : textSecondary }]}
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
          {lastValue !== null && variant === 'detailed' && (
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

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function labelForVital(vital: string): string {
  switch (vital) {
    case 'heart_rate':
      return 'Heart Rate';
    case 'sleep_minutes':
      return 'Sleep';
    case 'steps':
      return 'Steps';
    case 'spo2':
      return 'Blood Oxygen';
    default:
      return vital.replace(/_/g, ' ');
  }
}

function unitForVital(vital: string): string | undefined {
  switch (vital) {
    case 'heart_rate':
      return 'bpm';
    case 'sleep_minutes':
      return 'min';
    case 'steps':
      return 'steps';
    case 'spo2':
      return '%';
    default:
      return undefined;
  }
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, padding: 12, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  description: { fontSize: 12, marginBottom: 10 },
  rangeRow: { flexDirection: 'row', marginBottom: 12, flexWrap: 'wrap', gap: 6 },
  rangePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  rangeText: { fontSize: 12, fontWeight: '600' },
  lastValue: { fontSize: 12, marginBottom: 6 },
  statusText: { fontSize: 13, fontStyle: 'italic', marginVertical: 6 },
  errorText: { fontSize: 13, color: '#dc3545', marginVertical: 6 },
});
