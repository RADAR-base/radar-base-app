import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, PanResponder, useWindowDimensions } from 'react-native';
import { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/** How close to the left edge (px) a touch must begin to count as a back-swipe. */
const EDGE_WIDTH = 28;

/**
 * Drives a "push" transition between the current screen and a child overlay. The overlay slides in
 * from the right on `open` and back out to the right on `close`, while the base screen slides one
 * screen-width to the left in lockstep — a filmstrip. The overlay stays mounted until the slide-out
 * finishes (unmounted in the timing callback), so the exit always animates. Used for full-screen
 * pushes; within a stepped flow, step-to-step transitions use `StepSlider` instead.
 *
 * Apply `baseStyle` to the current screen and `overlayStyle` to the pushed overlay (both on
 * absolutely-filled `Animated.View`s), and mount the overlay while `visible` is true. Spread
 * `panHandlers` onto the overlay's `Animated.View` to enable the iOS-style **edge-swipe back**: a
 * drag that begins within `EDGE_WIDTH` of the left edge drags the overlay off to the right and, past
 * a threshold (or on a fast fling), dismisses it — otherwise it snaps back. The gesture only claims
 * touches that start at the edge and move horizontally, so page content (buttons, scroll) is untouched.
 */
export function useSlideOverlay(duration = 250, onClosed?: () => void) {
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
      if (finished) {
        runOnJS(setVisible)(false);
        // Notify the owner (e.g. so a shell can pop its view stack) after the exit animation, no
        // matter which path triggered the close — button, edge-swipe, or Android back.
        if (onClosed) runOnJS(onClosed)();
      }
    });
  }, [x, width, duration, onClosed]);

  // Android: while the overlay is open, intercept the system back (the hardware button AND the
  // gesture-nav back-swipe both fire `hardwareBackPress`) to close it — returning true so it doesn't
  // fall through to the OS and exit the app. No handler is registered while hidden.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [visible, close]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Claim only a rightward drag that STARTED within EDGE_WIDTH of the left screen edge, so the
        // gesture never steals taps/scrolls from the page content (which begin further in).
        onMoveShouldSetPanResponder: (evt, g) => {
          const startX = evt.nativeEvent.pageX - g.dx;
          return startX <= EDGE_WIDTH && g.dx > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
        },
        // Follow the finger: drag the overlay to the right (never past its resting 0).
        onPanResponderMove: (_evt, g) => {
          x.value = Math.max(0, g.dx);
        },
        // Release: dismiss if dragged past a third of the width or flung fast; else snap back open.
        onPanResponderRelease: (_evt, g) => {
          if (g.dx > width * 0.33 || g.vx > 0.5) {
            x.value = withTiming(width, { duration }, (finished) => {
              if (finished) {
                runOnJS(setVisible)(false);
                if (onClosed) runOnJS(onClosed)();
              }
            });
          } else {
            x.value = withTiming(0, { duration });
          }
        },
        // If the gesture is interrupted, snap back open.
        onPanResponderTerminate: () => {
          x.value = withTiming(0, { duration });
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [x, width, duration, onClosed],
  );

  return { visible, open, close, baseStyle, overlayStyle, panHandlers: panResponder.panHandlers };
}
