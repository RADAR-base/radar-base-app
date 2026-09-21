import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Question } from '../../../../types';
import { RadioInput } from './RadioInput';
import { CheckboxInput } from './CheckboxInput';
import { RangeInput } from './RangeInput';
import { SliderInput } from './SliderInput';
import { TextQuestionInput } from './TextQuestionInput';
import { InfoScreen } from './InfoScreen';

interface QuestionRendererProps {
  question: Question;
  value: any;
  onChange: (value: any) => void;
  primaryColor: string;
  textColor: string;
  textSecondaryColor: string;
}

const DEFAULT_YESNO_CHOICES = [
  { code: '1', label: 'Yes' },
  { code: '0', label: 'No' },
];

export function QuestionRenderer({
  question,
  value,
  onChange,
  primaryColor,
  textColor,
  textSecondaryColor,
}: QuestionRendererProps) {
  const isRequired = question.required_field === 'y';

  return (
    <View style={styles.container}>
      {question.section_header ? (
        <Text style={[styles.sectionHeader, { color: textSecondaryColor }]}>
          {question.section_header}
        </Text>
      ) : null}

      {question.field_label ? (
        <Text style={[styles.label, { color: textColor }]}>
          {question.field_label}
          {isRequired && <Text style={styles.required}> *</Text>}
        </Text>
      ) : null}

      {question.field_note ? (
        <Text style={[styles.note, { color: textSecondaryColor }]}>
          {question.field_note}
        </Text>
      ) : null}

      {renderInput()}
    </View>
  );

  function renderInput() {
    switch (question.field_type) {
      case 'radio':
        return (
          <RadioInput
            choices={question.select_choices_or_calculations ?? []}
            value={value != null ? String(value) : undefined}
            onChange={onChange}
            primaryColor={primaryColor}
            textColor={textColor}
          />
        );

      case 'checkbox':
        return (
          <CheckboxInput
            choices={question.select_choices_or_calculations ?? []}
            value={Array.isArray(value) ? value : undefined}
            onChange={onChange}
            primaryColor={primaryColor}
            textColor={textColor}
          />
        );

      case 'yesno':
        return (
          <RadioInput
            choices={DEFAULT_YESNO_CHOICES}
            value={value != null ? String(value) : undefined}
            onChange={onChange}
            primaryColor={primaryColor}
            textColor={textColor}
          />
        );

      case 'range':
        return (
          <RangeInput
            range={question.range ?? deriveRange(question)}
            value={typeof value === 'number' ? value : undefined}
            onChange={onChange}
            primaryColor={primaryColor}
            textColor={textColor}
            textSecondaryColor={textSecondaryColor}
          />
        );

      case 'slider':
      case 'slider-vertical':
        return (
          <SliderInput
            range={question.range ?? deriveRange(question)}
            value={typeof value === 'number' ? value : undefined}
            onChange={onChange}
            primaryColor={primaryColor}
            textColor={textColor}
            textSecondaryColor={textSecondaryColor}
          />
        );

      case 'text':
        return (
          <TextQuestionInput
            validationType={question.text_validation_type_or_show_slider_number}
            textValidationMin={question.text_validation_min}
            textValidationMax={question.text_validation_max}
            value={value != null ? String(value) : undefined}
            onChange={onChange}
            primaryColor={primaryColor}
            textColor={textColor}
            textSecondaryColor={textSecondaryColor}
          />
        );

      case 'info':
        return (
          <InfoScreen
            label={question.field_label}
            sections={question.select_choices_or_calculations}
            textColor={textColor}
            textSecondaryColor={textSecondaryColor}
          />
        );

      case 'descriptive':
        return (
          <View style={styles.descriptive}>
            <Text style={[styles.descriptiveText, { color: textSecondaryColor }]}>
              {question.field_label ?? ''}
            </Text>
          </View>
        );

      case 'matrix-radio':
        return (
          <RadioInput
            choices={question.select_choices_or_calculations ?? []}
            value={value != null ? String(value) : undefined}
            onChange={onChange}
            primaryColor={primaryColor}
            textColor={textColor}
          />
        );

      default:
        // Unsupported type — render as text input fallback
        return (
          <TextQuestionInput
            value={value != null ? String(value) : undefined}
            onChange={onChange}
            primaryColor={primaryColor}
            textColor={textColor}
            textSecondaryColor={textSecondaryColor}
          />
        );
    }
  }
}

function deriveRange(question: Question) {
  const min = question.text_validation_min ? Number(question.text_validation_min) : 0;
  const max = question.text_validation_max ? Number(question.text_validation_max) : 10;
  return { min, max, step: 1 };
}

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
  },
  label: { fontSize: 15, fontWeight: '500', lineHeight: 21 },
  required: { color: '#dc3545' },
  note: { fontSize: 12, marginTop: 2, fontStyle: 'italic' },
  descriptive: { marginTop: 8, padding: 12, backgroundColor: '#f8f9fa', borderRadius: 8 },
  descriptiveText: { fontSize: 14, lineHeight: 20 },
});
