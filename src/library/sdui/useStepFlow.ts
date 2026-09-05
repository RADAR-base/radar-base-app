import { useCallback, useRef, useState } from 'react';

/** Direction of the last step move: 1 = forward (advancing), -1 = back. */
export type StepDirection = 1 | -1;

export interface StepFlow {
  /** Current step index (0-based). */
  index: number;
  /** Direction of the last move — lets a slider animate forward vs back. */
  direction: StepDirection;
  /** Linear progress across the steps, 0..1 (handy for a progress bar; equals 1 when count <= 1). */
  progress: number;
  isFirst: boolean;
  isLast: boolean;
  /** Jump to a specific step (clamped). Sets `direction` from the current index. */
  go: (to: number) => void;
  /** Advance one step. */
  next: () => void;
  /** Go back one step. */
  back: () => void;
}

/**
 * Minimal linear step controller for a wizard-style flow (registration, questionnaire, …). Tracks
 * the current step index plus the direction of the last move, and derives a 0..1 progress. It owns
 * no view concerns — pair it with `StepSlider` for the transition and any header for the progress.
 */
export function useStepFlow(count: number, initial = 0): StepFlow {
  const [index, setIndex] = useState(initial);
  const [direction, setDirection] = useState<StepDirection>(1);
  // Ref mirror so go/next/back stay referentially stable (don't depend on `index`).
  const indexRef = useRef(index);
  indexRef.current = index;

  const go = useCallback(
    (to: number) => {
      const clamped = Math.max(0, Math.min(count - 1, to));
      if (clamped === indexRef.current) return;
      setDirection(clamped > indexRef.current ? 1 : -1);
      setIndex(clamped);
    },
    [count],
  );

  const next = useCallback(() => go(indexRef.current + 1), [go]);
  const back = useCallback(() => go(indexRef.current - 1), [go]);

  const progress = count > 1 ? index / (count - 1) : 1;

  return {
    index,
    direction,
    progress,
    isFirst: index === 0,
    isLast: index === count - 1,
    go,
    next,
    back,
  };
}
