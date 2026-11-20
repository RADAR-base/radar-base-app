import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import {
  getColorTokens,
  readableTextColor,
  textStyle,
  type ThemeColorOverrides,
  type ThemeMode,
} from '../../../theme/theme';
import {
  DATA_RANGES,
  isDataRange,
  setDataRange,
  setDefaultDataRange,
  useDataRange,
  type DataRange,
} from '../dataRange';
import { usePageScroll } from '../PageScrollContext';
import { navSelected } from '../selectedPill';
import type { NodeProps } from '../types';

const TRACK_PADDING = 4;
const SLIDE_MS = 220;

const LABELS: Record<DataRange, string> = { day: 'Day', week: 'Week', month: 'Month' };

/** The blueprint's `ranges`, or all three; a single option isn't a choice, so that falls back too. */
export function rangeOptions(raw: unknown): DataRange[] {
  const ranges = Array.isArray(raw) ? raw.filter(isDataRange) : DATA_RANGES;
  return ranges.length > 1 ? ranges : DATA_RANGES;
}

/** Day / Week / Month (Figma 4533:582): a navy track with the chosen period on a sliding card pill. */
export function DataRangeControl({
  range,
  onChange,
  options = DATA_RANGES,
  mode,
  brandColors,
}: {
  range: DataRange;
  onChange: (range: DataRange) => void;
  options?: DataRange[];
  mode: ThemeMode;
  brandColors?: ThemeColorOverrides;
}) {
  const tokens = getColorTokens(mode, brandColors);
  const { navbar } = tokens;
  // The navbar's navy track in both modes. The chosen period is a white pill in the light theme's navy,
  // and in dark mode the navbar's own selected look (`navSelected`): a soft tint of the white label.
  const light = getColorTokens('light', brandColors);
  const trackColor = navbar.surface.background;
  const dark = mode === 'dark' ? navSelected(navbar.text.primary) : null;
  const pillColor = dark?.fill ?? light.card.background;
  const selectedInk =
    dark?.ink ??
    readableTextColor(pillColor, { preferred: brandColors?.brand ?? light.button.background });
  const idleInk = navbar.text.primary;

  const index = Math.max(0, options.indexOf(range));
  // The pill slides between segments rather than jumping, so the change reads as one control.
  const [trackWidth, setTrackWidth] = useState(0);
  const segment = trackWidth > 0 ? (trackWidth - TRACK_PADDING * 2) / options.length : 0;
  const offset = useSharedValue(0);
  useEffect(() => {
    offset.value = withTiming(index * segment, { duration: SLIDE_MS, easing: Easing.out(Easing.cubic) });
  }, [index, segment, offset]);
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: trackColor }]}
    >
      {segment > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, { width: segment, backgroundColor: pillColor }, pillStyle]}
        />
      )}
      {options.map((option) => {
        const selected = option === range;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            style={styles.segment}
          >
            <Text
              style={[
                styles.label,
                selected && styles.labelSelected,
                { color: selected ? selectedInk : idleInk },
              ]}
            >
              {LABELS[option]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The filter as a page node. It sets the range every data card follows, and once scrolled up to the
 * page's header bar it stays pinned under it for the rest of the page.
 */
export function DataRangeNode({ node, context }: NodeProps) {
  const range = useDataRange();

  useEffect(() => {
    if (isDataRange(node.defaultRange)) setDefaultDataRange(node.defaultRange);
  }, [node.defaultRange]);

  // Pinned by sliding the control down by exactly as far as the page has scrolled past it. That is
  // worked out from the scroll offset and the control's fixed place in the page, both current on the
  // same frame, so it holds still; measuring it on screen each frame lags a frame and jitters.
  const page = usePageScroll();
  /** Where the control rests within the page body. */
  const restY = useSharedValue(0);
  const pinStyle = useAnimatedStyle(() => {
    if (!page) return { transform: [{ translateY: 0 }] };
    const contentY = page.bodyTop.value + restY.value;
    const passed = page.scrollY.value + page.pinTop.value - contentY;
    return { transform: [{ translateY: Math.max(0, passed) }] };
  });

  return (
    // Above the cards it passes over. Must sit directly in the page body, as `restY` is relative to it.
    <View
      style={styles.anchor}
      onLayout={(e) => {
        restY.value = e.nativeEvent.layout.y;
      }}
    >
      <Animated.View style={pinStyle}>
        <DataRangeControl
          range={range}
          onChange={setDataRange}
          options={rangeOptions(node.ranges)}
          mode={context.colorScheme ?? 'light'}
          brandColors={context.theme.brandColors}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    zIndex: 1,
  },
  track: {
    width: '100%',
    height: 40,
    flexDirection: 'row',
    padding: TRACK_PADDING,
    borderRadius: 20,
  },
  pill: {
    position: 'absolute',
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    left: TRACK_PADDING,
    borderRadius: 16,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: textStyle(12, 16, 'regular'),
  labelSelected: { ...textStyle(12, 16, 'semiBold'), fontWeight: '600' },
});
