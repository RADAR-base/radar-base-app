import React, { useEffect, useRef } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const RISE_MS = 260;
const RISE_SHIFT = 8;

/**
 * A style that fades its view up into place each time `key` changes, as the date picker's figures do.
 * Not on first show, not with the system's reduce-motion setting on, and not while `still` (e.g. a
 * figure following a finger, which should keep up rather than replay).
 */
export function useRiseStyle(key: unknown, still = false) {
  const reduceMotion = useReducedMotion();
  const rise = useSharedValue(1);
  const last = useRef(key);

  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    if (still || reduceMotion) return;
    rise.value = withSequence(
      withTiming(0, { duration: 0 }),
      withTiming(1, { duration: RISE_MS, easing: Easing.out(Easing.cubic) }),
    );
  }, [key, still, reduceMotion, rise]);

  return useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [{ translateY: (1 - rise.value) * RISE_SHIFT }],
  }));
}

/** Text that rises into place when it changes; see `useRiseStyle`. */
export function RisingText({
  children,
  style,
  still = false,
  numberOfLines,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
  still?: boolean;
  numberOfLines?: number;
}) {
  const riseStyle = useRiseStyle(children, still);
  return (
    <Animated.Text style={[style, riseStyle]} numberOfLines={numberOfLines}>
      {children}
    </Animated.Text>
  );
}
