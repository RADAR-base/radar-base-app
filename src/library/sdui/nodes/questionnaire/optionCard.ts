import { type ViewStyle } from 'react-native';
import { cardShadow } from '../../../../theme/theme';

/**
 * The look of a choice drawn as a pill card, shared by `RadioInput` and `CheckboxInput`.
 *
 * The two put the same question on screen — a list of options to tap — and differ only in how many
 * may be on at once. They therefore have to measure and animate identically, or a questionnaire that
 * uses both reads as two designs. Kept here rather than in either, because two copies of "how wide is
 * the halo" drift the moment one is tuned, and the drift is invisible until they are seen together.
 */

/** Fully rounded: a radius far larger than the height, as the design's 100 is. */
export const OPTION_RADIUS = 100;

/** Selected options carry a 4px ring; unselected reserve it transparently so nothing shifts. */
export const SELECTED_RING = 4;

/** How long an option takes to settle into (or out of) its selected state. */
export const SELECT_MS = 180;

/** The halo's opacity once an option is on — the accent at half strength, over the page. */
export const RING_ALPHA = 0.5;

/** Diameter of the indicator at the end of the row (Figma 3578:1589), and the weight of its outline. */
export const INDICATOR_SIZE = 24;
export const INDICATOR_BORDER = 2;

/** Dimming applied while a finger is down, for both inputs. */
export const PRESSED_OPACITY = 0.85;

/**
 * The app's `cardShadow`, re-exported under the name these inputs used to define their own copy with.
 *
 * That copy existed because `cardShadow` was once offset 8px to the *right*, reaching ~20px past the
 * card and getting sliced off by the viewports these options sit in (the panel's ScrollView and
 * `StepSlider` both clip). `cardShadow` is now straight down with a reach the page gutter can hold,
 * so there is nothing left for a second definition to fix — and the copy had drifted: it still used
 * the old mid grey, which composites *lighter* than a dark-mode page and rings each option with a
 * glow instead of lifting it.
 */
export const optionShadow = cardShadow as ViewStyle;

/**
 * What is drawn on the accent fill once an option is chosen: its label, and its indicator.
 *
 * White, per the design, and a deliberate contrast trade — against the default sky accent it measures
 * 1.86:1, under WCAG AA's 4.5:1. `readableTextColor(accentColor, { preferred: ON_ACCENT })` is the fix
 * if a study's brand makes that a problem, and it would need applying to both inputs at once, which is
 * why it lives here rather than in either.
 */
export const ON_ACCENT = '#FFFFFF';
