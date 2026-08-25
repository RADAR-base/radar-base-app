import { Platform } from 'react-native';

import type { ThemeManifest } from '../library/contracts/ManifestSchema';
import { readableTextColor } from './contrast';

export {
  readableTextColor,
  contrastRatio,
  meetsContrast,
  relativeLuminance,
  withAlpha,
  WCAG_AA_NORMAL,
  WCAG_AA_LARGE,
} from './contrast';

/**
 * Color tokens transcribed from the Figma design system's exported token sets
 * (`Dark.tokens.json` / `Light.tokens.json`, RADAR-Base Active App UI). Hex values are
 * copied directly from each token's `$value.hex`; where a token aliases another
 * (`$value: "{a.b.c}"` in the source file) the resolved color is inlined here instead of
 * re-creating Figma's alias graph.
 */
export interface ColorTokens {
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  card: {
    background: string;
    engagement: {
      background2: string;
      text: string;
      checkinBadge: string;
      checkinIcon: string;
      streakBadge: string;
      streakIcon: string;
      longstreakIcon: string;
      longstreakBadge: string;
      activedaysIcon: string;
      activedaysBadge: string;
    };
    stats: {
      background: string;
      openBadge: string;
      openIcon: string;
      description: string;
    };
    task: {
      background: string;
      border: string;
      text: string;
      pillBackground: string;
      badges: string;
      taskType: {
        reminderText: string;
        medication: { badge: string; icon: string };
        questionnaire: { badge: string; icon: string };
        physical: { badge: string; icon: string; badgeText: string };
        speech: { badge: string; icon: string };
      };
    };
    hint: {
      background: string;
      text: string;
    };
  };
  header: {
    text: string;
    buttonBackground: string;
    buttonIcon: string;
    redBubble: string;
    buttonPressed: string;
    headerBackground: string;
  };
  navbar: {
    dropshadow: string;
    surface: { background: string; backgroundInvert: string };
    border: string;
    text: { primary: string; invert: string };
  };
  text: {
    primary: string;
    brand: string;
  };
  button: {
    text: string;
    background: string;
    icon: string;
    redBubble: string;
    pressed: string;
    noBackgroundText: string;
    disabled: string;
    success: string;
    error: string;
    loading: string;
  };
  /**
   * Text input field states — Figma "Text Input Field" (node 3120:3491). Light values are from
   * the design; dark values are derived from the dark theme's equivalents (card.hint, gray, etc.).
   */
  input: {
    fill: string;
    text: string;
    border: string;
    focusBorder: string;
    focusRing: string;
    errorBorder: string;
    disabledFill: string;
    disabledBorder: string;
    disabledText: string;
  };
  /**
   * `ToDoStatusNode`'s three end-of-day banner states (node 2923:3189). Figma shows no
   * light/dark variant for these — same hex in both `lightTheme` and `darkTheme` below.
   */
  toDoStatus: {
    allCompleted: string;
    someMissed: string;
    allMissed: string;
  };
  /**
   * `DataWheelCardNode`'s ring fill states. No light/dark variant — same hex in both
   * `lightTheme` and `darkTheme` below. `bad`/`good` reuse `button.error`/`toDoStatus.allCompleted`
   * (already identical across themes), but `neutral` needs its own fixed token: the closest
   * existing amber (`card.engagement.streakIcon`) is an icon-on-badge contrast color that
   * intentionally swaps with `streakBadge` between themes, so it isn't actually fixed.
   */
  dataWheel: {
    bad: string;
    neutral: string;
    good: string;
  };
  /**
   * `BarChartCardNode`'s weekly-bar colors (node 2250:2687). Fixed brand hues taken
   * straight from the Figma palette (teal/600 bar fill over a 25% teal track, sky/600
   * average marker, green/200 current-day label) — no light/dark variant, same hex in
   * both themes like `dataWheel`.
   */
  barChart: {
    bar: string;
    barTrack: string;
    average: string;
    averageLabel: string;
    currentDay: string;
  };
  /**
   * `LineGraphCardNode`'s plot colors (node 3049:792). Fixed brand hues — the green line and
   * the gradient beneath it, plus the navy drag crosshair/dot — same in both themes like
   * `dataWheel`/`barChart`. The scrub tooltip reuses `card.hint`.
   */
  graph: {
    line: string;
    area: string;
    dot: string;
    crosshair: string;
  };
}

