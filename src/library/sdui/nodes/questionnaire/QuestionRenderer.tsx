import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Question } from '../../../../types';
import { RadioInput } from './RadioInput';
import { CheckboxInput } from './CheckboxInput';
import { RangeInput } from './RangeInput';
import { SliderInput } from './SliderInput';
import { TextQuestionInput } from './TextQuestionInput';
import { InfoScreen } from './InfoScreen';
import { SpeechInput, type SpeechPhase } from './SpeechInput';
import { fontFamily, withAlpha, type ThemeMode } from '../../../../theme/theme';

interface QuestionRendererProps {
  question: Question;
  value: any;
  onChange: (value: any) => void;
  primaryColor: string;
  textColor: string;
  textSecondaryColor: string;
  /** Manifest accent — fills a selected radio option. Falls back to `primaryColor` when unset. */
  accentColor?: string;
  /** Card surface for unselected options. Falls back to a faint tint of `primaryColor`. */
  surfaceColor?: string;
  /** Skip the section-header / label / note block and render only the input control — for hosts that
   *  already show the question text themselves (e.g. `QuestionnaireScreenNode`'s big title). */
  hideHeader?: boolean;
  /** Active color scheme, for inputs with mode-specific colors (currently the speech passage card). */
  mode?: ThemeMode;
  /** Lets an input advance the questionnaire itself — used by the speech question's "Continue" card. */
  onContinue?: () => void;
  /** Reports the speech question's phase, so the host can adapt its chrome (e.g. hide its footer). */
  onPhaseChange?: (phase: SpeechPhase, meta?: { transition?: boolean }) => void;
  /** Speech questions: may the participant play their recording back? Defaults to true. */
  allowReplay?: boolean;
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
  accentColor,
  surfaceColor,
  hideHeader = false,
  mode,
  onContinue,
  onPhaseChange,
  allowReplay,
}: QuestionRendererProps) {
  const isRequired = question.required_field === 'y';
  // Hosts that don't theme their inputs still get something coherent: the brand as the selected fill
  // and a faint tint of it as the card surface.
  const radioAccent = accentColor ?? primaryColor;
  const radioSurface = surfaceColor ?? withAlpha(primaryColor, 0.08);

  return (
    <View style={styles.container}>
      {!hideHeader && question.section_header ? (
        <Text style={[styles.sectionHeader, { color: textSecondaryColor }]}>
          {question.section_header}
        </Text>
      ) : null}

      {!hideHeader && question.field_label ? (
        <Text style={[styles.label, { color: textColor }]}>
          {question.field_label}
          {isRequired && <Text style={styles.required}> *</Text>}
        </Text>
      ) : null}

      {!hideHeader && question.field_note ? (
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
            accentColor={radioAccent}
            surfaceColor={radioSurface}
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
            accentColor={radioAccent}
            surfaceColor={radioSurface}
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

      // Speech / voice task. Without this it fell through to `default` and rendered a text box.
      // The passage to read aloud is carried by the choices' `label`s (same place `info` keeps its
      // copy), with `field_note` as a fallback; the question text itself is the instruction.
      case 'audio':
        return (
          <SpeechInput
            prompt={choiceText(question) ?? question.field_note}
            value={value}
            onChange={onChange}
            primaryColor={primaryColor}
            textColor={textColor}
            textSecondaryColor={textSecondaryColor}
            mode={mode}
            onContinue={onContinue}
            onPhaseChange={onPhaseChange}
            allowReplay={allowReplay}
            accentColor={accentColor}
          />
        );

      case 'info':
        return (
          <InfoScreen
            label={question.field_label}
            sections={question.select_choices_or_calculations}
            primaryColor={primaryColor}
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
            accentColor={radioAccent}
            surfaceColor={radioSurface}
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

/**
 * Joins the `label`s of `select_choices_or_calculations` into display copy. For non-choice questions
 * (speech, info) that array carries the question's body text rather than selectable options — each
 * entry is a paragraph. Returns undefined when there's nothing usable.
 */
function choiceText(question: Question): string | undefined {
  const labels = (question.select_choices_or_calculations ?? [])
    .map((choice) => choice?.label?.trim())
    .filter((label): label is string => !!label);
  return labels.length > 0 ? labels.join('\n\n') : undefined;
}

function deriveRange(question: Question) {
  const min = question.text_validation_min ? Number(question.text_validation_min) : 0;
  const max = question.text_validation_max ? Number(question.text_validation_max) : 10;
  return { min, max, step: 1 };
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  sectionHeader: {
    fontSize: 13,
    fontFamily: fontFamily.semiBold,
    includeFontPadding: false,
    fontWeight: '600',
    marginBottom: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
  },
  label: { fontSize: 15, fontWeight: '500', lineHeight: 21, fontFamily: fontFamily.medium, includeFontPadding: false },
  required: { color: '#dc3545' },
  note: { fontSize: 12, marginTop: 2, fontStyle: 'italic', fontFamily: fontFamily.regular, includeFontPadding: false },
  descriptive: { marginTop: 8, padding: 12, backgroundColor: '#f8f9fa', borderRadius: 8 },
  descriptiveText: { fontSize: 14, lineHeight: 20, fontFamily: fontFamily.regular, includeFontPadding: false },
});
