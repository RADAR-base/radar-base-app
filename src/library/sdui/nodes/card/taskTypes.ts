/**
 * Shared task-type palette, used by both task cards (`TaskCardNode`, `CalendarTaskCard`) and the icon
 * badge (`TaskIcon`). Lives in its own module so `TaskIcon` and `TaskCardNode` can both import it
 * without a circular dependency (`TaskCardNode` renders `TaskIcon`).
 *
 * The Figma V3 also has a `cognitive` variant, but the app never produces one (`inferTaskType` only
 * yields these four) and there's no brain-icon asset yet — add it here + a matching color/glyph when a
 * cognitive task type actually ships.
 */
export type TaskCardType = 'questionnaire' | 'speech' | 'physical' | 'medication';

/**
 * One vibrant color per task type (Figma node 3530:7243). A single color drives everything: the icon
 * badge circle at full opacity with a white glyph, and the info pills at `TASK_TINT` opacity with
 * full-color text — so there's no separate "solid"/"light" color to maintain per type.
 */
export const TYPE_COLORS: Record<TaskCardType, string> = {
  questionnaire: '#EA760F',
  speech: '#4A708A',
  physical: '#E84855',
  medication: '#8978E3',
};

/** Opacity for a type color's filled pill background — the icon/text sit on top at full opacity. */
export const TASK_TINT = 0.15;
