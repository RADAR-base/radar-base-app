import { useEffect, useMemo, useState } from 'react';

/** The period data cards show, chosen with the Day / Week / Month filter. */
export type DataRange = 'day' | 'week' | 'month';

export const DATA_RANGES: DataRange[] = ['day', 'week', 'month'];

// One range for the app: the filter and the cards it drives are siblings, with no shared parent to
// hold it in context.
let current: DataRange = 'week';
/** Whether the participant has picked one, after which a blueprint's default no longer applies. */
let chosen = false;
const listeners = new Set<(range: DataRange) => void>();

export function getDataRange(): DataRange {
  return current;
}

function publish(range: DataRange): void {
  if (range === current) return;
  current = range;
  listeners.forEach((listener) => listener(range));
}

/** The participant's choice. */
export function setDataRange(range: DataRange): void {
  chosen = true;
  publish(range);
}

/** A blueprint's starting range; ignored once the participant has chosen one. */
export function setDefaultDataRange(range: DataRange): void {
  if (!chosen) publish(range);
}

export function useDataRange(): DataRange {
  const [range, setRange] = useState(current);
  useEffect(() => {
    listeners.add(setRange);
    // It may have changed between render and subscribing.
    setRange(current);
    return () => {
      listeners.delete(setRange);
    };
  }, []);
  return range;
}

// ---------------------------------------------------------------------------
// Per-range props
// ---------------------------------------------------------------------------

export function isDataRange(value: unknown): value is DataRange {
  return typeof value === 'string' && (DATA_RANGES as string[]).includes(value);
}

/** A prop written per range: `{ "day": …, "week": …, "month": … }`. */
export function isRanged(value: unknown): value is Partial<Record<DataRange, unknown>> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    DATA_RANGES.some((range) => range in (value as object))
  );
}

/** The props a data card may write per range. */
const RANGED_KEYS = [
  'values',
  'value',
  'target',
  'title',
  'description',
  'labels',
  'summary',
  'periodLabel',
  'highlight',
  'reference',
  'usualRange',
  'stages',
  'barColor',
] as const;

/**
 * The node with each per-range prop replaced by the current range's entry, so a card reads its
 * props as before. A range the blueprint leaves out falls back to `week`, then to any entry.
 */
export function useRangedNode<T extends Record<string, unknown>>(node: T): T {
  const range = useDataRange();
  return useMemo(() => {
    let resolved: T | null = null;
    for (const key of RANGED_KEYS) {
      const prop = node[key];
      if (!isRanged(prop)) continue;
      resolved ??= { ...node };
      (resolved as Record<string, unknown>)[key] =
        prop[range] ?? prop.week ?? Object.values(prop)[0];
    }
    return resolved ?? node;
  }, [node, range]);
}
