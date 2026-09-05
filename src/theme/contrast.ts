/**
 * WCAG 2.x color-contrast utilities. Used to keep text readable when the app config repaints
 * background colors (brand / accent / background): a paired foreground is auto-corrected against its
 * (possibly overridden) background so it always meets a target contrast ratio.
 *
 * Math per the WCAG definition of relative luminance and contrast ratio:
 *   https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 *   https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

/** WCAG AA minimum contrast for normal body text. */
export const WCAG_AA_NORMAL = 4.5;
/** WCAG AA minimum contrast for large text (≥18pt, or ≥14pt bold). */
export const WCAG_AA_LARGE = 3;

/** Parse `#rgb` / `#rrggbb` / `#rrggbbaa` / `rgb()` / `rgba()` into 0–255 channels. Alpha is ignored
 *  (contrast against a translucent color is undefined; treat it as opaque). Returns null if unparseable. */
function parseColor(input: string): [number, number, number] | null {
  const s = input.trim().toLowerCase();

  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = hex[0], g = hex[1], b = hex[2];
      return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if ([r, g, b].some(Number.isNaN)) return null;
      return [r, g, b];
    }
    return null;
  }

  const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (m) {
    const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b];
  }

  return null;
}

/** Linearize a 0–255 sRGB channel for the luminance sum. */
function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0 = black, 1 = white). Unparseable colors are treated as black. */
export function relativeLuminance(color: string): number {
  const rgb = parseColor(color);
  if (!rgb) return 0;
  const [r, g, b] = rgb;
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** WCAG contrast ratio between two colors (1 = identical, 21 = black-on-white). Order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Whether `foreground` on `background` meets the given contrast ratio (default WCAG AA normal text). */
export function meetsContrast(foreground: string, background: string, ratio = WCAG_AA_NORMAL): boolean {
  return contrastRatio(foreground, background) >= ratio;
}

export interface ReadableTextOptions {
  /** Keep this color if it already meets `ratio` on the background (preserves designer intent). */
  preferred?: string;
  /** Candidate to use when the background is dark. Default near-white. */
  light?: string;
  /** Candidate to use when the background is light. Default near-black (matches palette `gray950`). */
  dark?: string;
  /** Target contrast ratio. Default WCAG AA normal text (4.5:1). */
  ratio?: number;
}

/**
 * Pick a readable text color for `background`. If `preferred` is given and already meets the target
 * ratio, it's returned unchanged (so designer-chosen colors are preserved). Otherwise the higher-
 * contrast of `light`/`dark` is chosen — guaranteeing the most readable of the two even when neither
 * fully clears AA (e.g. a mid-tone background).
 */
export function readableTextColor(background: string, opts: ReadableTextOptions = {}): string {
  const { preferred, light = '#FFFFFF', dark = '#111111', ratio = WCAG_AA_NORMAL } = opts;
  if (preferred && meetsContrast(preferred, background, ratio)) return preferred;
  return contrastRatio(light, background) >= contrastRatio(dark, background) ? light : dark;
}

/**
 * Return `color` at the given `alpha` (0–1) as an `rgba()` string. Used to derive a tinted "filled
 * circle" / pill background from an icon color, so a single color defines both (icon at full opacity,
 * fill at low). Because it composites over whatever's behind it, the tint adapts to a light or dark
 * card background for free. Falls back to the input if it can't be parsed.
 */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseColor(color);
  if (!rgb) return color;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}
