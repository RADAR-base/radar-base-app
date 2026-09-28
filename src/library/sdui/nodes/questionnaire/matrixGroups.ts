import type { Question } from '../../../../types';

/**
 * The matrix field type.
 *
 * `matrix-radio` is a block of rows that share a screen, read and answered whole. There is only the
 * one design for it now — `MatrixRadioRows` — so the type no longer selects between presentations,
 * it simply says "these rows belong together".
 */
export const MATRIX_LIST_TYPE = 'matrix-radio';

/**
 * The most options a row can offer and still be drawn as one.
 *
 * The segmented track splits evenly between them, so the limit is width rather than design: past six
 * a phone gives each option under 55pt, and a label like "Moderate" no longer fits on the single line
 * they get. A row with more falls back to the plain radio list, which is honest at any length.
 *
 * Nothing real comes close — every matrix row in the published definitions asks two or four.
 */
export const MATRIX_ROWS_MAX_CHOICES = 6;

/**
 * Whether this question is one row of a matrix block.
 *
 * The count isn't checked against a design, only against what will fit: the track divides evenly
 * between however many options a row has, so any length up to `MATRIX_ROWS_MAX_CHOICES` is drawable.
 * A row offering nothing to choose from isn't one, and falls to the plain radio list.
 *
 * This is also the single answer to "is this page a matrix block", asked by both the renderer and the
 * panel rule — they have to agree, because the rows scroll themselves and a page that also scrolls is
 * one where the two scrollers fight over every drag. Two independent tests of `field_type` had
 * already drifted apart once.
 */
export function isMatrixQuestion(question?: Question): boolean {
  if (question?.field_type !== MATRIX_LIST_TYPE) return false;
  const count = question.select_choices_or_calculations?.length ?? 0;
  return count > 0 && count <= MATRIX_ROWS_MAX_CHOICES;
}

/**
 * Two matrix questions belong on the same screen when they are adjacent and part of the same block.
 *
 * `matrix_group_name` is the authority where a definition sets it — that is REDCap's own statement of
 * which rows form one matrix, and it keeps two blocks that happen to sit back to back from merging
 * into one. Definitions that omit it fall back to adjacency alone, which is the only signal left; a
 * run of consecutive matrix questions is a matrix in every definition we've seen.
 */
function sameGroup(a: Question, b: Question): boolean {
  if (a.matrix_group_name && b.matrix_group_name) {
    return a.matrix_group_name === b.matrix_group_name;
  }
  return !a.matrix_group_name && !b.matrix_group_name;
}

/**
 * The questionnaire's questions, batched into the pages the screen actually pages through.
 *
 * Every question is its own page, as it always has been — except a run of matrix questions, which
 * collapses into one. That run is the whole point of the matrix design: the participant answers the
 * block as a list on a single screen rather than being walked through one page per row.
 *
 * Order is preserved and nothing is dropped, so the result flattens back to the input exactly.
 */
export function toQuestionPages(questions: Question[]): Question[][] {
  const pages: Question[][] = [];

  for (const question of questions) {
    const previous = pages[pages.length - 1];
    const extendsRun =
      previous &&
      isMatrixQuestion(question) &&
      isMatrixQuestion(previous[0]) &&
      sameGroup(previous[0], question);

    if (extendsRun) previous.push(question);
    else pages.push([question]);
  }

  return pages;
}

/** The heading a matrix page shows: the block's own, carried by its first row. */
export function matrixPageTitle(page: Question[]): string | undefined {
  return page[0]?.section_header?.trim() || undefined;
}
