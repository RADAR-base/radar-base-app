import type { DataRange } from '../../dataRange';

/** Shared by the data cards' charts: period names, axis ticks and the label row. */

export const PERIOD_LABELS: Record<DataRange, string> = {
  day: 'Today',
  week: 'This week',
  month: 'This month',
};
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MAX_LABELS = 7;

/**
 * The row under the plot. A blueprint's `labels` win when there's one per point; otherwise a week is
 * M–S, a day is hours and a month is weeks ("W1" …) or, past six points, dates. Past a week's worth,
 * every k-th label is kept and the rest left blank.
 */
export function xLabels(range: DataRange, count: number, custom: unknown): string[] {
  if (Array.isArray(custom) && custom.length === count && custom.every((l) => typeof l === 'string')) {
    return custom as string[];
  }
  if (range === 'week' && count === WEEKDAYS.length) return WEEKDAYS;
  const all = Array.from({ length: count }, (_, i) => {
    if (range === 'day') return String(Math.round((i * 24) / count)).padStart(2, '0');
    if (range === 'month') return count <= 6 ? `W${i + 1}` : String(i + 1);
    return String(i + 1);
  });
  const step = Math.ceil(count / MAX_LABELS);
  // Counted back from the end, so the latest point always keeps its label.
  return all.map((label, i) => ((count - 1 - i) % step === 0 ? label : ''));
}

/** The headline's label for one point while it is dragged over: "Wednesday", "08:00", "Week 2". */
export function pointLabel(range: DataRange, index: number, count: number, custom: unknown): string {
  if (Array.isArray(custom) && custom.length === count && typeof custom[index] === 'string' && custom[index]) {
    return custom[index] as string;
  }
  if (range === 'week' && count === WEEKDAY_NAMES.length) return WEEKDAY_NAMES[index];
  if (range === 'day') return `${String(Math.round((index * 24) / count)).padStart(2, '0')}:00`;
  if (range === 'month') return count <= 6 ? `Week ${index + 1}` : `Day ${index + 1}`;
  return `Point ${index + 1}`;
}

/**
 * Four evenly spaced round ticks covering `lo`–`hi`, from 0 when `lo` is 0, otherwise centred on the
 * range and never below 0. Steps are 1, 2, 2.5 or 5 × 10ⁿ, the smallest that fits.
 */
export function niceTicks(lo: number, hi: number, counts: number[] = [4, 5]): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1, 2, 3];
  // Four gridlines as in Figma, or five when that covers the range more tightly (40–80 in tens rather
  // than 20–80 in twenties); the tighter one wins, and four on a tie.
  let best: number[] | null = null;
  for (const count of counts) {
    const ticks = ticksFor(lo, hi, count);
    if (ticks && (!best || span(ticks) < span(best))) best = ticks;
  }
  return best ?? [lo, lo + (hi - lo) / 3, lo + ((hi - lo) * 2) / 3, hi];
}

function span(ticks: number[]): number {
  return ticks[ticks.length - 1] - ticks[0];
}

/** `count` round ticks covering `lo`–`hi`, with the smallest step that does it. */
function ticksFor(lo: number, hi: number, count: number): number[] | null {
  const raw = Math.max(hi - lo, Math.abs(hi) * 0.01, 1e-6) / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  // The steps people read without thinking (10, 20, 25, 50 …), into the next power of ten too.
  for (const multiple of [1, 2, 2.5, 5, 10, 20, 25, 50]) {
    const step = multiple * magnitude;
    if (step < raw) continue;
    const slack = step * (count - 1) - (hi - lo);
    // A zero floor stays the first tick. Otherwise centred on the range, or failing that started just
    // below it, and never below 0.
    const starts =
      lo === 0
        ? [0]
        : [Math.floor((lo - slack / 2) / step) * step, Math.floor(lo / step) * step].map((v) => Math.max(0, v));
    const start = starts.find((v) => v + step * (count - 1) >= hi);
    if (start != null) {
      return Array.from({ length: count }, (_, i) => roundTo(start + i * step, step));
    }
  }
  return null;
}

/** Clears float noise (0.30000000000000004) to the step's own precision. */
function roundTo(value: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return Number(value.toFixed(decimals));
}

/**
 * An SVG path through the points as a smooth curve (monotone cubic, as d3's `curveMonotoneX`): it
 * never overshoots a point, so peaks stay where the data puts them.
 */
export function smoothPath(points: { x: number; y: number }[]): string {
  const n = points.length;
  if (n === 0) return '';
  if (n < 3) return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  const slopes = points.slice(1).map((p, i) => (p.y - points[i].y) / (p.x - points[i].x || 1));
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === n - 1) return slopes[n - 2];
    const [before, after] = [slopes[i - 1], slopes[i]];
    // Flat at a peak, a trough or a level stretch.
    if (before * after <= 0) return 0;
    const mean = (before + after) / 2;
    return Math.sign(mean) * Math.min(Math.abs(mean), 3 * Math.min(Math.abs(before), Math.abs(after)));
  });

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    const third = (b.x - a.x) / 3;
    d += ` C ${a.x + third} ${a.y + tangents[i] * third} ${b.x - third} ${b.y - tangents[i + 1] * third} ${b.x} ${b.y}`;
  }
  return d;
}

/** Pill text ends without a full stop; an ellipsis is left alone. */
export function pillText(text: string): string {
  const trimmed = text.trimEnd();
  return trimmed.endsWith('.') && !trimmed.endsWith('..') ? trimmed.slice(0, -1) : trimmed;
}

export function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Between a figure and its unit: a thin space, so "7 h" reads as one item and "7 h 20 m" as two. */
export const UNIT_SPACE = ' ';

/** Minutes as "7 h 20 m", "45 m" or "2 h". */
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}${UNIT_SPACE}m`;
  return m === 0 ? `${h}${UNIT_SPACE}h` : `${h}${UNIT_SPACE}h ${m}${UNIT_SPACE}m`;
}

/** "10k", "1.5M": round figures for tight spaces. Under 10,000 it's the full number. */
export function compactNumber(value: number): string {
  const units: [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'k'],
  ];
  for (const [size, suffix] of units) {
    if (Math.abs(value) >= Math.max(size, 1e4)) {
      const scaled = value / size;
      return `${Number(scaled.toFixed(Math.abs(scaled) < 10 ? 1 : 0))}${suffix}`;
    }
  }
  return formatNumber(value);
}
