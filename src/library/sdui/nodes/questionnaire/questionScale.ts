import type { QuestionRange, SelectChoice } from '../../../../types';

/**
 * What a slider needs to draw itself: the values it can take, and what its ends are called.
 */
export interface QuestionScale {
  /** Every value the scale can take, in order. Never empty. */
  values: number[];
  /** What the low end is called, when the definition names it. */
  minLabel?: string;
  /** What the high end is called, when the definition names it. */
  maxLabel?: string;
  /**
   * What each step is called, indexed alongside `values`.
   *
   * Only present when the choices enumerate the scale step for step — seven choices for a seven-point
   * question. When they are endpoints instead (two choices spanning 0–100), there is no per-step name
   * to give, and a control that lists its steps should fall back to showing the values.
   */
  stepLabels?: (string | undefined)[];
}

/** Used when a definition describes no scale at all — nothing in the corpus hits this. */
const FALLBACK: QuestionRange = { min: 0, max: 10, step: 1 };

/**
 * `select_choices_or_calculations`, whatever shape it arrived in, as a list of choices.
 *
 * The field is typed as `SelectChoice[]` but isn't reliably one. Across the aRMT definitions it also
 * appears as `[]`, as `''`, and — on four `radio` questions in `demographics_sshh` — as REDCap's own
 * unparsed `1|Male\n2|Female` text. `?? []` catches none of the string cases, which is how an empty
 * string reached `.forEach` and took down the questionnaire node.
 *
 * Normalising here means every caller can treat the field as the array its type claims it is.
 */
export function parseChoices(value: SelectChoice[] | string | undefined | null): SelectChoice[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  return value
    .split('\n')
    .map((line) => {
      const at = line.indexOf('|');
      if (at < 0) return null;
      return { code: line.slice(0, at).trim(), label: line.slice(at + 1).trim() };
    })
    .filter((choice): choice is SelectChoice => choice !== null && choice.code !== '');
}

/**
 * The label a step carries, with its leading code stripped.
 *
 * Definitions mostly write these as "1 Not at all" — the code, then the words — and sometimes as
 * "1. Not at all". Both spell the code twice over, so it comes off.
 *
 * The separator is what makes that safe. Without requiring one, "0mm" and "70%" — where the digits
 * are the label rather than a repeated code — would be stripped down to "mm" and "%".
 */
function nameOf(choice: SelectChoice | undefined): string | undefined {
  const label = choice?.label?.trim() ?? '';
  return label.replace(/^-?\d+[.)]?\s+/, '').trim() || undefined;
}

/**
 * Work out a slider's scale from however its definition happens to describe it.
 *
 * `range` wins when it has bounds, and `select_choices_or_calculations` is the fallback — which is
 * what the definitions actually call for:
 *
 * - `range` questions (263 of them) carry **no** `range` object at all. Their choices are a genuine
 *   step-per-choice enumeration: seven choices coded 1–7 mean a seven-point scale.
 * - `slider` questions mostly (160 of 184) carry `range` with `min`/`max`/`step`, and their choices
 *   are empty.
 * - The remaining 24 sliders invert that: no `range`, and two or three choices whose codes are the
 *   scale's **endpoints**, not its steps — `[{code: 0, …}, {code: 100, …}]` is a 0–100 continuum, not
 *   a two-position switch.
 *
 * Reading first and last code as the bounds serves both: codes 1–7 give back the same seven steps
 * enumerating them would, and codes 0/100 give the continuum rather than two positions.
 *
 * Labels follow the same precedence. `range.labelLeft`/`labelRight` carry them on 162 of the 163
 * questions that have a `range`; otherwise the end choices' own labels name the ends.
 */
export function questionScale(
  range: QuestionRange | undefined,
  rawChoices: SelectChoice[] | string | undefined,
): QuestionScale {
  const choices = parseChoices(rawChoices);

  /**
   * Codes that are actually numbers.
   *
   * The blank spacer in `[{code: 0}, {code: ''}, {code: 10}]` has to go by its *raw* value: `Number('')`
   * is `0`, which passes `isFinite` and would otherwise become a second step reporting zero.
   */
  const codes = choices
    .filter((choice) => String(choice?.code ?? '').trim() !== '')
    .map((choice) => Number(choice.code))
    .filter(Number.isFinite);

  const bounded = range != null && String(range.min ?? '') !== '' && String(range.max ?? '') !== '';
  const source = bounded ? range : null;

  const min = source ? Number(source.min) : codes.length ? codes[0] : Number(FALLBACK.min);
  const max = source
    ? Number(source.max)
    : codes.length
      ? codes[codes.length - 1]
      : Number(FALLBACK.max);
  const step = Number(source?.step) || 1;

  const values = buildValues(min, max, step);

  // The ends are named by `range` when it names them, and by the end choices otherwise. A `range`
  // with bounds but no labels still defers to the choices, which is how a definition that carries
  // both gets its captions.
  /**
   * A step's name, unless the "name" is just its own number again.
   *
   * Most scales name only their ends and write the rest as bare numerals — "1 Not at all", then "2",
   * "3" and so on. Those carry no name, and showing one puts a small `2` directly beneath the large
   * `2` the control already displays.
   */
  const named = (choice: SelectChoice | undefined, of: number): string | undefined => {
    const name = nameOf(choice);
    return name === undefined || name === String(of) ? undefined : name;
  };

  const first = choices[0];
  const last = choices[choices.length - 1];
  const aligned = choices.length === values.length;
  return {
    values,
    minLabel: source?.labelLeft?.trim() || named(first, values[0]),
    maxLabel: source?.labelRight?.trim() || named(last, values[values.length - 1]),
    // Only when there is a choice per value — see `stepLabels`.
    stepLabels: aligned ? choices.map((choice, i) => named(choice, values[i])) : undefined,
  };
}

/** The values from `min` to `max`, inclusive. Guards against a step that can't terminate the walk. */
function buildValues(min: number, max: number, step: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return buildValues(Number(FALLBACK.min), Number(FALLBACK.max), 1);
  }
  if (max === min) return [min];
  const span = Math.abs(max - min);
  const size = Math.abs(step) || 1;
  // A scale is a thing you drag through; past a few hundred stops it is a number entry wearing a
  // slider's clothes, and every stop is a view.
  const count = Math.min(Math.floor(span / size) + 1, 501);
  const direction = max > min ? 1 : -1;
  return Array.from({ length: Math.max(1, count) }, (_, i) => min + direction * i * size);
}
