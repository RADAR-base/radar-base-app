import type { SelectChoice } from '../../../../types';
import { lightTheme, mix } from '../../../../theme/theme';
import { plainLabel } from './richLabel';

/**
 * Which end of a scale is the good one.
 *
 * The faces run from unhappy to happy, so a scale can only be drawn with them once this is known.
 * Severity runs one way — "Not at all" is the first choice and the best outcome, "Severe" the last
 * and the worst — while agreement runs the other: "Strongly agree" is last and is the positive end.
 * Get it backwards and the control says the opposite of the answer.
 */
export type PositiveEnd = 'first' | 'last';

export interface LikertFamily {
  positiveEnd: PositiveEnd;
  /** The labels exactly as the definitions author them, in choice order. */
  labels: string[];
}

/**
 * The scales recognised as Likert, taken from the RADAR aRMT definitions rather than invented.
 *
 * Every entry below appears verbatim in the RADAR-REDCap-aRMT-Definitions repository; between them
 * they account for 524 of the 682 radio questions there that have four or five choices (77%). The
 * rest are deliberately left out — they are not scales at all (gender, employment, where the phone
 * is kept), or they are buckets of counts and durations, or they are the sentence-length clinical
 * items where a face would be absurd.
 *
 * A set matches when every label is in one family, with no repeats. The match is on the whole set,
 * not on individual words, because that is what keeps a false positive out: turning a genuine
 * multiple-choice question into a slider misrepresents what is being asked, which is a good deal
 * worse than leaving a scale as the list of rows it has always been.
 *
 * Extend by adding a family, ideally after checking the wording against the definitions repository.
 * Adding one is cheap; loosening the match is not.
 */
const LIKERT_FAMILIES: LikertFamily[] = [
  // 97 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'not true',
      'sometimes true',
      'often true',
      'almost always true',
    ],
  },
  // 96 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'not at all',
      'a little',
      'quite a bit',
      'very much',
    ],
  },
  // 87 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'not at all',
      'several days',
      'more than half the days',
      'nearly every day',
    ],
  },
  // 50 question(s) in the aRMT definitions.
  {
    positiveEnd: 'last',
    labels: [
      'very unpleasant',
      'moderately unpleasant',
      'neither unpleasant or pleasant',
      'moderately pleasant',
      'very pleasant',
    ],
  },
  // 28 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'never or rarely',
      'sometimes',
      'often',
      'very often',
    ],
  },
  // 28 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'not at all',
      'sometimes',
      'often',
      'all the time',
    ],
  },
  // 25 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'not at all',
      'mild',
      'moderate',
      'severe',
    ],
  },
  // 18 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'not at all',
      'a little bit',
      'moderately',
      'quite a bit',
      'extremely',
    ],
  },
  // 17 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'never / not at all',
      'rarely / a little bit',
      'sometimes / moderately',
      'often / a lot',
      'almost always / very much',
    ],
  },
  // 11 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      '0 none',
      '1 mild',
      '2 moderate',
      '3 severe',
    ],
  },
  // 10 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'not at all',
      'a little bit',
      'moderately',
      'a lot',
      'very much',
    ],
  },
  // 10 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'very slightly',
      'a little',
      'moderately',
      'quite a bit',
      'extremely',
    ],
  },
  // 10 question(s) in the aRMT definitions.
  {
    positiveEnd: 'last',
    labels: [
      'strongly disagree',
      'disagree',
      'neither agree or disagree',
      'agree',
      'strongly agree',
    ],
  },
  // 10 question(s) in the aRMT definitions.
  {
    positiveEnd: 'last',
    labels: [
      'strongly disagree',
      'disagree',
      'agree',
      'strongly agree',
    ],
  },
  // 6 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'very rarely',
      'rarely',
      'sometimes',
      'often',
      'very often',
    ],
  },
  // 6 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'not at all',
      'no more than usual',
      'rather more than usual',
      'much more than usual',
    ],
  },
  // 3 question(s) in the aRMT definitions.
  {
    positiveEnd: 'last',
    labels: [
      'completely disagree',
      'somewhat disagree',
      'neither agree nor disagree',
      'somewhat agree',
      'completely agree',
    ],
  },
  // 3 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'not difficult at all',
      'somewhat difficult',
      'very difficult',
      'extremely difficult',
    ],
  },
  // 2 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'much better',
      'better',
      'similar',
      'worse',
      'much worse',
    ],
  },
  // 2 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'not at all (0)',
      'slightly (1)',
      'moderately (2)',
      'markedly (3)',
    ],
  },
  // 2 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'not at all',
      'rarely/a little bit',
      'sometimes',
      'often',
      'a lot/very much',
    ],
  },
  // 1 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'very good',
      'fairly good',
      'fairly bad',
      'very bad',
    ],
  },
  // 1 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'almost never',
      'sometimes',
      'often',
      'almost always',
    ],
  },
  // 1 question(s) in the aRMT definitions.
  {
    positiveEnd: 'first',
    labels: [
      'never',
      'rarely',
      'sometimes',
      'often',
      'always',
    ],
  },
];

/** The scale runs this many steps or it isn't one — the lengths the design draws. */
const MIN_STEPS = 4;
const MAX_STEPS = 5;

/** Labels are authored by hand: case, padding, trailing punctuation and markup all vary. */
function normalise(label: string): string {
  return (plainLabel(label) ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:!?]+$/g, '')
    .trim();
}

/**
 * The family these choices belong to, or `null` if they are not a scale this can draw.
 *
 * Returns the family rather than a boolean so the caller gets `positiveEnd` with it — the two are
 * decided by the same match, and separating them would invite a caller to answer the second
 * question for itself.
 *
 * A four-point scale is allowed to match a five-point family: several of the definitions drop the
 * midpoint and are otherwise the same wording. The no-repeats rule is what stops that leniency
 * turning into a match on any four of the five.
 */
export function matchLikertScale(choices: SelectChoice[] | undefined): LikertFamily | null {
  if (!choices || choices.length < MIN_STEPS || choices.length > MAX_STEPS) return null;

  const labels = choices.map(c => normalise(c.label));
  if (labels.some(l => l === '')) return null;

  return (
    LIKERT_FAMILIES.find(family => {
      if (family.labels.length < labels.length) return false;
      const seen = new Set<string>();
      for (const label of labels) {
        if (!family.labels.includes(label) || seen.has(label)) return false;
        seen.add(label);
      }
      return true;
    }) ?? null
  );
}

/**
 * A colour per step, running from the scale's negative end to its positive one.
 *
 * Mixed from the theme's own three-stop ramp (dataWheel bad / neutral / good — the colours the
 * progress rings already grade themselves with) rather than a new set of literals, so a scale reads
 * as the same language as the rest of the app.
 *
 * The ends are the stops exactly; the steps between are interpolated, which is what lets one rule
 * serve a four-point scale and a five-point one without a table per length.
 */
export function likertRamp(steps: number): string[] {
  // Read off lightTheme rather than through getColorTokens: dataWheel is one of the few token groups
  // with no light/dark variant and no brand override — the same three hexes in both themes — so
  // there is no mode to resolve, and taking one would only invite a caller to pass the wrong one.
  const stops = lightTheme.dataWheel;
  if (steps <= 0) return [];
  if (steps === 1) return [stops.neutral];
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    // Two halves, each interpolated on its own, so the midpoint lands exactly on neutral rather than
    // on whatever a single bad-to-good blend happens to pass through.
    return t <= 0.5
      ? mix(stops.bad, stops.neutral, t * 2)
      : mix(stops.neutral, stops.good, (t - 0.5) * 2);
  });
}