/**
 * Primitive color palette: every unique color used by the themes below, defined once so a
 * value lives in a single place. Names encode hue + a lightness step (higher = darker). The
 * semantic tokens in `darkTheme`/`lightTheme` reference these instead of repeating literals.
 */
const palette = {
  white:      '#FFFFFF',
  gray100:    '#E5E5EA',
  gray800:    '#2E2E30',
  gray900:    '#1E1E1E',
  gray900_2:  '#1C1C1E',
  gray900a50: 'rgba(30, 30, 31, 0.5)',
  gray950:    '#111111',
  black:      '#000000',
  red400:     '#E84855',
  red550:     '#C0312D',
  orange450:  '#F9A825',
  orange50:   '#FEF3E2',
  amber50:    '#FFF8DD',
  amber500:   '#FFD700',
  lime450:    '#9CB167',
  green400:   '#6CCF8E',
  green50:    '#E8F2EC',
  green500:   '#34C759',
  green600:   '#4A7C59',
  green750:   '#2D5C3F',
  green850:   '#1A2E1A',
  teal150:    '#C8F0E2',
  teal50:     '#EEF8F4',
  teal650:    '#1D9E75',
  teal650a25: 'rgba(29, 158, 117, 0.25)',
  teal900:    '#04342C',
  cyan300:    '#7EC8E8',
  slate200:   '#C5D1DC',
  slate350:   '#8FA6B8',
  slate50:    '#E8EDF2',
  slate800:   '#252E3A',
  navy700:    '#2C4F6B',
  navy700a30: 'rgba(44, 79, 107, 0.3)',
  navy700a80: 'rgba(44, 79, 107, 0.8)',
  navy750:    '#1D3557',
  navy750_2:  '#0E5474',
  navy750a30: 'rgba(29, 53, 87, 0.3)',
  navy750a80: 'rgba(29, 53, 87, 0.8)',
  navy800:    '#1B2E4B',
  navy850:    '#0E1E33',
  navy850_2:  '#1A2530',
  navy900:    '#0A1520',
  navy900_2:  '#051E2E',
  blue450:    '#378ADD',
  blue550:    '#2196C4',
  blue600:    '#4A708A',
  blue650:    '#3C357C',
  blue650_2:  '#1778A0',
  sky100:     '#E1DBF5',
  sky100_2:   '#E4EAF2',
  sky150:     '#B5DFF2',
  sky150_2:   '#B5D4F4',
  sky250:     '#A8C4E0',
  sky300:     '#7EB8F0',
  sky450:     '#52ADD1',
  sky50:      '#E3F4FA',
  sky50_2:    '#E6F1FB',
  pink200:    '#ECB1D5',
  pink50:     '#F8E5F0',
  pink650:    '#89346D',
  pink750:    '#571E44',
} as const;

