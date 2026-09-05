import { z } from 'zod';

/**
 * Zod schema for `app-manifest.json` — the lightweight entry point loaded at cold start.
 * The manifest only carries chrome metadata (theme, header, tabs) and pointers to per-screen
 * blueprints; it does NOT embed widget content. Per `SDUI_CONFIG_DESIGN.md`.
 */

export const ThemeSchema = z
  .object({
    primaryColor: z.string(),
    secondaryColor: z.string().optional(),
    backgroundColor: z.string().optional(),
    surfaceColor: z.string().optional(),
    textColor: z.string().optional(),
    textSecondaryColor: z.string().optional(),
    fontFamily: z.string().optional(),
    fontSize: z.number().optional(),
    button: z.object({ borderRadius: z.number() }).partial().optional(),
    /**
     * Optional brand overrides, following the 60/30/10 rule. `brand` (30%) is the dominant color
     * (navy panels/header/buttons), `accent` (10%) the pop (highlights, charts), `background` (60%)
     * the page background. `brand`/`accent` repaint a palette slot and cascade via `getColorTokens`;
     * `background` is applied by the shell. `primary`/`secondary`/`tertiary` are legacy aliases.
     * Omitted colors keep the theme default.
     */
    brandColors: z
      .object({
        brand: z.string().optional(),
        background: z.string().optional(),
        accent: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export const HeaderSchema = z
  .object({
    title: z.string(),
    backgroundColor: z.string().optional(),
    textColor: z.string().optional(),
    showBackButton: z.boolean().optional(),
    showSettings: z.boolean().optional(),
    /** Leading header icon: `true` (default) shows the profile picture, `false` the RadarBase wordmark. */
    profileIcon: z.boolean().optional(),
    /** When true, appends the signed-in user's name (from `SDUIContext.template.user`) after `title`. */
    showName: z.boolean().optional(),
  })
  .passthrough();

export const TabConfigSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  icon: z.string().optional(),
  viewPath: z.string(),
  /** Per-tab override for NavbarNode's showLabels; falls back to the navbar-wide default when unset. */
  showLabel: z.boolean().optional(),
});

export const WidgetRegistryEntrySchema = z.object({
  type: z.string(),
  module: z.string(),
});

export const AlertActionSchema = z
  .object({
    type: z.string(),
  })
  .passthrough();

export const AlertRuleSchema = z
  .object({
    id: z.string(),
    metric: z.string(),
    condition: z.string(),
    threshold: z.number(),
    windowDays: z.number().optional(),
    actions: z.array(AlertActionSchema).optional(),
    severity: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

export const AlertsSchema = z.object({
  enabled: z.boolean(),
  rules: z.array(AlertRuleSchema).optional(),
});

export const ManifestSchema = z
  .object({
    appName: z.string(),
    version: z.string(),
    configSchemaVersion: z.string(),
    clinicalTemplate: z.string().nullable().optional(),
    theme: ThemeSchema,
    // Optional: the dashboard header can instead live in each tab's blueprint as a leading
    // `HeaderNode` (rendered inline by `ViewNode`, so it scrolls with the page). When a manifest
    // still declares `header`, `SDUIShell` keeps drawing it as a pinned header for back-compat.
    header: HeaderSchema.optional(),
    tabs: z.array(TabConfigSchema).min(1, 'At least one tab is required'),
    secondaryViews: z.record(z.string()).optional(),
    widgetsRegistry: z.array(WidgetRegistryEntrySchema).optional(),
    alerts: AlertsSchema.optional(),
    roles: z.record(z.string()).optional(),
    cms: z
      .object({
        articlesEndpoint: z.string(),
        cacheTTLMinutes: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type ThemeManifest = z.infer<typeof ThemeSchema>;
export type HeaderManifest = z.infer<typeof HeaderSchema>;
export type TabManifest = z.infer<typeof TabConfigSchema>;
export type WidgetRegistryEntry = z.infer<typeof WidgetRegistryEntrySchema>;
export type AlertRule = z.infer<typeof AlertRuleSchema>;
export type AppManifest = z.infer<typeof ManifestSchema>;
