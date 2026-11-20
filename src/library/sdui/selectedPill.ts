import { withAlpha } from '../../theme/theme';

/** Strength of the selected highlight: a translucent tint of the icon / label colour. */
export const SELECTED_TINT = 0.2;

/**
 * The navbar's selected tab, on its navy bar: the icon keeps its colour and sits on a soft tint of it.
 * The data filter's chosen period matches it in dark mode.
 */
export function navSelected(ink: string): { fill: string; ink: string } {
  return { fill: withAlpha(ink, SELECTED_TINT), ink };
}
