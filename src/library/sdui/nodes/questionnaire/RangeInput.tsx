import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { QuestionRange } from '../../../../types';

interface RangeInputProps {
  range: QuestionRange;
  value: number | undefined;
  onChange: (value: number) => void;
  primaryColor: string;
  textColor: string;
  textSecondaryColor: string;
}

export function RangeInput({ range, value, onChange, primaryColor, textColor, textSecondaryColor }: RangeInputProps) {
  const { min, max, step = 1, labelLeft, labelRight } = range;
  const count = Math.floor((max - min) / step) + 1;

  return (
    <View style={styles.container}>
      {(labelLeft || labelRight) && (
        <View style={styles.labelRow}>
          {labelLeft ? <Text style={[styles.rangeLabel, { color: textSecondaryColor }]}>{labelLeft}</Text> : <View />}
          {labelRight ? <Text style={[styles.rangeLabel, { color: textSecondaryColor }]}>{labelRight}</Text> : <View />}
        </View>
      )}
      <View style={styles.buttonsRow}>
        {Array.from({ length: count }, (_, i) => {
          const val = min + i * step;
          const selected = value === val;
          return (
            <TouchableOpacity
              key={val}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(val)}
              style={[
                styles.button,
                selected && { backgroundColor: primaryColor, borderColor: primaryColor },
              ]}
            >
              <Text style={[styles.buttonText, { color: selected ? '#fff' : textColor }]}>
                {val}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  rangeLabel: { fontSize: 12 },
  buttonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  button: {
    minWidth: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  buttonText: { fontSize: 14, fontWeight: '600' },
});
