/**
 * Shared task-type palette, used by both task cards (`TaskCardNode`, `CalendarTaskCard`) and the icon
 * badge (`TaskIcon`). Lives in its own module so `TaskIcon` and `TaskCardNode` can both import it
 * without a circular dependency (`TaskCardNode` renders `TaskIcon`).
 */
export type TaskCardType = 'questionnaire' | 'speech' | 'physical' | 'medication' | 'cognitive';

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
  // Figma node 3728:4384 — `color/teal/800`, the cognitive task badge.
  cognitive: '#0F6E56',
};

/** Opacity for a type color's filled pill background — the icon/text sit on top at full opacity. */
export const TASK_TINT = 0.15;

/**
 * Maps a protocol's declared task type onto a card type.
 *
 * The value comes from the assessment's `questionnaire.type` in the protocol, carried through
 * `Task.taskType` → `TaskView.taskType`. Studies spell these inconsistently (aRMT writes `audio` for
 * a speech task), so match on substrings, case-insensitively. Returns `undefined` for an absent or
 * unrecognised value, so callers can fall back to guessing from the title.
 */
export function normalizeTaskType(raw?: string | null): TaskCardType | undefined {
  if (!raw) return undefined;
  const value = raw.toLowerCase();
  if (/audio|speech|voice|record/.test(value)) return 'speech';
  if (/cognit|thinc|memory|reaction|brain/.test(value)) return 'cognitive';
  if (/medicat|medicine|pill|drug|dose/.test(value)) return 'medication';
  if (/physical|activity|walk|exercise|step|fitness/.test(value)) return 'physical';
  if (/question|survey|form|redcap/.test(value)) return 'questionnaire';
  return undefined;
}
