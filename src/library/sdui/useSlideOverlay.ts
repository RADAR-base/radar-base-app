import { useCallback, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * Drives a "push" transition between the current screen and a child overlay. The overlay slides in
 * from the right on `open` and back out to the right on `close`, while the base screen slides one
 * screen-width to the left in lockstep — a filmstrip. The overlay stays mounted until the slide-out
 * finishes (unmounted in the timing callback), so the exit always animates. Used for full-screen
 * pushes; within a stepped flow, step-to-step transitions use `StepSlider` instead.
 *
 * Apply `baseStyle` to the current screen and `overlayStyle` to the pushed overlay (both on
 * absolutely-filled `Animated.View`s), and mount the overlay while `visible` is true.
 */
export function useSlideOverlay(duration = 250) {
  const { width } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const x = useSharedValue(width);

  const overlayStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const baseStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value - width }] }));

  const open = useCallback(() => {
    setVisible(true);
    x.value = withTiming(0, { duration });
  }, [x, duration]);

  const close = useCallback(() => {
    x.value = withTiming(width, { duration }, (finished) => {
      if (finished) runOnJS(setVisible)(false);
    });
  }, [x, width, duration]);

  return { visible, open, close, baseStyle, overlayStyle };
}
