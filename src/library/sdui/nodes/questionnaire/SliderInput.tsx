import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { QuestionRange } from '../../../../types';
import { fontFamily } from '../../../../theme/theme';

interface SliderInputProps {
  range: QuestionRange;
  value: number | undefined;
  onChange: (value: number) => void;
  primaryColor: string;
  textColor: string;
  textSecondaryColor: string;
}

/**
 * Horizontal slider using a simple touch-based approach.
 * Uses a row of touchable segments since React Native's built-in Slider
 * component is not always available or styled consistently.
 */
export function SliderInput({ range, value, onChange, primaryColor, textColor, textSecondaryColor }: SliderInputProps) {
  const { min, max, step = 1, labelLeft, labelRight } = range;
  const [dragging, setDragging] = useState(false);

  const current = value ?? min;
  const fraction = max > min ? (current - min) / (max - min) : 0;

  return (
    <View style={styles.container}>
      {(labelLeft || labelRight) && (
        <View style={styles.labelRow}>
          {labelLeft ? <Text style={[styles.rangeLabel, { color: textSecondaryColor }]}>{labelLeft}</Text> : <View />}
          {labelRight ? <Text style={[styles.rangeLabel, { color: textSecondaryColor }]}>{labelRight}</Text> : <View />}
        </View>
      )}

      <View
        style={styles.track}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          setDragging(true);
          handleTouch(e.nativeEvent.locationX);
        }}
        onResponderMove={(e) => handleTouch(e.nativeEvent.locationX)}
        onResponderRelease={() => setDragging(false)}
      >
        <View style={[styles.trackFill, { width: `${fraction * 100}%`, backgroundColor: primaryColor }]} />
        <View style={[styles.thumb, { left: `${fraction * 100}%`, backgroundColor: primaryColor, borderColor: dragging ? primaryColor : '#fff' }]} />
      </View>

      <Text style={[styles.valueText, { color: textColor }]}>{current}</Text>
    </View>
  );

  function handleTouch(locationX: number) {
    // Track is rendered with full width; compute value from touch position
    // We estimate track width as ~300 (parent will stretch it)
    const trackWidth = 300; // approximate; good enough for relative position
    const raw = min + (locationX / trackWidth) * (max - min);
    const stepped = Math.round(raw / step) * step;
    const clamped = Math.max(min, Math.min(max, stepped));
    onChange(clamped);
  }
}

const styles = StyleSheet.create({
  container: { marginTop: 8 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  rangeLabel: { fontSize: 12, fontFamily: fontFamily.regular, includeFontPadding: false },
  track: {
    height: 36,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    justifyContent: 'center',
    overflow: 'visible',
  },
  trackFill: {
    height: '100%',
    borderRadius: 4,
  },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    marginLeft: -12,
    top: 6,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  valueText: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: 16,
    fontFamily: fontFamily.semiBold,
    includeFontPadding: false,
    fontWeight: '600',
  },
});
