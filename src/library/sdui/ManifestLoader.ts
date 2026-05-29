import { ManifestSchema, type AppManifest } from '../contracts/ManifestSchema';

/**
 * Async function the host supplies for fetching the raw manifest JSON. The loader is
 * source-agnostic: the host can read a bundled asset, fetch from a CDN, or chain remote
 * → bundled → cache strategies internally.
 */
export type ManifestSource = () => Promise<unknown>;

export interface ManifestLoaderOptions {
  /** Primary source. Required. */
  source: ManifestSource;
  /** Fallback used when the primary throws or yields a non-validating value. */
  fallback?: ManifestSource;
  /** Optional logger for validation failures. */
  onValidationError?: (error: unknown) => void;
}

export class ManifestLoader {
  constructor(private readonly opts: ManifestLoaderOptions) {}

  async load(): Promise<AppManifest> {
    try {
      const raw = await this.opts.source();
      return parseManifest(raw);
    } catch (err) {
      this.opts.onValidationError?.(err);
      if (!this.opts.fallback) throw err;
      const raw = await this.opts.fallback();
      return parseManifest(raw);
    }
  }
}

/**
 * Validate an already-fetched manifest object. Useful for tests and for hosts that
 * already have the manifest in hand (bundled JSON imports).
 */
export function parseManifest(raw: unknown): AppManifest {
  return ManifestSchema.parse(raw);
}