export const darkTheme: ColorTokens = {
  background: {
    primary: palette.gray950,
    secondary: palette.navy900,
    tertiary: palette.pink200,
  },
  card: {
    background: palette.gray900,
    engagement: {
      background2: palette.gray900_2,
      text: palette.white,
      checkinBadge: palette.teal650,
      checkinIcon: palette.teal150,
      streakBadge: palette.orange450,
      streakIcon: palette.orange50,
      longstreakIcon: palette.amber50,
      longstreakBadge: palette.amber500,
      activedaysIcon: palette.sky100,
      activedaysBadge: palette.blue650,
    },
    stats: {
      background: palette.gray900,
      openBadge: palette.gray800,
      openIcon: palette.white,
      description: palette.slate200,
    },
    task: {
      background: palette.gray900,
      border: palette.blue550,
      text: palette.sky50,
      pillBackground: palette.white,
      badges: palette.blue550,
      taskType: {
        reminderText: palette.gray900_2,
        medication: { badge: palette.navy850_2, icon: palette.sky300 },
        questionnaire: { badge: palette.slate800, icon: palette.sky250 },
        physical: { badge: palette.green850, icon: palette.green400, badgeText: palette.teal900 },
        speech: { badge: palette.navy850, icon: palette.slate350 },
      },
    },
    hint: {
      background: palette.navy900_2,
      text: palette.sky150,
    },
  },
  header: {
    text: palette.white,
    buttonBackground: palette.navy700,
    buttonIcon: palette.white,
    redBubble: palette.red550,
    buttonPressed: palette.navy750,
    headerBackground: palette.navy900,
  },
  navbar: {
    dropshadow: palette.gray900a50,
    // Selected tab: a pill in the page background color (the dark bg) so it reads as a "cutout" that
    // matches the dark theme — not a stark white pill. The glyph stays white so the active tab is
    // still legible against the near-black bar.
    surface: { background: palette.navy900, backgroundInvert: palette.gray950 },
    border: palette.navy900,
    text: { primary: palette.white, invert: palette.white },
  },
  text: {
    primary: palette.white,
    brand: palette.pink750,
  },
  button: {
    text: palette.white,
    background: palette.navy700,
    icon: palette.white,
    redBubble: palette.red550,
    pressed: palette.blue600,
    noBackgroundText: palette.white,
    disabled: palette.navy700a30,
    success: palette.green500,
    error: palette.red550,
    loading: palette.navy700a80,
  },
  input: {
    fill: palette.navy900_2, //      dark tinted field (matches dark card.hint.background)
    text: palette.sky150, //         readable light text (matches dark card.hint.text)
    border: palette.navy700, //      resting brand-navy border
    focusBorder: palette.blue550, // brighter focus accent
    focusRing: palette.cyan300, //   light focus halo
    errorBorder: palette.red400, //  error red (same in both themes)
    disabledFill: palette.gray900, //   muted dark field
    disabledBorder: palette.gray800,
    disabledText: palette.slate350,
  },
  toDoStatus: {
    allCompleted: palette.lime450,
    someMissed: palette.blue600,
    allMissed: palette.sky450,
  },
  dataWheel: {
    bad: palette.red550,
    neutral: palette.orange450,
    good: palette.lime450,
  },
  barChart: {
    bar: palette.teal650,
    barTrack: palette.teal650a25,
    average: palette.blue650_2,
    averageLabel: palette.white,
    currentDay: palette.lime450,
  },
  graph: {
    line: palette.teal650,
    area: palette.teal650,
    dot: palette.navy750,
    crosshair: palette.navy750,
  },
};

export const lightTheme: ColorTokens = {
  background: {
    primary: palette.teal50,
    secondary: palette.navy750,
    tertiary: palette.pink50,
  },
  card: {
    background: palette.white,
    engagement: {
      background2: palette.white,
      text: palette.gray950,
      checkinBadge: palette.teal150,
      checkinIcon: palette.teal650,
      streakBadge: palette.orange50,
      streakIcon: palette.orange450,
      longstreakIcon: palette.amber500,
      longstreakBadge: palette.amber50,
      activedaysIcon: palette.blue650,
      activedaysBadge: palette.sky100,
    },
    stats: {
      background: palette.white,
      openBadge: palette.gray100,
      openIcon: palette.gray950,
      description: palette.gray800,
    },
    task: {
      background: palette.white,
      border: palette.sky150_2,
      text: palette.white,
      pillBackground: palette.sky50_2,
      badges: palette.sky450,
      taskType: {
        reminderText: palette.white,
        medication: { badge: palette.sky50_2, icon: palette.blue450 },
        questionnaire: { badge: palette.sky100_2, icon: palette.navy800 },
        physical: { badge: palette.green50, icon: palette.green600, badgeText: palette.green750 },
        speech: { badge: palette.slate50, icon: palette.blue600 },
      },
    },
    hint: {
      background: palette.sky50,
      text: palette.navy750_2,
    },
  },
  header: {
    text: palette.slate200,
    buttonBackground: palette.white,
    buttonIcon: palette.navy750,
    redBubble: palette.red550,
    buttonPressed: palette.slate350,
    headerBackground: palette.navy750,
  },
  navbar: {
    dropshadow: palette.navy750a30,
    surface: { background: palette.navy750, backgroundInvert: palette.white },
    border: palette.navy750,
    text: { primary: palette.white, invert: palette.navy750 },
  },
  text: {
    primary: palette.black,
    brand: palette.pink650,
  },
  button: {
    text: palette.gray800,
    background: palette.navy750,
    icon: palette.white,
    redBubble: palette.red550,
    pressed: palette.navy850,
    noBackgroundText: palette.navy750,
    disabled: palette.navy750a30,
    success: palette.green500,
    error: palette.red550,
    loading: palette.navy750a80,
  },
  input: {
    fill: palette.sky50,
    text: palette.navy750_2,
    border: palette.navy750,
    focusBorder: palette.blue550,
    focusRing: palette.cyan300,
    errorBorder: palette.red400,
    disabledFill: palette.slate50,
    disabledBorder: palette.slate350,
    disabledText: palette.slate350,
  },
  toDoStatus: {
    allCompleted: palette.lime450,
    someMissed: palette.blue600,
    allMissed: palette.sky450,
  },
  dataWheel: {
    bad: palette.red550,
    neutral: palette.orange450,
    good: palette.lime450,
  },
  barChart: {
    bar: palette.teal650,
    barTrack: palette.teal650a25,
    average: palette.blue650_2,
    averageLabel: palette.white,
    currentDay: palette.lime450,
  },
  graph: {
    line: palette.teal650,
    area: palette.teal650,
    dot: palette.navy750,
    crosshair: palette.navy750,
  },
};

