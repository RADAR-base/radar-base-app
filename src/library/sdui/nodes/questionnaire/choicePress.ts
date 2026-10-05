import { withSequence, withTiming } from 'react-native-reanimated';

/**
 * How a questionnaire input answers a finger — the press when a tap lands, and the knock when an
 * answer is refused.
 *
 * Kept in one place because these are a *feel*, not a measurement: copies drift apart under separate
 * tuning, and two inputs on the same questionnaire that respond differently to the same tap read as
 * two apps rather than one. That isn't hypothetical — the knock below was two identical copies, in
 * the text field and the error row, held in step only by a comment in each saying it matched the
 * other.
 */

/**
 * How far a control sinks under a finger.
 *
 * Separate from the selected state, and deliberately faster. Selection is the *answer* settling in;
 * this is the acknowledgement that the tap landed, and it has to happen while the finger is still
 * down — feedback that arrives with the answer has already missed the moment it was needed.
 */
export const PRESS_SCALE = 0.95;

/** Down is quicker than up: a press should feel caught immediately and released unhurriedly. */
export const PRESS_IN_MS = 90;
export const PRESS_OUT_MS = 160;

/**
 * How far a press previews the chosen look, as a share of it.
 *
 * The fill and its ring come part-way up under the finger, so the control shows what choosing it
 * would mean before the answer is recorded. Partial on purpose: taken all the way, a press that slid
 * off would have shown a full selection that never happened.
 */
export const PRESS_PREVIEW = 0.55;

/**
 * How far an input swings when an answer is refused, and over how long.
 *
 * The same reasoning as the press above, for the other half of the exchange: every question type has
 * to refuse at one speed, or two inputs on the same questionnaire read as two apps. It was two copies
 * of these numbers before — the text field's and the error row's — kept in step only by a comment
 * saying so.
 *
 * Callers also reserve `REFUSAL_DISTANCE` as margin either side. Inputs fill the panel, and the panel
 * sits inside `StepSlider`'s clipping viewport, so without room to move into, an edge is sliced off
 * mid-swing. The margin is constant, so it costs nothing while nothing is shaking.
 */
export const REFUSAL_DISTANCE = 6;
/** Total length of the knock, divided into the eight equal legs `refusalKnock` uses. Stated as a
 *  total because that's the number worth tuning — the legs just have to add up to it. */
export const REFUSAL_MS = 220;

/**
 * The knock itself: a decaying swing, so it reads as a single rap rather than a wobble.
 *
 * Returns the animation rather than applying it, so a caller assigns it to whichever shared value it
 * moves — the text field shakes its card, the error row shakes itself.
 */
export function refusalKnock() {
  const leg = REFUSAL_MS / 8;
  return withSequence(
    withTiming(-REFUSAL_DISTANCE, { duration: leg }),
    withTiming(REFUSAL_DISTANCE, { duration: leg * 2 }),
    withTiming(-REFUSAL_DISTANCE * 0.6, { duration: leg * 2 }),
    withTiming(REFUSAL_DISTANCE * 0.35, { duration: leg * 2 }),
    withTiming(0, { duration: leg }),
  );
}
