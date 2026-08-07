import React, { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { StepDirection } from './useStepFlow';

export interface StepSliderProps {
  /** Current step index. */
  index: number;
  /** Direction of the last move: 1 = incoming enters from the right, -1 = from the left. */
  direction: StepDirection;
  /** Transition duration in ms. */
  duration?: number;
  /** Renders the content for a given step index. */
  children: (index: number) => React.ReactNode;
}

/**
 * Slides between step views horizontally: on an index change the incoming view enters from the
 * `direction` side while the outgoing view exits the opposite way, then the outgoing view is
 * dropped. Only the content moves — a persistent header above (or a background behind) stays put.
 * Pair with `useStepFlow`, which supplies `index` and `direction`.
 */
export function StepSlider({ index, direction, duration = 260, children }: StepSliderProps) {
  const { width } = useWindowDimensions();
  // `curr` is the settled step; during a transition `prev` is the outgoing one (else null).
  const [panels, setPanels] = useState<{ curr: number; prev: number | null; dir: StepDirection }>({
    curr: index,
    prev: null,
    dir: 1,
  });
  const progress = useSharedValue(1); // 0 at the start of a transition, 1 when settled

  const settle = () => setPanels((p) => ({ ...p, prev: null }));

  useEffect(() => {
    if (index === panels.curr) return;
    setPanels({ curr: index, prev: panels.curr, dir: direction });
    progress.value = 0;
    progress.value = withTiming(1, { duration }, (finished) => {
      if (finished) runOnJS(settle)();
    });
    // Only react to index changes; `direction` is read alongside it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Incoming: from dir*width → 0. Outgoing: from 0 → -dir*width. Together they always cover the
  // viewport during the transition, so the background never peeks through.
  const currStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [panels.dir * width, 0]) }],
  }));
  const prevStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [0, -panels.dir * width]) }],
  }));

  return (
    <View style={styles.viewport}>
      {panels.prev !== null && (
        <Animated.View style={[StyleSheet.absoluteFill, prevStyle]} pointerEvents="none">
          {children(panels.prev)}
        </Animated.View>
      )}
      <Animated.View style={[StyleSheet.absoluteFill, currStyle]}>{children(panels.curr)}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
});