export type ThemeMode = 'light' | 'dark';

/**
 * Brand colors an app can set (e.g. from the manifest) to override the theme. Each one replaces
 * a single palette entry, so it cascades to every token that references that entry. Any omitted
 * color falls back to the design-system default.
 */
export interface ThemeColorOverrides {
  /** 60/30/10 brand trio. `brand` (30%) is the dominant color — navy panels, header, buttons;
   *  it repaints the `navy750` (light) / `navy900` (dark) slot. `accent` (10%) is the pop —
   *  highlights, active states, charts — repainting the `teal650` slot. `background` (60%) is the
   *  page background, applied directly by the shell (not a palette swap). */
  brand?: string;
  accent?: string;
  background?: string;
  /** @deprecated legacy alias for `brand`. */
  primary?: string;
  /** @deprecated the lighter navy slot (`blue600`/`navy750`); not part of the brand trio. */
  secondary?: string;
  /** @deprecated legacy alias for `accent`. */
  tertiary?: string;
}

/** The palette entries a brand override repaints, per mode. `brand` (primary) covers *both* navies —
 *  the deep `navy900` chrome (header, navbar) and the `navy750` navy (buttons, accents) — so a single
 *  brand color drives the whole 30% navy presence, not just the buttons. */
type BrandSlot = 'primary' | 'secondary' | 'tertiary';
const BRAND_SLOTS: Record<ThemeMode, Record<BrandSlot, (keyof typeof palette)[]>> = {
  light: { primary: ['navy750', 'navy900'], secondary: ['blue600'], tertiary: ['teal650'] },
  dark: { primary: ['navy900'], secondary: ['navy750'], tertiary: ['teal650'] },
};

/** Deep-clone `value`, replacing any leaf string found in `swaps` with its mapped color. */
function deepReplace<T>(value: T, swaps: Record<string, string>): T {
  if (typeof value === 'string') return (swaps[value] ?? value) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepReplace(v, swaps);
    return out as T;
  }
  return value;
}

/**
 * Auto-correct the foreground tokens that sit on config-repaintable backgrounds so they stay readable
 * (WCAG AA) when `brand`/`accent` repaint those backgrounds. Each foreground keeps its designer color
 * when it already passes, and flips to a readable light/dark otherwise. Returns the same object when
 * nothing changed, so token identity (and memoization) is preserved for the untouched common case.
 */
function withReadableText(t: ColorTokens): ColorTokens {
  const headerText = readableTextColor(t.header.headerBackground, { preferred: t.header.text });
  const headerIcon = readableTextColor(t.header.buttonBackground, { preferred: t.header.buttonIcon });
  const navPrimary = readableTextColor(t.navbar.surface.background, { preferred: t.navbar.text.primary });
  const navInvert = readableTextColor(t.navbar.surface.backgroundInvert, { preferred: t.navbar.text.invert });

  if (
    headerText === t.header.text &&
    headerIcon === t.header.buttonIcon &&
    navPrimary === t.navbar.text.primary &&
    navInvert === t.navbar.text.invert
  ) {
    return t;
  }

  return {
    ...t,
    header: { ...t.header, text: headerText, buttonIcon: headerIcon },
    navbar: { ...t.navbar, text: { primary: navPrimary, invert: navInvert } },
  };
}

export function getColorTokens(mode: ThemeMode, overrides?: ThemeColorOverrides): ColorTokens {
  const base = mode === 'dark' ? darkTheme : lightTheme;
  if (!overrides) return withReadableText(base);

  // `brand`/`accent` are the intent-named aliases for the `primary`/`tertiary` palette slots;
  // `background` isn't a palette swap (the shell applies it as the page background).
  const resolved: Record<BrandSlot, string | undefined> = {
    primary: overrides.brand ?? overrides.primary,
    secondary: overrides.secondary,
    tertiary: overrides.accent ?? overrides.tertiary,
  };
  // Map each overridden color's *default* palette value -> the new color, then swap every token that
  // used it. Palette values are unique, so this only repaints the intended color.
  const slots = BRAND_SLOTS[mode];
  const swaps: Record<string, string> = {};
  for (const slot of ['primary', 'secondary', 'tertiary'] as const) {
    const next = resolved[slot];
    if (next) for (const entry of slots[slot]) swaps[palette[entry]] = next;
  }
  const themed = Object.keys(swaps).length ? deepReplace(base, swaps) : base;
  return withReadableText(themed);
}

