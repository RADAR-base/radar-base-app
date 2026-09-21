import type { TemplateContext } from './types';

const TEMPLATE_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Interpolate `{{scope.path.to.value}}` expressions in a string using values from
 * `context`. Unknown paths are left as the original literal so authors can spot misses
 * (e.g. `{{user.firstName}}` shows literally instead of `undefined`).
 *
 * @example
 *   interpolate('Hello, {{user.firstName}}', { user: { firstName: 'Ada' } })
 *   // → "Hello, Ada"
 */
export function interpolate(template: string, context: TemplateContext): string {
  return template.replace(TEMPLATE_PATTERN, (match, path: string) => {
    const value = resolvePath(context, path);
    if (value === undefined || value === null) return match;
    return String(value);
  });
}

/**
 * Walk a value (typically a node's props) and interpolate every string field. Numbers,
 * booleans, and other scalars pass through unchanged. Nested objects and arrays are
 * recursed into.
 */
export function interpolateDeep<T>(value: T, context: TemplateContext): T {
  if (typeof value === 'string') {
    return interpolate(value, context) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => interpolateDeep(v, context)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      out[key] = interpolateDeep((value as Record<string, unknown>)[key], context);
    }
    return out as unknown as T;
  }
  return value;
}

function resolvePath(scope: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = scope;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
