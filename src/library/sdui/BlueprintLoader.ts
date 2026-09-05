import { BlueprintSchema, type ScreenBlueprint } from '../contracts/BlueprintSchema';

/**
 * Host-supplied resolver: given a `viewPath` (e.g. `views/home.json`), return the raw
 * JSON value. The loader handles validation + caching on top of this. Hosts can
 * implement any strategy here: bundled imports, remote fetch with stale-while-revalidate,
 * server-driven config service, etc.
 */
export type BlueprintSource = (viewPath: string) => Promise<unknown>;

export interface BlueprintLoaderOptions {
  source: BlueprintSource;
  fallback?: BlueprintSource;
  onValidationError?: (viewPath: string, error: unknown) => void;
}

export class BlueprintLoader {
  private readonly cache = new Map<string, ScreenBlueprint>();
  private readonly inflight = new Map<string, Promise<ScreenBlueprint>>();

  constructor(private readonly opts: BlueprintLoaderOptions) {}

  /**
   * Load + validate the blueprint for `viewPath`. Successful results are memoised in
   * memory; subsequent calls for the same path resolve synchronously. Inflight requests
   * are deduplicated so concurrent calls share a single fetch.
   */
  async load(viewPath: string): Promise<ScreenBlueprint> {
    const cached = this.cache.get(viewPath);
    if (cached) return cached;

    const inflight = this.inflight.get(viewPath);
    if (inflight) return inflight;

    const promise = this.fetch(viewPath)
      .then((blueprint) => {
        this.cache.set(viewPath, blueprint);
        return blueprint;
      })
      .finally(() => {
        this.inflight.delete(viewPath);
      });

    this.inflight.set(viewPath, promise);
    return promise;
  }

  /**
   * Synchronously return an already-cached blueprint, or `undefined` if it hasn't been loaded yet.
   * Lets callers render a previously-loaded view immediately instead of going through the async
   * `load()` (which always resolves on a later microtask, causing a one-frame loader flash on
   * re-visits — e.g. switching back and forth between tabs).
   */
  peek(viewPath: string): ScreenBlueprint | undefined {
    return this.cache.get(viewPath);
  }

  /** Bypass the cache and force a fresh load. */
  async reload(viewPath: string): Promise<ScreenBlueprint> {
    this.cache.delete(viewPath);
    return this.load(viewPath);
  }

  /** Clear the entire cache. */
  invalidate(): void {
    this.cache.clear();
  }

  private async fetch(viewPath: string): Promise<ScreenBlueprint> {
    try {
      const raw = await this.opts.source(viewPath);
      return parseBlueprint(raw);
    } catch (err) {
      this.opts.onValidationError?.(viewPath, err);
      if (!this.opts.fallback) throw err;
      const raw = await this.opts.fallback(viewPath);
      return parseBlueprint(raw);
    }
  }
}

export function parseBlueprint(raw: unknown): ScreenBlueprint {
  return BlueprintSchema.parse(raw);
}

/**
 * Convenience helper for hosts that have all their blueprints bundled as static JSON
 * imports. Returns a `BlueprintSource` that resolves from a `viewPath → JSON` map.
 *
 * @example
 *   import home from './config/views/home.json';
 *   import insights from './config/views/insights.json';
 *
 *   const source = createBundledBlueprintSource({
 *     'views/home.json': home,
 *     'views/insights.json': insights,
 *   });
 */
export function createBundledBlueprintSource(
  blueprints: Record<string, unknown>,
): BlueprintSource {
  return async (viewPath) => {
    const blueprint = blueprints[viewPath];
    if (blueprint === undefined) {
      throw new Error(`No bundled blueprint registered for viewPath "${viewPath}".`);
    }
    return blueprint;
  };
}
