import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { SelectChoice } from '../../../../types';

interface RadioInputProps {
  choices: SelectChoice[];
  value: string | undefined;
  onChange: (value: string) => void;
  primaryColor: string;
  textColor: string;
}

export function RadioInput({ choices, value, onChange, primaryColor, textColor }: RadioInputProps) {
  return (
    <View style={styles.container}>
      {choices.map((choice) => {
        const selected = value === choice.code;
        return (
          <TouchableOpacity
            key={choice.code}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(choice.code)}
            style={[styles.option, selected && { backgroundColor: primaryColor + '18', borderColor: primaryColor }]}
          >
            <View style={[styles.radio, { borderColor: selected ? primaryColor : '#ccc' }]}>
              {selected && <View style={[styles.radioInner, { backgroundColor: primaryColor }]} />}
            </View>
            <Text style={[styles.label, { color: textColor }]}>{choice.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 6,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: { fontSize: 14, flex: 1 },
});
