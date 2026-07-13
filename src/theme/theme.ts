import type { ThemeManifest } from '../library/contracts/ManifestSchema';

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
   * `ToDoStatusNode`'s three end-of-day banner states (node 2923:3189). Figma shows no
   * light/dark variant for these — same hex in both `lightTheme` and `darkTheme` below.
   */
  toDoStatus: {
    allCompleted: string;
    someMissed: string;
    allMissed: string;
  };
}

export const darkTheme: ColorTokens = {
  background: {
    primary: '#111111',
    secondary: '#0A1520',
    tertiary: '#ECB1D5',
  },
  card: {
    background: '#1E1E1E',
    engagement: {
      background2: '#1C1C1E',
      text: '#FFFFFF',
      checkinBadge: '#1D9E75',
      checkinIcon: '#C8F0E2',
      streakBadge: '#F9A825',
      streakIcon: '#FEF3E2',
      longstreakIcon: '#FFF8DD',
      longstreakBadge: '#FFD700',
      activedaysIcon: '#E1DBF5',
      activedaysBadge: '#3C357C',
    },
    stats: {
      background: '#1E1E1E',
      openBadge: '#2E2E30',
      openIcon: '#FFFFFF',
      description: '#C5D1DC',
    },
    task: {
      background: '#1E1E1E',
      border: '#2196C4',
      text: '#E3F4FA',
      pillBackground: '#FFFFFF',
      badges: '#2196C4',
      taskType: {
        reminderText: '#1C1C1E',
        medication: { badge: '#1A2530', icon: '#7EB8F0' },
        questionnaire: { badge: '#252E3A', icon: '#A8C4E0' },
        physical: { badge: '#1A2E1A', icon: '#6CCF8E', badgeText: '#04342C' },
        speech: { badge: '#0E1E33', icon: '#8FA6B8' },
      },
    },
    hint: {
      background: '#051E2E',
      text: '#B5DFF2',
    },
  },
  header: {
    text: '#FFFFFF',
    buttonBackground: '#2C4F6B',
    buttonIcon: '#FFFFFF',
    redBubble: '#C0312D',
    buttonPressed: '#1D3557',
    headerBackground: '#0A1520',
  },
  navbar: {
    dropshadow: 'rgba(30, 30, 31, 0.5)',
    surface: { background: '#0A1520', backgroundInvert: '#1D3557' },
    border: '#0A1520',
    text: { primary: '#FFFFFF', invert: '#FFFFFF' },
  },
  text: {
    primary: '#FFFFFF',
    brand: '#571E44',
  },
  button: {
    text: '#FFFFFF',
    background: '#2C4F6B',
    icon: '#FFFFFF',
    redBubble: '#C0312D',
    pressed: '#4A708A',
    noBackgroundText: '#FFFFFF',
    disabled: 'rgba(44, 79, 107, 0.3)',
    success: '#34C759',
    error: '#C0312D',
    loading: 'rgba(44, 79, 107, 0.8)',
  },
  toDoStatus: {
    allCompleted: '#9CB167',
    someMissed: '#4A708A',
    allMissed: '#52ADD1',
  },
};

export const lightTheme: ColorTokens = {
  background: {
    primary: '#EEF8F4',
    secondary: '#1D3557',
    tertiary: '#F8E5F0',
  },
  card: {
    background: '#FFFFFF',
    engagement: {
      background2: '#FFFFFF',
      text: '#111111',
      checkinBadge: '#C8F0E2',
      checkinIcon: '#1D9E75',
      streakBadge: '#FEF3E2',
      streakIcon: '#F9A825',
      longstreakIcon: '#FFD700',
      longstreakBadge: '#FFF8DD',
      activedaysIcon: '#3C357C',
      activedaysBadge: '#E1DBF5',
    },
    stats: {
      background: '#FFFFFF',
      openBadge: '#E5E5EA',
      openIcon: '#111111',
      description: '#2E2E30',
    },
    task: {
      background: '#FFFFFF',
      border: '#B5D4F4',
      text: '#FFFFFF',
      pillBackground: '#E6F1FB',
      badges: '#52ADD1',
      taskType: {
        reminderText: '#FFFFFF',
        medication: { badge: '#E6F1FB', icon: '#378ADD' },
        questionnaire: { badge: '#E4EAF2', icon: '#1B2E4B' },
        physical: { badge: '#E8F2EC', icon: '#4A7C59', badgeText: '#2D5C3F' },
        speech: { badge: '#E8EDF2', icon: '#4A708A' },
      },
    },
    hint: {
      background: '#E3F4FA',
      text: '#0E5474',
    },
  },
  header: {
    text: '#C5D1DC',
    buttonBackground: '#FFFFFF',
    buttonIcon: '#1D3557',
    redBubble: '#C0312D',
    buttonPressed: '#8FA6B8',
    headerBackground: '#1D3557',
  },
  navbar: {
    dropshadow: 'rgba(29, 53, 87, 0.3)',
    surface: { background: '#1D3557', backgroundInvert: '#FFFFFF' },
    border: '#1D3557',
    text: { primary: '#FFFFFF', invert: '#1D3557' },
  },
  text: {
    primary: '#000000',
    brand: '#89346D',
  },
  button: {
    text: '#2E2E30',
    background: '#1D3557',
    icon: '#FFFFFF',
    redBubble: '#C0312D',
    pressed: '#0E1E33',
    noBackgroundText: '#1D3557',
    disabled: 'rgba(29, 53, 87, 0.3)',
    success: '#34C759',
    error: '#C0312D',
    loading: 'rgba(29, 53, 87, 0.8)',
  },
  toDoStatus: {
    allCompleted: '#9CB167',
    someMissed: '#4A708A',
    allMissed: '#52ADD1',
  },
};

export type ThemeMode = 'light' | 'dark';

export function getColorTokens(mode: ThemeMode): ColorTokens {
  return mode === 'dark' ? darkTheme : lightTheme;
}

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
  /** Figma's tracking value on virtually all text in this design system. */
  letterSpacing: -0.5,
  /** The 9px gap Figma uses between rows/items — headers, navbar, card grids, sections. */
  gap: 9,
  /** Caption-sized text (badges, pills, "Keep it up!"/"See All", last-synced label). */
  captionFontSize: 10,
  /** Section/heading-sized text ("My Activity", "My Tasks", back-navigation titles). */
  headingFontSize: 16,
  /** Corner radius for pill-shaped chips, badges, and buttons. */
  radiusPill: 24,
  /** Corner radius for card surfaces. */
  radiusCard: 12,
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
  /** Space between the screen content and the top of the pill (`SDUIShell`'s wrapper). */
  outerPaddingTop: 6,
  /** Space below the pill, before the safe-area inset (`SDUIShell`'s wrapper). */
  outerPaddingBottom: 30,
};
