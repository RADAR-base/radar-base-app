import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { StepDirection } from './useStepFlow';

export interface StepSliderProps {
  /** Current step index. */
  index: number;
  /**
   * @deprecated No longer needed — slide direction is derived automatically from the index change
   * (forward slides in from the right, back from the left). Kept for API compatibility.
   */
  direction?: StepDirection;
  /** Transition duration in ms. */
  duration?: number;
  /**
   * Total number of steps. Supply it to keep the neighbouring steps mounted — see the note on
   * windowing below. Without it only the steps involved in the current transition are rendered, which
   * means the incoming one mounts as it slides.
   */
  count?: number;
  /** Renders the content for a given step index. */
  children: (index: number) => React.ReactNode;
}

/**
 * Slides between step views horizontally: on an index change the incoming view enters from the side
 * (right when advancing, left when going back) while the outgoing view exits the opposite way. Only
 * the content moves — a persistent header above (or a background behind) stays put. Pair with
 * `useStepFlow`, which supplies `index`.
 *
 * Positions are driven by a single `position` shared value that animates between absolute step
 * indices — it is **not** reset per transition, so there's no reset-to-0 for the first paint to race
 * with (the source of a one-frame blink otherwise).
 *
 * ## Windowing
 *
 * With `count`, the step either side of the current one stays mounted. That matters because a step
 * that mounts *as it slides* runs its whole subtree — effects, `onLayout` measurements, any state
 * that settles after the first paint — during the animation, and every one of those lands as a
 * visible jump partway through the transition. Pre-mounting means the panel arriving on screen was
 * laid out and settled long before it started moving.
 *
 * The window only grows **at rest**: during a transition the mounted set is left exactly as it was,
 * so nothing mounts mid-slide either. The newly adjacent step is mounted once the animation lands,
 * off-screen, where the cost is invisible.
 */
export function StepSlider({ index, duration = 260, count, children }: StepSliderProps) {
  const { width } = useWindowDimensions();
  const position = useSharedValue(index);

  // The steps currently in the tree. Recomputed only when a transition settles — never during one.
  const [mounted, setMounted] = useState<number[]>(() => windowAround(index, count));
  // The step the last animation was heading for, so a settle can tell whether it is still current.
  const [settledIndex, setSettledIndex] = useState(index);

  useEffect(() => {
    if (index === settledIndex) return;
    position.value = withTiming(index, { duration }, (finished) => {
      // A superseded transition reports finished=false, so only the last one settles.
      if (finished) runOnJS(setSettledIndex)(index);
    });
    // Only react to index changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Widen the window once settled — mounting the next neighbour while nothing is moving.
  useEffect(() => {
    setMounted((current) => {
      const next = windowAround(settledIndex, count);
      return sameSteps(current, next) ? current : next;
    });
  }, [settledIndex, count]);

  // A step being transitioned to may sit outside the mounted window (a jump of more than one, or the
  // very first change before anything settled). Add it without dropping what's already there, so the
  // outgoing panel stays put for its exit.
  const rendered = useMemo(
    () => (mounted.includes(index) ? mounted : [...mounted, index].sort((a, b) => a - b)),
    [mounted, index],
  );

  return (
    <View style={styles.viewport}>
      {rendered.map((step) => (
        <Panel key={step} step={step} index={index} position={position} width={width}>
          {children(step)}
        </Panel>
      ))}
    </View>
  );
}

/**
 * One step, held at `(its index − current position) × width`: the incoming panel enters from the side
 * as `position` advances toward it, the outgoing one exits the opposite way, and at rest the current
 * step sits at 0 with its neighbours parked exactly one screen away.
 */
function Panel({
  step,
  index,
  position,
  width,
  children,
}: {
  step: number;
  index: number;
  position: Animated.SharedValue<number>;
  width: number;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (step - position.value) * width }],
  }));
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, style]}
      // Only the current step takes touches — a parked neighbour is off-screen but still mounted, and
      // would otherwise swallow gestures at the edges.
      pointerEvents={step === index ? 'auto' : 'none'}
    >
      {children}
    </Animated.View>
  );
}

/** The step and its neighbours, clipped to `[0, count)` when the total is known. */
function windowAround(index: number, count?: number): number[] {
  if (count === undefined) return [index];
  const steps: number[] = [];
  for (let step = index - 1; step <= index + 1; step++) {
    if (step >= 0 && step < count) steps.push(step);
  }
  return steps;
}

function sameSteps(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((step, i) => step === b[i]);
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
});
