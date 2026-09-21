import { ManifestSchema, type AppManifest } from '../contracts/ManifestSchema';
import { toThemeManifest, type ThemeMode } from '../../theme/theme';

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
  /**
   * Color scheme to fill unconfigured theme fields from (`theme/theme.ts`'s
   * `toThemeManifest`). Defaults to `'light'`; pass the device's live `useColorScheme()`
   * value so the merged theme — and everything keyed off `SDUIContext.theme` — tracks
   * dark/light instead of being pinned to light mode forever.
   */
  mode?: ThemeMode;
  /** Optional logger for validation failures. */
  onValidationError?: (error: unknown) => void;
}

export class ManifestLoader {
  constructor(private readonly opts: ManifestLoaderOptions) {}

  async load(): Promise<AppManifest> {
    try {
      const raw = await this.opts.source();
      return parseManifest(raw, this.opts.mode);
    } catch (err) {
      this.opts.onValidationError?.(err);
      if (!this.opts.fallback) throw err;
      const raw = await this.opts.fallback();
      return parseManifest(raw, this.opts.mode);
    }
  }
}

/**
 * Validate an already-fetched manifest object. Useful for tests and for hosts that
 * already have the manifest in hand (bundled JSON imports).
 *
 * `theme` is required by `ManifestSchema`, but authors shouldn't have to duplicate
 * `theme/theme.ts`'s design-system defaults into every `app-manifest.json`. Any field the
 * config omits — including the whole `theme` block — is filled in from
 * `toThemeManifest(mode)` before validation; anything the config does specify still wins
 * per-field.
 */
export function parseManifest(raw: unknown, mode: ThemeMode = 'light'): AppManifest {
  return ManifestSchema.parse(applyDefaultTheme(raw, mode));
}

function applyDefaultTheme(raw: unknown, mode: ThemeMode): unknown {
  if (!isRecord(raw)) return raw;
  const configuredTheme = isRecord(raw.theme) ? raw.theme : {};
  return {
    ...raw,
    theme: { ...toThemeManifest(mode), ...configuredTheme },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
