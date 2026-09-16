import { useCallback, useRef } from 'react';

/**
 * The lightest tap the API has — the one a picker gives as its numbers roll past.
 *
 * Deliberately not `impactAsync`: a slider crossing a scale fires this many times in a second, and an
 * impact at that rate reads as the phone buzzing rather than the control ticking.
 */
type HapticsModule = { selectionAsync: () => Promise<void> };

/**
 * `expo-haptics`, if the host installed it.
 *
 * Required lazily and tolerated when missing: `@radarbase/app-kit` is consumed by other studies' apps,
 * and a library that hard-depends on a native module makes every one of them rebuild to get a feature
 * they may not want. Resolved once and cached — the failure case is a missing native module, which
 * won't start working later in the session.
 */
let cached: HapticsModule | null | undefined;

function haptics(): HapticsModule | null {
  if (cached !== undefined) return cached;
  try {
    // A `require`, not an `import`: the whole point is to tolerate the package being absent, and a
    // static import would make it a hard dependency of every app that consumes this library.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const mod = require('expo-haptics') as Partial<HapticsModule>;
    cached = typeof mod?.selectionAsync === 'function' ? (mod as HapticsModule) : null;
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * The shortest gap between two ticks.
 *
 * A fast drag across a hundred-step scale crosses steps faster than a person can feel them apart, and
 * on Android the calls queue up behind each other and arrive late. Rate-limiting means a slow drag
 * ticks once per step and a fast one ticks steadily, which is what the gesture actually communicates.
 */
const MIN_GAP_MS = 45;

/**
 * A tick for each step a slider crosses.
 *
 * Call the returned function whenever the value moves to a new step, however it was moved — dragged,
 * tapped, or stepped with an arrow — so every route to a value feels the same.
 *
 * Silent when `expo-haptics` isn't installed, so this is safe to call unconditionally.
 */
export function useStepHaptics(): () => void {
  const last = useRef(0);

  return useCallback(() => {
    const now = Date.now();
    if (now - last.current < MIN_GAP_MS) return;
    last.current = now;
    // Fire and forget: a haptic that fails is not worth interrupting a gesture for, and on a device
    // with the system setting off it rejects every time.
    haptics()
      ?.selectionAsync()
      .catch(() => {});
  }, []);
}
