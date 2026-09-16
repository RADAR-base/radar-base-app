import React, { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { fontFamily, tracking, layout as layoutTokens, withAlpha } from '../../../../theme/theme';

/** How long the hint takes to fade once it has been acted on. */
const FADE_MS = 240;

const PILL_RADIUS = layoutTokens.radiusPill;
const PILL_PAD_X = 12;
const PILL_PAD_Y = 6;

interface DragHintProps {
  /** What to do — "Drag up or down to adjust", and so on. Each slider names its own gesture. */
  text: string;
  /** True once the participant has dragged. The hint fades out and stays gone. */
  dragged: boolean;
  /** Manifest accent; the pill is a faint wash of it. */
  accent: string;
  /** Text colour, already at whatever emphasis the host wants. */
  color: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A one-line invitation to drag, shown until the participant does.
 *
 * Each slider has a gesture that isn't visible: the surface you can drag is much larger than the
 * handle, and on the vertical one the track sits in a gutter while the drag spans the page. Nothing
 * about a handle says any of that, so it's said in words — once.
 *
 * It fades rather than unmounting, so whatever sits above it doesn't shift when it goes. Wrapped in a
 * plain `View` so the pill hugs its text instead of stretching across a stretch-aligned parent, which
 * is what an `Animated.View` on its own would do.
 */
export function DragHint({ text, dragged, accent, color, style }: DragHintProps) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (dragged) opacity.value = withTiming(0, { duration: FADE_MS });
  }, [dragged, opacity]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={[styles.row, style]} pointerEvents="none">
      <Animated.View style={[styles.pill, { backgroundColor: withAlpha(accent, 0.12) }, fade]}>
        <Text style={[styles.text, { color }]} numberOfLines={1}>
          {text}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: PILL_PAD_X,
    paddingVertical: PILL_PAD_Y,
    borderRadius: PILL_RADIUS,
  },
  text: {
    fontSize: 13,
    lineHeight: 17,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
    letterSpacing: tracking.regular,
    includeFontPadding: false,
  },
});
