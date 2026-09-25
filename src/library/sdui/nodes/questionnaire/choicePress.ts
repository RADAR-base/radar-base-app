/**
 * How a choice responds to a finger, shared by every control that offers one.
 *
 * Separate from the selected state, and deliberately faster. Selection is the *answer* settling in;
 * this is the acknowledgement that the tap landed, and it has to happen while the finger is still
 * down — feedback that arrives with the answer has already missed the moment it was needed.
 *
 * Kept in one place because these are a *feel*, not a measurement: two copies drift apart under
 * separate tuning, and a scale card and a swipe card that respond differently to the same tap read as
 * two apps rather than one.
 */

/** How far a control sinks under a finger. */
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
