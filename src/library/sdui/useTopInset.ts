import { Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Top spacing that clears the status bar / notch, with extra breathing room on Android.
 *
 * Intended for edge-to-edge apps (Android `edgeToEdgeEnabled`), where content draws behind the
 * status bar and must be inset by hand. Android status bars are short (~24px) — much less than iOS's
 * notch inset — so a header pushed down by only `insets.top` sits cramped against the bezel. This
 * clears the status bar (falling back to the measured height if the inset is reported as 0) and adds
 * a gutter on Android for breathing room. iOS keeps its native inset unchanged.
 *
 * @param gutter Extra Android-only breathing space above the status bar. Default 12.
 */
export function useTopInset(gutter = 12): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS !== 'android') return insets.top;
  const statusBar = Math.max(insets.top, StatusBar.currentHeight ?? 0);
  return statusBar + gutter;
}
