import React, { useEffect, useState } from 'react';
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
  /** Renders the content for a given step index. */
  children: (index: number) => React.ReactNode;
}

/**
 * Slides between step views horizontally: on an index change the incoming view enters from the side
 * (right when advancing, left when going back) while the outgoing view exits the opposite way, then
 * the outgoing view is dropped. Only the content moves — a persistent header above (or a background
 * behind) stays put. Pair with `useStepFlow`, which supplies `index`.
 *
 * Positions are driven by a single `position` shared value that animates between absolute step
 * indices — it is **not** reset per transition. That's deliberate: when the incoming panel first
 * mounts, `position` still holds the previous index, which already places the panel off-screen, so
 * there's no reset-to-0 for the first paint to race with (the source of a one-frame blink otherwise).
 */
export function StepSlider({ index, duration = 260, children }: StepSliderProps) {
  const { width } = useWindowDimensions();
  const position = useSharedValue(index);
  // `to` is the settling step; during a transition `from` is the outgoing one (else `from === to`).
  const [panels, setPanels] = useState<{ from: number; to: number }>({ from: index, to: index });

  useEffect(() => {
    if (index === panels.to) return;
    setPanels((p) => ({ from: p.to, to: index }));
    position.value = withTiming(index, { duration }, (finished) => {
      // Drop the outgoing panel once fully settled (a new transition sets finished=false, so only the
      // last one collapses the panels).
      if (finished) runOnJS(setPanels)({ from: index, to: index });
    });
    // Only react to index changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Each panel sits at (its index − current position) × width: the incoming panel enters from the
  // side as `position` advances toward it, the outgoing one exits the opposite way; at rest it's at 0.
  const toStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (panels.to - position.value) * width }],
  }));
  const fromStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (panels.from - position.value) * width }],
  }));

  return (
    <View style={styles.viewport}>
      {panels.from !== panels.to && (
        <Animated.View style={[StyleSheet.absoluteFill, fromStyle]} pointerEvents="none">
          {children(panels.from)}
        </Animated.View>
      )}
      <Animated.View style={[StyleSheet.absoluteFill, toStyle]}>{children(panels.to)}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
});
