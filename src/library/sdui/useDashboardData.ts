import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApiService } from '../../core/CoreServicesContext';
import type {
  DashboardWidgetConfig,
  DashboardSeriesConfig,
} from '../../types';

export interface ResolvedSeries {
  id: string;
  label: string;
  chartType: DashboardSeriesConfig['chartType'];
  color?: string;
  unit?: string;
  values: number[];
}

export interface DashboardDataState {
  loading: boolean;
  error: string | null;
  series: ResolvedSeries[];
  refresh: () => Promise<void>;
}

/**
 * Resolves a `DashboardWidgetConfig` into renderable numeric arrays per series.
 *
 * Precedence per series (highest first):
 *   1. `series[i].values`   — inline data, no I/O.
 *   2. `series[i].responseField` + `config.dataSource` — fetched from the API.
 *   3. `config.placeholder === 'random'` — synthesized values for previews.
 *   4. Empty array.
 *
 * Used by `VitalsChartNode` and available to custom nodes that need the same shape of
 * "one or more numeric series with optional remote fetch" data resolution. Range
 * selection, smoothing, and theming are the consumer's responsibility.
 */
export function useDashboardData(config: DashboardWidgetConfig): DashboardDataState {
  const api = useApiService();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiResponse, setApiResponse] = useState<unknown[] | null>(null);

  const needsFetch = useMemo(
    () =>
      Boolean(
        config.dataSource &&
          config.series.some((s) => !s.values && s.responseField !== undefined),
      ),
    [config.dataSource, config.series],
  );

  // Stable reference to the latest config — used inside the refresh callback so we can
  // refetch on demand without resubscribing.
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const refresh = useCallback(async () => {
    const current = configRef.current;
    if (!current.dataSource) return;
    setLoading(true);
    setError(null);
    try {
      const { endpoint, method = 'GET', body } = current.dataSource;
      const response =
        method === 'POST'
          ? await api.post<unknown>(endpoint, body ?? {})
          : await api.get<unknown>(endpoint);
      setApiResponse(Array.isArray(response) ? response : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard data.');
      setApiResponse([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!needsFetch) return;
    refresh();
    const interval = config.dataSource?.refreshIntervalMs;
    if (!interval || interval <= 0) return;
    const timer = setInterval(refresh, interval);
    return () => clearInterval(timer);
  }, [needsFetch, refresh, config.dataSource?.refreshIntervalMs]);

  const series = useMemo<ResolvedSeries[]>(
    () =>
      config.series.map((s) =>
        resolveSeries(s, {
          dataSource: config.dataSource,
          apiResponse,
          placeholder: config.placeholder ?? 'none',
        }),
      ),
    [config.series, config.dataSource, config.placeholder, apiResponse],
  );

  return { loading, error, series, refresh };
}

interface ResolutionContext {
  dataSource: DashboardWidgetConfig['dataSource'];
  apiResponse: unknown[] | null;
  placeholder: NonNullable<DashboardWidgetConfig['placeholder']>;
}

function resolveSeries(
  series: DashboardSeriesConfig,
  ctx: ResolutionContext,
): ResolvedSeries {
  const base: Omit<ResolvedSeries, 'values'> = {
    id: series.id,
    label: series.label,
    chartType: series.chartType,
    color: series.color,
    unit: series.unit,
  };

  if (series.values && series.values.length > 0) {
    return { ...base, values: series.values };
  }

  if (series.responseField && ctx.dataSource && ctx.apiResponse) {
    return { ...base, values: extractFromResponse(series, ctx) };
  }

  if (ctx.placeholder === 'random') {
    return { ...base, values: synthesize(30, 60, 20) };
  }

  return { ...base, values: [] };
}

function extractFromResponse(
  series: DashboardSeriesConfig,
  ctx: ResolutionContext,
): number[] {
  const metricField = ctx.dataSource?.metricField ?? 'metric';
  const valueField = ctx.dataSource?.valueField ?? 'value';
  const target = series.responseField!.metric;
  const field = series.responseField!.field ?? valueField;

  const filtered = (ctx.apiResponse ?? [])
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .filter((item) => item[metricField] === target);

  return filtered.map((item) => toNumber(item[field])).filter((v): v is number => v !== null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function synthesize(length: number, base: number, jitter: number): number[] {
  return Array.from({ length }, () => base + (Math.random() * jitter - jitter / 2));
}
