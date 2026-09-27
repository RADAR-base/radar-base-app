import type { Question } from '../../../../types';

/**
 * Field types that never hold the participant on a page, whatever `required_field` says.
 *
 * Two different reasons land here, with the same consequence.
 *
 * **Nothing to answer.** `info` and `descriptive` pages are text, and `timed` and `range-info` have no
 * case in `QuestionRenderer` at all, so they fall through to its default and draw nothing. None of the
 * four has a control, so a definition that marks one required — or, on hosts that read a blank
 * `required_field` as required, simply leaves it blank — would block Next with no way past it. A type
 * listed for this reason leaves the list the day it gains a control, since from then on there is
 * something a participant can actually be held to.
 *
 * **Nothing left to do.** A scale always reads a value: the handle has a resting position and the
 * numeral under it is filled in from the first frame. Refusing to advance asks the participant to
 * answer a question that already looks answered, and the only way out is to move the handle and put
 * it back.
 *
 * Note what that means for the data: a scale records nothing until it is touched, so a participant
 * who walks past one leaves its field absent from the result rather than set to what the handle was
 * showing. The alternative — treating the resting position as an answer they gave — would put a
 * number in the record that nobody chose, which is worse.
 */
export const NON_BLOCKING_TYPES = [
  'info',
  'descriptive',
  'range',
  'range-info',
  'slider',
  'slider-vertical',
  'slider-scale',
  'slider-arc',
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
