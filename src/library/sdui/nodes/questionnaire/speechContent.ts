import type { Question } from '../../../../types';

/**
 * Where a speech question's read-aloud passage and its heading actually live.
 *
 * Definitions are inconsistent about this. Most aRMT speech questions leave `field_label` empty and
 * put the passage in `select_choices_or_calculations`, with only a heading in `section_header`.
 * Others put the passage straight in `field_label`. Both have to end up in the same place on screen —
 * the passage in `SpeechInput`'s card, the heading above it — or the same question renders two
 * different ways depending on which field the study happened to use.
 *
 * Derived here rather than in each component, because the screen decides what the heading is and the
 * renderer decides what the passage is, and the two must not disagree about which field is which.
 */
export function speechContent(question?: Question): {
  /** The text to read aloud. Belongs in the passage card. */
  passage?: string;
  /** The line above it. Never the passage itself. */
  heading?: string;
} {
  const choices = (question?.select_choices_or_calculations ?? [])
    .map((choice) => choice?.label?.trim())
    .filter((label): label is string => !!label);
  const fromChoices = choices.length > 0 ? choices.join('\n\n') : undefined;
  const note = question?.field_note?.trim() || undefined;
  const label = question?.field_label?.trim() || undefined;
  const header = question?.section_header?.trim() || undefined;

  const passage = fromChoices ?? note ?? label;
  // `field_label` is the heading only when it isn't already doing duty as the passage.
  const heading = passage === label ? header : (label ?? header);

  return { passage, heading };
}
