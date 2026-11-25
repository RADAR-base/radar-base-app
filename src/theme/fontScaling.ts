import { Platform, Text, TextInput } from 'react-native';

/**
 * Global cap on the OS font-scale multiplier (iOS Dynamic Type / Android font size) applied to every
 * `Text` and `TextInput` in the app. Text still enlarges with the user's accessibility setting — for
 * legibility — but can't grow past this factor, beyond which the card-heavy, fixed-geometry layouts
 * break (overlapping/clipped content). Paired with cards using `minHeight` (not fixed `height`) so
 * they still grow to fit text within this cap.
 *
 * 1.3 = up to 30% larger. Raise it as more layouts are made fully reflowable; lower it if any screen
 * still breaks at the top of the range.
 */
export const MAX_FONT_SCALE = 1.3;

/**
 * Android draws text with extra vertical font padding (`includeFontPadding`, on by default) that iOS
 * has no equivalent for, so the *same* text sits lower/taller on Android and its line boxes don't
 * match iOS — the single biggest cause of cross-platform line-height drift. Turning it off aligns
 * Android's text metrics with iOS. Applied as a *lowest-priority* default (below every component's
 * own `style`), so any `Text` can still set `includeFontPadding` explicitly and win.
 *
 * Text with no explicit `lineHeight` keeps the font's natural line box (descenders intact); only a
 * `lineHeight` set tight against `fontSize` can clip once the padding is gone, and those styles
 * already opt out of padding themselves. iOS gets no base style (nothing to correct there).
 *
 * NOT applied to `TextInput`: its caret and text baseline on Android are sensitive to
 * `includeFontPadding`, so that stays a per-field decision (see `TextInputField`).
 */
const androidTextBase = Platform.OS === 'android' ? ({ includeFontPadding: false } as const) : null;

/**
 * Installs the app-wide `Text`/`TextInput` defaults: the {@link MAX_FONT_SCALE} font-scale cap on
 * both, and the Android `includeFontPadding: false` base on `Text` (see {@link androidTextBase}).
 *
 * Why patch `.render` rather than set `defaultProps`: React 19 ignores `defaultProps` on function
 * components (both are `forwardRef`), so the old `Text.defaultProps` trick silently no-ops. Wrapping
 * the `forwardRef` render to inject defaults — which any component can still override per element —
 * is the one place that reaches every call site. Idempotent.
 */
let installed = false;
export function installTextDefaults(cap: number = MAX_FONT_SCALE): void {
  if (installed) return;
  installed = true;

  patchRender(Text as unknown as PatchTarget, cap, androidTextBase);
  patchRender(TextInput as unknown as PatchTarget, cap, null);
}

/** @deprecated Renamed to {@link installTextDefaults}, which now also sets the Android padding base. */
export const installFontScaleCap = installTextDefaults;

type PatchTarget = { render?: (props: unknown, ref: unknown) => unknown };

function patchRender(
  Component: PatchTarget,
  cap: number,
  baseStyle: Record<string, unknown> | null,
): void {
  const original = Component.render;
  if (typeof original !== 'function') return;
  Component.render = function patchedRender(props: unknown, ref: unknown) {
    const p = (props ?? {}) as { maxFontSizeMultiplier?: number; style?: unknown };
    // A component that sets its own maxFontSizeMultiplier still wins; otherwise default to the cap.
    let next = p.maxFontSizeMultiplier != null ? p : { maxFontSizeMultiplier: cap, ...p };
    // Prepend the platform base so the element's own `style` (later in the array) overrides it.
    if (baseStyle) next = { ...next, style: [baseStyle, p.style] };
    return original.call(this, next, ref);
  };
}
