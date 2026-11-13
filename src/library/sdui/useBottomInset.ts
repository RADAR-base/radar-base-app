import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Bottom spacing that clears the home indicator / gesture bar / Android navigation bar, for content
 * anchored to the bottom edge of an edge-to-edge screen (button rows, sheets). Returns the bottom
 * safe-area inset plus an optional `gutter` gap above it.
 *
 * The mirror of {@link useTopInset}. There's intentionally no "apply once, globally" version of this:
 * in an edge-to-edge app the backgrounds (mesh, blobs, page fills) must bleed to the screen edges
 * while only the *content* is inset, and different screens inset different edges — so each
 * bottom-anchored screen calls this. It keeps the value + any future platform tweaks in one place
 * instead of repeating `useSafeAreaInsets().bottom` inline.
 *
 * @param gutter Extra space kept above the safe area. Default 0.
 */
export function useBottomInset(gutter = 0): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + gutter;
}
