import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Question } from '../../../../types';
import { RadioInput } from './RadioInput';
import { LikertSliderInput } from './LikertSliderInput';
import { CheckboxInput } from './CheckboxInput';
import { ArcSliderInput } from './ArcSliderInput';
import { parseChoices } from './questionScale';
import { MatrixRadioRows } from './MatrixRadioRows';
import { isMatrixQuestion } from './matrixGroups';
import { SliderInput } from './SliderInput';
import { VerticalSliderInput } from './VerticalSliderInput';
import { ScaleInput } from './ScaleInput';
import { TextQuestionInput } from './TextQuestionInput';
import { InfoScreen } from './InfoScreen';
import { SpeechInput, type SpeechPhase } from './SpeechInput';
import { speechContent } from './speechContent';
import { QuestionError } from './QuestionError';
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
   * The page's own background — its actual colour, not a surface derived from the brand.
   *
   * The sliders cut their step marks out of the track with it, and the matrix rows fade their ends
   * into it; for both, a near-miss shows as a band where the page is supposed to be.
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
   * Space an input that scrolls itself must keep clear at the bottom — the footer's footprint.
   *
   * Two inputs read it. The matrix rows, whose panel stops reserving that space so their scroller can
   * run to the bottom of the screen; and `slider-vertical`, which sizes itself against the bottom of
   * the window and so has to know what stands between it and that edge.
   */
  bottomReserve?: number;
  /**
   * The page's horizontal inset, for an input that needs to reach past it.
   *
   * Only the matrix rows read it: their scroller clips, and flush against the padded edge it would cut
   * the cards' shadows off down one side.
   */
  pageInset?: number;
  /** How many times the participant has tried to move on — text inputs surface their errors, and
   *  shake, from here. */
  submitAttempt?: number;
  /** Reports whether the current answer would pass, so the screen knows to hold them here. */
  onValidityChange?: (valid: boolean) => void;
  /**
   * Lets an input hold its panel still while it is being dragged.
   *
   * Only a control that takes a drag inside a scrolling page needs it — see `LikertSliderInput`,
   * where a vertical flick would otherwise scroll the page instead of moving the handle.
   */
  onScrollLock?: (locked: boolean) => void;
  /**
   * Why this question was refused. Rendered under the input for every type except `text`, which draws
   * its own lined up with its card.
   */
  errorMessage?: string | null;
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
 *
 * Adding a type here hands its control the whole screen's height, which is not free: a control laid
 * out with `space-between` then spreads across all of it, and the distance between its halves becomes
 * whatever is left over rather than its own `gap`. That is what put a screen-high gap between the
 * horizontal slider's value and its track while `range` was listed here.
 */
export const HEIGHT_DRIVEN_TYPES = ['slider-vertical'];


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
  questions,
  answers,
  onAnswer,
  bottomReserve,
  pageInset,
  submitAttempt,
  onValidityChange,
  onScrollLock,
  errorMessage,
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
  // Pass the height through only where the control needs it — see `HEIGHT_DRIVEN_TYPES`.
  const isScale = HEIGHT_DRIVEN_TYPES.includes(question.field_type ?? '');

  return (
    <View style={[styles.container, isMatrix && styles.containerFill, isScale && styles.fill]}>
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

      {/* Under the input, inside this container — a sibling of the container outside it would sit
          below its bottom margin as well as the panel's gap, putting the message more than twice as
          far from a radio group as from a text field. `text` is excluded: it draws its own, lined up
          with its card. */}
      {question.field_type !== 'text' ? (
        <QuestionError
          message={errorMessage}
          style={styles.error}
          shakeKey={submitAttempt}
        />
      ) : null}
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
      case 'radio': {
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
      }

      case 'likert-emoji': {
        return (
          <LikertSliderInput
            choices={parseChoices(question.select_choices_or_calculations)}
            value={value != null ? String(value) : undefined}
            onChange={onChange}
            primaryColor={primaryColor}
            textColor={textColor}
            accentColor={radioAccent}
            surfaceColor={radioSurface}
            backgroundColor={backgroundColor}
            onScrollLock={onScrollLock}
          />
        );
      }


      case 'checkbox':
        return (
          <CheckboxInput
            choices={parseChoices(question.select_choices_or_calculations)}
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
          <ScaleInput
            range={question.range}
            choices={parseChoices(question.select_choices_or_calculations)}
            value={typeof value === 'number' ? value : undefined}
            onChange={onChange}
            accentColor={accentColor}
            backgroundColor={backgroundColor}
            primaryColor={primaryColor}
            textColor={textColor}
            onScrollLock={onScrollLock}
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
            onScrollLock={onScrollLock}
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
            onScrollLock={onScrollLock}
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
            onScrollLock={onScrollLock}
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
            primaryColor={primaryColor}
            textColor={textColor}
            onScrollLock={onScrollLock}
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
            accentColor={accentColor}
            surfaceColor={surfaceColor}
            submitAttempt={submitAttempt}
            onValidityChange={onValidityChange}
            errorMessage={errorMessage}
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
              primaryColor={primaryColor}
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
  /** The gap above the message — matched to the text field's own. */
  error: {
    marginTop: 16,
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
