import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Question, QuestionRange } from '../../../../types';
import { RadioInput } from './RadioInput';
import { CheckboxInput } from './CheckboxInput';
import { ArcSliderInput } from './ArcSliderInput';
import { parseChoices, questionScale } from './questionScale';
import { RangeInput } from './RangeInput';
import { SliderInput } from './SliderInput';
import { VerticalSliderInput } from './VerticalSliderInput';
import { ScaleInput } from './ScaleInput';
import { TextQuestionInput } from './TextQuestionInput';
import { InfoScreen } from './InfoScreen';
import { SpeechInput, type SpeechPhase } from './SpeechInput';
import { speechContent } from './speechContent';
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
  /**
   * The page's own background. The sliders cut their step marks out of the track with it, so it has to
   * be the colour actually behind them — resolved by the host from the theme and its brand colours.
   */
  backgroundColor?: string;
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
  /**
   * What the host keeps below the input — its footer, plus the space between the two.
   *
   * Only `slider-vertical` uses it: it sizes itself against the bottom of the window, so it has to
   * know what stands between it and that edge.
   */
  bottomReserve?: number;
}

const DEFAULT_YESNO_CHOICES = [
  { code: '1', label: 'Yes' },
  { code: '0', label: 'No' },
];

/**
 * Types laid out as a scale: one control that takes the whole page under the question text.
 *
 * `QuestionnaireScreenNode` keys its fill styles off this — the same two it always had, plus the
 * vertical slider.
 */
export const SCALE_TYPES = ['range', 'slider', 'slider-vertical', 'slider-scale'];

/**
 * Types whose control sizes itself from the height it is *given* rather than from its own content.
 *
 * Only the vertical slider: it divides the available height between its rows, so a parent that sizes
 * to content leaves it measuring zero and nothing but the handle is drawn. The others have intrinsic
 * height — a numeral and a track, an arc sized from its width — and are left to size themselves, the
 * way they always have.
 */
export const HEIGHT_DRIVEN_TYPES = ['slider-vertical', 'range'];

/**
 * A concrete `QuestionRange` for the controls that still require one.
 *
 * `range` is optional on a definition — plenty of questions carry their scale in
 * `select_choices_or_calculations` instead — so it can't be handed straight to a control that needs
 * bounds. `deriveRange` used to paper over that; `questionScale` replaced it, and reading the bounds
 * back off the derived scale keeps both paths going through the same rules, labels included.
 */
function concreteRange(question: Question): QuestionRange {
  const scale = questionScale(question.range, question.select_choices_or_calculations);
  const min = scale.values[0];
  const max = scale.values[scale.values.length - 1];
  return {
    min,
    max,
    // `values` is ordered and never empty, so a second entry is the step the scale actually advances
    // by — and a single-value scale has no gap to describe.
    step: scale.values.length > 1 ? scale.values[1] - min : 1,
    labelLeft: scale.minLabel,
    labelRight: scale.maxLabel,
  };
}

export function QuestionRenderer({
  question,
  value,
  onChange,
  primaryColor,
  textColor,
  textSecondaryColor,
  accentColor,
  surfaceColor,
  backgroundColor,
  hideHeader = false,
  mode,
  onContinue,
  onPhaseChange,
  allowReplay,
  bottomReserve,
}: QuestionRendererProps) {
  const isRequired = question.required_field === 'y';
  // Hosts that don't theme their inputs still get something coherent: the brand as the selected fill
  // and a faint tint of it as the card surface.
  const radioAccent = accentColor ?? primaryColor;
  const radioSurface = surfaceColor ?? withAlpha(primaryColor, 0.08);

  // Pass the height through only where the control needs it — see `HEIGHT_DRIVEN_TYPES`.
  const isScale = HEIGHT_DRIVEN_TYPES.includes(question.field_type ?? '');

  return (
    <View style={[styles.container, isScale && styles.fill]}>
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
            choices={parseChoices(question.select_choices_or_calculations)}
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
            choices={parseChoices(question.select_choices_or_calculations)}
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
            range={concreteRange(question)}
            value={typeof value === 'number' ? value : undefined}
            onChange={onChange}
            primaryColor={primaryColor}
            textColor={textColor}
            textSecondaryColor={textSecondaryColor}
          />
        );

      // The straight track, with the value reading out above it.
      case 'slider':
        return (
          <SliderInput
            range={question.range}
            choices={parseChoices(question.select_choices_or_calculations)}
            value={typeof value === 'number' ? value : undefined}
            onChange={onChange}
            accentColor={accentColor}
            backgroundColor={backgroundColor}
            primaryColor={primaryColor}
            textColor={textColor}
          />
        );

      // Down the screen, with every step named beside it.
      case 'slider-vertical':
        return (
          <VerticalSliderInput
            range={question.range}
            choices={parseChoices(question.select_choices_or_calculations)}
            value={typeof value === 'number' ? value : undefined}
            onChange={onChange}
            accentColor={accentColor}
            backgroundColor={backgroundColor}
            primaryColor={primaryColor}
            textColor={textColor}
            bottomReserve={bottomReserve}
          />
        );

      // The scale drawn as its own numbers, tappable as well as draggable.
      case 'slider-scale':
        return (
          <ScaleInput
            range={question.range}
            choices={parseChoices(question.select_choices_or_calculations)}
            value={typeof value === 'number' ? value : undefined}
            onChange={onChange}
            accentColor={accentColor}
            backgroundColor={backgroundColor}
            primaryColor={primaryColor}
            textColor={textColor}
          />
        );

      // The arc: a labelled scale reads well bent round, and the value sits in the bowl.
      case 'slider-arc':
        return (
          <ArcSliderInput
            range={question.range}
            choices={parseChoices(question.select_choices_or_calculations)}
            value={typeof value === 'number' ? value : undefined}
            onChange={onChange}
            accentColor={accentColor}
            backgroundColor={backgroundColor}
            textColor={textColor}
            primaryColor={primaryColor}
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
            prompt={speechContent(question).passage}
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
            choices={parseChoices(question.select_choices_or_calculations)}
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

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  /** Hands the scale the height its parent gave us, instead of collapsing to its content. */
  fill: {
    flex: 1,
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
