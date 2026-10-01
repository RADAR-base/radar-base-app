import type { Question } from '../../../../types';
import { isMatrixQuestion } from './matrixGroups';
import { SCALE_TYPES } from './QuestionRenderer';

/**
 * How a page's container should behave, decided from what is on it.
 *
 * The screen owns the panel — it is the thing that slides, and it reserves the footer's space — but
 * *how* that panel behaves depends entirely on the field type inside it. This keeps the rule with the
 * question types it describes, so the screen can ask rather than switch on `field_type` itself.
 */
export interface PanelBehaviour {
  /** A ScrollView when true, a plain View when false. */
  scrolls: boolean;
  /**
   * Whether that scroller may actually be dragged — a separate question from which component it is.
   *
   * A page can want a ScrollView it refuses to let move: a scale sizes itself to the space it is
   * given, so any scroll it allows is drift of a point or two, and the page sliding under a finger
   * that meant to move the handle is worse than the drift. Conflating the two would make it a plain
   * `View` instead, which *bounds* its children rather than sizing to them — and a scale laid out
   * against a bounded box measures its own container and collapses.
   */
  scrollEnabled: boolean;
  /** Whether the body fills the panel, giving its content a bounded height to divide up. */
  fills: boolean;
  /**
   * Whether the panel itself keeps the footer's space clear, or leaves that to what's inside it.
   *
   * Padding the panel shortens it, which is right for content that simply sits there — but wrong for
   * content that scrolls itself: the scroller would end at the padding and cut its last card off in
   * mid-air, well above the footer, instead of running to the bottom of the screen and letting the
   * card pass under it. Such content takes the reserve as its own bottom padding instead.
   */
  padsFooter: boolean;
}

/**
 * Two types need a non-scrolling panel, for unrelated reasons.
 *
 * **Speech** needs a bounded *height*: a ScrollView's content container has none — `flexGrow` only
 * makes it at least the viewport, and it grows past that to fit its content — so `flexShrink` on the
 * passage never engages and the recording controls get pushed off the bottom. A View bounded by
 * `flex: 1` gives the children a fixed height to divide up.
 *
 * **A matrix block** scrolls itself, to the next unanswered row as each is answered — which needs a
 * scroller it holds the handle to. Two nested scrollers would fight over the drag, so the panel gives
 * up its own and hands down a bounded height for the block's to fill instead. It also takes the
 * footer's space as its own content padding, so the list runs to the bottom of the screen rather than
 * stopping at a padded edge and cutting its last card off in mid-air.
 *
 * Everything else scrolls, as it always has.
 */
export function panelBehaviour(page: Question[]): PanelBehaviour {
  const first = page[0];
  const isSpeech = first?.field_type === 'audio';
  // Asked, not re-derived: the renderer decides what to draw from this same function, and a page that
  // scrolls when it holds a block is one where the two scrollers fight over every drag.
  const isMatrix = isMatrixQuestion(first);

  const type = first?.field_type ?? '';
  const isScale = SCALE_TYPES.includes(type);

  return {
    // The vertical slider used to be excluded here, because a container that sizes to its content
    // leaves a `flex: 1` child measuring zero. It no longer is: the slider takes an explicit height,
    // floored so it stays usable, so it needs the page to scroll when a long label squeezes it.
    scrolls: !isSpeech && !isMatrix,
    // Every page that scrolls may be dragged. The scale types used to sit on a frozen scroller so a
    // drag could never be stolen — but a long field label pushed the control off a page that then
    // refused to move. They hold the page still for the drag instead, as the arc slider already did.
    scrollEnabled: !isSpeech && !isMatrix,
    fills: isSpeech || isMatrix || isScale,
    // A scale keeps the footer clear itself, measuring against the window — padding a *fixed* panel
    // out as well would take the footer's height off it twice. A scrolling panel pads regardless; see
    // the note at that call site.
    padsFooter: !isMatrix && !isScale,
  };
}
