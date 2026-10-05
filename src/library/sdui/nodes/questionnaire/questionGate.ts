import type { Question } from '../../../../types';

/**
 * Field types that never hold the participant on a page, whatever `required_field` says.
 *
 * All of them for the same reason: there is nothing on the page to answer. `info` and `descriptive`
 * are text, and `timed` and `range-info` have no case in `QuestionRenderer` at all, so they fall
 * through to its default and draw an info screen. A definition that marks one required — or simply
 * leaves `required_field` blank, which reads as required — would otherwise block Next with no way
 * past it. A type listed here leaves the list the day it gains a control.
 *
 * Sliders and scales are deliberately **not** here, though they were for a while. A scale shows a
 * value from its first frame, so requiring one looked like asking for an answer the screen already
 * had — but the real fault was that a drag cancelled by the enclosing scroll view settled the handle
 * without ever reporting it, so the value on screen never reached `answers`. With that fixed, a
 * touched scale records like any other input and there is no reason to exempt it: exempting one
 * would mean accepting a resting position nobody chose as though it were an answer.
 */
export const NON_BLOCKING_TYPES = [
  'info',
  'descriptive',
  'range-info',
  // TEMPORARY: `timed` is a placeholder for a future question type that has no control, so it should
  // never block. Drop it from this list once it has one.
  'timed',
];

/**
 * Whether leaving this question unanswered may stop the participant going on.
 *
 * Asked instead of testing `field_type` at the call site, so the two questionnaire hosts can't drift
 * apart on which types are exempt — which is how `info` and `descriptive` came to be spelled out in
 * both of them.
 */
export function blocksProgress(question?: Question): boolean {
  return !NON_BLOCKING_TYPES.includes(question?.field_type ?? '');
}
