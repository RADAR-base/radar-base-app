import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { SelectChoice } from '../../../../types';

interface CheckboxInputProps {
  choices: SelectChoice[];
  value: string[] | undefined;
  onChange: (value: string[]) => void;
  primaryColor: string;
  textColor: string;
}

export function CheckboxInput({ choices, value = [], onChange, primaryColor, textColor }: CheckboxInputProps) {
  const toggle = (code: string) => {
    const next = value.includes(code)
      ? value.filter(v => v !== code)
      : [...value, code];
    onChange(next);
  };

  return (
    <View style={styles.container}>
      {choices.map((choice) => {
        const checked = value.includes(choice.code);
        return (
          <TouchableOpacity
            key={choice.code}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            onPress={() => toggle(choice.code)}
            style={[styles.option, checked && { backgroundColor: primaryColor + '18', borderColor: primaryColor }]}
          >
            <View style={[styles.checkbox, { borderColor: checked ? primaryColor : '#ccc' }]}>
              {checked && <Text style={[styles.checkmark, { color: primaryColor }]}>✓</Text>}
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
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkmark: { fontSize: 13, fontWeight: '700' },
  label: { fontSize: 14, flex: 1 },
});
