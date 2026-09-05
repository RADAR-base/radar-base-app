import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { fontFamily } from '../../../../theme/theme';

interface TextQuestionInputProps {
  validationType?: string;
  textValidationMin?: string;
  textValidationMax?: string;
  value: string | undefined;
  onChange: (value: string) => void;
  primaryColor: string;
  textColor: string;
  textSecondaryColor: string;
}

export function TextQuestionInput({
  validationType,
  textValidationMin,
  textValidationMax,
  value,
  onChange,
  primaryColor,
  textColor,
  textSecondaryColor,
}: TextQuestionInputProps) {
  const [warning, setWarning] = useState<string | null>(null);

  const isNumeric = validationType === 'number' || validationType === 'integer';
  const keyboardType = isNumeric ? 'numeric' as const : 'default' as const;
  const multiline = !isNumeric && validationType !== 'email' && validationType !== 'phone';

  const handleChange = (text: string) => {
    onChange(text);

    if (isNumeric && text) {
      const num = Number(text);
      if (isNaN(num)) {
        setWarning('Please enter a valid number');
        return;
      }
      if (textValidationMin && num < Number(textValidationMin)) {
        setWarning(`Minimum value: ${textValidationMin}`);
        return;
      }
      if (textValidationMax && num > Number(textValidationMax)) {
        setWarning(`Maximum value: ${textValidationMax}`);
        return;
      }
    }
    setWarning(null);
  };

  const placeholder = isNumeric
    ? (textValidationMin && textValidationMax
        ? `Enter value (${textValidationMin}–${textValidationMax})`
        : 'Enter number')
    : 'Enter your response';

  return (
    <View style={styles.container}>
      <TextInput
        style={[
          multiline ? styles.multilineInput : styles.singleInput,
          { borderColor: warning ? '#dc3545' : '#ccc', color: textColor },
        ]}
        value={value ?? ''}
        onChangeText={handleChange}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={textSecondaryColor}
        multiline={multiline}
        autoCapitalize={validationType === 'email' ? 'none' : 'sentences'}
        autoCorrect={validationType !== 'email'}
      />
      {warning && <Text style={styles.warning}>{warning}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8 },
  singleInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    backgroundColor: '#fff',
  },
  multilineInput: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    backgroundColor: '#fff',
    textAlignVertical: 'top',
  },
  warning: {
    color: '#dc3545',
    fontSize: 12,
    fontFamily: fontFamily.regular,
    includeFontPadding: false,
    marginTop: 4,
  },
});
