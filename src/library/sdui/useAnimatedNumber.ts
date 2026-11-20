import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

const DEFAULT_MS = 450;

/** Decimal places a figure is written to, so the count shows no more than the figure itself does. */
function decimalsOf(value: number): number {
  const text = String(value);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : Math.min(2, text.length - dot - 1);
}

/**
 * `target`, counted to from the last figure shown instead of jumping, e.g. when a card's figures
 * change with the Day / Week / Month filter. The first figure appears as it is, and with the
 * system's reduce-motion setting on every change does.
 *
 * On the JS thread, because the result is text; a card re-renders for each frame of the count.
 */
export function useAnimatedNumber(target: number, durationMs = DEFAULT_MS): number {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (reduceMotion || !Number.isFinite(target) || !Number.isFinite(from) || from === target) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const factor = 10 ** decimalsOf(target);
    const started = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - started) / durationMs);
      // Ease out: quick to start, settling onto the figure.
      const eased = 1 - (1 - t) ** 3;
      const value = t === 1 ? target : Math.round((from + (target - from) * eased) * factor) / factor;
      shownRef.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, reduceMotion]);

  return shown;
}
