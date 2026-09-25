import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Question } from '../../../../types';
import { RadioInput } from './RadioInput';
import { CheckboxInput } from './CheckboxInput';
import { MatrixRadioRows } from './MatrixRadioRows';
import { isMatrixQuestion } from './matrixGroups';
import { RangeInput } from './RangeInput';
import { SliderInput } from './SliderInput';
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
   * The whole page, when it holds more than this one question.
   *
   * Only a matrix block ever does: its rows share a screen, so the page is the unit rather than the
   * question. `question` stays the first row, so every other field type is unaffected — they simply
   * never set this.
   */
  questions?: Question[];
  /** Block form: answers by field name, since a block writes to several. */
  answers?: Record<string, unknown>;
  /** Block form: records one row's answer. Required for a block; `onChange` can't name a field. */
  onAnswer?: (fieldName: string, value: string) => void;
  /**
   * The page behind the input.
   *
   * Only the matrix rows read it, to fade their ends into it. It must be the page's actual colour, not
   * a surface derived from the brand — a near-miss reads as a band across the list rather than as the
   * list going.
   */
  backgroundColor?: string;
  /**
   * Space an input that scrolls itself must keep clear at the bottom — the footer's footprint.
   *
   * Only the matrix rows read it: their panel stops reserving that space so their scroller can run to
   * the bottom of the screen, which leaves the reserve theirs to apply as content padding.
   */
  bottomReserve?: number;
  /**
   * The page's horizontal inset, for an input that needs to reach past it.
   *
   * Only the matrix rows read it: their scroller clips, and flush against the padded edge it would cut
   * the cards' shadows off down one side.
   */
  pageInset?: number;
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
  questions,
  answers,
  onAnswer,
  backgroundColor,
  bottomReserve,
  pageInset,
}: QuestionRendererProps) {
  const isRequired = question.required_field === 'y';
  // Hosts that don't theme their inputs still get something coherent: the brand as the selected fill
  // and a faint tint of it as the card surface.
  const radioAccent = accentColor ?? primaryColor;
  const radioSurface = surfaceColor ?? withAlpha(primaryColor, 0.08);

  /**
   * Whether this page is a matrix block — hoisted out of `renderInput` because the container needs it
   * too: the block scrolls itself, so it has to be given a height to scroll within.
   */
  const isMatrix = isMatrixQuestion(question);

  return (
    <View style={[styles.container, isMatrix && styles.containerFill]}>
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
    /**
     * A matrix block, before the per-field switch.
     *
     * It is the one thing here that isn't a field type rendered on its own: its rows share a screen,
     * so the unit is the page. A lone row goes through the same component as a block of one, so it
     * looks the same whether or not it was gathered with neighbours.
     *
     * A row only misses this if it offers nothing to choose from or more than the track can fit; see
     * `MATRIX_ROWS_MAX_CHOICES`. Those fall to the plain radio list in the switch below, which is
     * honest at any length.
     */

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
            accentColor={radioAccent}
            surfaceColor={radioSurface}
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

      case 'matrix-radio': {
        if (isMatrix && onAnswer) {
          const page = questions?.length ? questions : [question];
          return (
            <MatrixRadioRows
              questions={page}
              answers={answers ?? (question.field_name ? { [question.field_name]: value } : {})}
              onAnswer={onAnswer}
              accentColor={radioAccent}
              surfaceColor={radioSurface}
              textColor={textColor}
              backgroundColor={backgroundColor ?? radioSurface}
              bottomReserve={bottomReserve}
              pageInset={pageInset}
            />
          );
        }
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
      }

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
function deriveRange(question: Question) {
  const min = question.text_validation_min ? Number(question.text_validation_min) : 0;
  const max = question.text_validation_max ? Number(question.text_validation_max) : 10;
  return { min, max, step: 1 };
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  /**
   * For an input that scrolls itself: take the panel's height rather than the content's.
   *
   * The trailing margin goes with it. A container that fills has nothing after it for a margin to
   * separate it from, and leaving it on holds the input's bottom edge 20pt above the panel's — which
   * anything positioning itself against that edge, such as the rows' bottom fade, then inherits.
   */
  containerFill: {
    flex: 1,
    marginBottom: 0,
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