/**
 * The page background (the 60% brand color): the `brandColors.background` override, else the
 * (mode-resolved) top-level `backgroundColor`, else the design-system default light grey.
 *
 * `brandColors.background` is treated as a *light-mode* brand surface — in dark mode we defer to the
 * mode-resolved `backgroundColor` so a light custom background doesn't overwrite dark mode. Pass the
 * active color scheme so this stays correct in both.
 */
export function resolveBackground(
  theme?: {
    brandColors?: { background?: string };
    backgroundColor?: string;
  },
  mode: ThemeMode = 'light',
): string {
  const custom = mode === 'dark' ? undefined : theme?.brandColors?.background;
  return custom ?? theme?.backgroundColor ?? '#EDF1F5';
}

/**
 * The single canonical drop shadow (Figma spec: a #79787F shadow at 8%, offset 8/8, 12px blur).
 * Spread into any surface's style (`{ ...cardShadow }`) so every card matches.
 *
 * Split per platform because the two renderers differ:
 *  - iOS reads the `shadow*` props exactly — soft diagonal Core Animation shadow.
 *  - Android (New Architecture) renders CSS `boxShadow`, but its blur is harder than iOS's, so the
 *    big 8/8 diagonal comes out as a hard-edged smear. A mostly-downward, more-blurred shadow with a
 *    touch more opacity reads far closer to the iOS softness. Tune the Android values to taste —
 *    bigger blur + smaller offset = softer; the opacity is the darkness knob.
 *
 * `elevation: 0` on both so no Material shadow stacks on top; only one shadow source per platform.
 */
export const cardShadow =
  Platform.OS === 'android'
    ? ({
        boxShadow: '0px 4px 12px rgba(121, 120, 127, 0.14)',
        elevation: 0,
      } as const)
    : ({
        shadowColor: '#79787F',
        shadowOffset: { width: 8, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 0,
      } as const);

/**
 * Adapts the Figma color tokens to the SDUI engine's `ThemeManifest` shape
 * (see `library/contracts/ManifestSchema.ts`), for use as `app-manifest.json`'s
 * `theme` block or as a `CoreServiceOverrides` value.
 */
export function toThemeManifest(mode: ThemeMode): ThemeManifest {
  const tokens = getColorTokens(mode);
  return {
    primaryColor: tokens.button.background,
    secondaryColor: tokens.background.secondary,
    backgroundColor: tokens.background.primary,
    surfaceColor: tokens.card.background,
    textColor: tokens.text.primary,
    textSecondaryColor: tokens.card.stats.description,
  };
}

/**
 * Design-system-wide layout primitives — Figma's standard 9px spacing unit, -0.5
 * tracking, and the small set of font sizes / corner radii reused verbatim across
 * headers, navbar, cards, and section chrome (`CardSectionNode`, `StatCardNode`,
 * `HeaderNode`/`HeaderBarNode`/`HeaderTextNode`, `NavbarNode`/`NavbarItemNode`,
 * `SDUIShell`). None of these vary by light/dark mode. Single source of truth so the
 * same magic numbers aren't repeated (and don't drift) across every component that
 * happens to need a 9px gap or a pill-shaped badge.
 */
export const layout = {
  /**
   * Figma's tracking value (SF Pro on iOS). Android uses Inter, which renders a touch wider, so it
   * gets a lighter negative (-0.25) than iOS's -0.5 — enough to tighten toward the iOS look without
   * the squished feel a full -0.5 gives Inter. Tune the Android value here if it needs more/less.
   */
  letterSpacing: Platform.select({ android: -0.25, default: -0.5 }) as number,
  /** The 9px gap Figma uses between rows/items — headers, navbar, card grids, sections. */
  gap: 9,
  /** Caption-sized text (badges, pills, "Keep it up!"/"See All", last-synced label). */
  captionFontSize: 10,
  /** Section/heading-sized text ("My Activity", "My Tasks", back-navigation titles). */
  headingFontSize: 16,
  /**
   * Descender-safe line height for `headingFontSize` text. With Android's `includeFontPadding` off
   * (the global default), a `lineHeight` equal to `fontSize` clips descenders — the 'y' in
   * "My Activity"/"My Tasks" — so headings use this slightly taller line box on both platforms.
   */
  headingLineHeight: 20,
  /** Corner radius for pill-shaped chips, badges, and buttons. */
  radiusPill: 24,
  /** Corner radius for card surfaces. */
  radiusCard: 12,
  /** Corner radius for a full screen / page (the app frame + sliding overlays), so pages read as
   *  rounded cards — including as they slide over one another. Tune to match the device screen. */
  radiusScreen: 40,
  /** Standard padding inside a card surface. */
  cardPadding: 16,
  /** Standard padding inside a pill-shaped chip/badge. */
  pillPaddingHorizontal: 9,
  pillPaddingVertical: 4,
  /**
   * Vertical space between top-level sections on a screen (`ViewNode`'s content list).
   * Distinct from the standard 9px `gap`, which is for spacing *within* a section — its
   * title-to-content, and the gap between the items inside it (cards, list rows, etc).
   */
  sectionGap: 16,
};

/**
 * Typeface — Inter (an open, SF-Pro-like font) loaded by the host app via `@expo-google-fonts/inter`,
 * so Android matches the iOS/Figma design instead of falling back to Roboto. React Native can't
 * derive weights from one custom family, so each weight is its own family; components pick the family
 * for their `fontWeight` (keep `fontWeight` set too — it's the fallback when a platform uses its
 * system font).
 *
 * Currently Inter on BOTH platforms. To use Inter on Android only (keep native SF Pro on iOS),
 * set `INTER_ANDROID_ONLY = true` — the iOS values then become `undefined` (system font).
 */
const INTER_ANDROID_ONLY = true;
const inter = (name: string): string | undefined =>
  INTER_ANDROID_ONLY && Platform.OS === 'ios' ? undefined : name;

export const fontFamily = {
  light: inter('Inter_300Light'),
  regular: inter('Inter_400Regular'),
  medium: inter('Inter_500Medium'),
  semiBold: inter('Inter_600SemiBold'),
  bold: inter('Inter_700Bold'),
} as const;

/**
 * Per-weight letter tracking, paired with `fontFamily` (a text style uses `tracking[weight]` matching
 * its `fontFamily[weight]`). iOS (system SF Pro) keeps a flat value across weights. On Android the
 * heavier Inter weights read tighter, so they get a small extra nudge to match the lighter ones so
 * tracking looks even across weights. Tune the Android nudges below if a weight still looks off.
 */
const BASE_TRACKING = Platform.select({ android: -0.25, default: -0.5 }) as number;
const androidNudge = (d: number) => (Platform.OS === 'android' ? d : 0);
export const tracking = {
  light: BASE_TRACKING,
  regular: BASE_TRACKING,
  medium: BASE_TRACKING + androidNudge(0.05),
  semiBold: BASE_TRACKING + androidNudge(0.1),
  bold: BASE_TRACKING + androidNudge(0.2),
} as const;

/**
 * Shared layout constants for the header nodes (`HeaderNode` / `HeaderBarNode` /
 * `HeaderTextNode`), transcribed from Figma. Re-exports the relevant `layout` primitives
 * under header-specific names so those three components don't need to know which
 * fields are shared vs. header-only.
 */
export const headerLayout = {
  /** Figma's tracking value on every header text element. */
  letterSpacing: layout.letterSpacing,
  /** The 9px gap Figma uses between header rows/items. */
  gap: layout.gap,
  /** Caption-sized text (last-synced label, Edit button label). */
  captionFontSize: layout.captionFontSize,
};

/**
 * Shared layout constants for the bottom navbar (`NavbarNode` / `NavbarItemNode`) and
 * for `SDUIShell`, which needs the navbar's total footprint to reserve enough
 * `paddingBottom` on the scrollable body so content never ends up rendered behind the
 * floating pill. Transcribed from Figma (node 1795:434); doesn't vary by light/dark mode.
 */
export const navbarLayout = {
  /** Height of each tab item (`NavbarItemNode`) — also the navbar pill's content height. */
  itemHeight: 48,
  /** Padding on all sides of the pill container (`NavbarNode`). */
  containerPadding: layout.gap,
  /** No fixed outer spacing; the shell uses the device's bottom safe-area inset. */
  outerPaddingTop: 0,
  outerPaddingBottom: 0,
};
