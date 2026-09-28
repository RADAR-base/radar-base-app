import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fontFamily, tracking } from '../../../../theme/theme';

/**
 * Inline HTML a REDCap definition may carry inside a label, rendered rather than shown.
 *
 * `field_label` and the labels inside `select_choices_or_calculations` are authored in REDCap's rich
 * editor, so they arrive as small fragments of HTML — most often a bolded lead-in naming the step
 * ("<B>Normal:</B> Jeg kan have nogle milde symptomer…"). Put straight into a `<Text>` those tags show
 * as literal angle brackets in the middle of the sentence.
 *
 * Deliberately not an HTML renderer. It handles the handful of tags an author can actually produce in
 * that editor and drops the rest, because the alternative — pulling in a parser to lay out arbitrary
 * markup inside a caption that has two lines to work with — is far more machinery than the problem.
 * Anything it doesn't know is stripped to its text, which is what a definition means anyway.
 */

/** Tags that turn into a style. Everything else is dropped, keeping whatever text it wrapped. */
const BOLD_TAGS = ['b', 'strong'];
const ITALIC_TAGS = ['i', 'em'];

/**
 * The entities REDCap's editor emits. Not a general table: `&nbsp;` is the one that actually appears,
 * from an author padding a label, and the other four are what a definition has to escape to put those
 * characters in text at all.
 */
const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

function decode(text: string): string {
  return text.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, match => ENTITIES[match] ?? match);
}

/** One tag or one run of text. `name` is empty for text. */
interface Token {
  text: string;
  name: string;
  closing: boolean;
}

function tokenize(label: string): Token[] {
  const tokens: Token[] = [];
  // `<br>`, `<br/>` and `<br />` all mean the same thing, so the slash is optional on either side.
  const tag = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(label)) !== null) {
    if (match.index > last) tokens.push({ text: label.slice(last, match.index), name: '', closing: false });
    tokens.push({ text: '', name: match[2].toLowerCase(), closing: match[1] === '/' });
    last = match.index + match[0].length;
  }
  if (last < label.length) tokens.push({ text: label.slice(last), name: '', closing: false });
  return tokens;
}

/**
 * A label's text, with its bold and italic runs kept.
 *
 * Returns children for a `<Text>` the caller already owns, rather than a component of its own: the
 * caller's element carries the size, colour, alignment and `numberOfLines` that make the label fit
 * where it sits, and nested `<Text>` inherits all of that. So a call site changes from
 * `{label}` to `{richLabel(label)}` and nothing about its layout moves.
 *
 * A plain label — no tags, no entities — comes back as the string it went in as, so the common case
 * adds no elements at all.
 *
 * Nothing to show comes back as `null` rather than an empty string, so a caller's existing
 * `richLabel(x) ?? ' '` still catches it: several of them hold a line open with a space so the block
 * around them keeps its height, and `??` doesn't fire on `''`.
 */
export function richLabel(label?: string | null): React.ReactNode {
  if (!label) return null;
  if (!/[<&]/.test(label)) return label;

  const tokens = tokenize(label);
  /** Open tags, innermost last — so nesting closes in the order it opened. */
  const open: string[] = [];
  const parts: React.ReactNode[] = [];

  tokens.forEach((token, i) => {
    if (!token.name) {
      const text = decode(token.text);
      if (!text) return;
      const bold = open.some(name => BOLD_TAGS.includes(name));
      const italic = open.some(name => ITALIC_TAGS.includes(name));
      if (!bold && !italic) {
        parts.push(text);
        return;
      }
      parts.push(
        <Text
          key={i}
          style={[bold && styles.bold, italic && styles.italic]}
        >
          {text}
        </Text>,
      );
      return;
    }

    if (token.name === 'br') {
      parts.push('\n');
      return;
    }
    if (token.closing) {
      // Last occurrence, not the last entry: `<b><i>x</b>` closes the bold and leaves the italic open,
      // which is the reading every browser gives badly-nested markup.
      const at = open.lastIndexOf(token.name);
      if (at >= 0) open.splice(at, 1);
      return;
    }
    open.push(token.name);
  });

  // Nothing survived the strip — an author left an empty tag behind.
  if (parts.length === 0) return null;
  if (parts.length === 1 && typeof parts[0] === 'string') return parts[0];
  return parts;
}

/**
 * The same label as plain text, for somewhere a `<Text>` can't go.
 *
 * `accessibilityLabel` takes a string, so it can't hold the fragments `richLabel` returns — and left
 * as the raw label a screen reader announces the tags, reading "less-than B greater-than Normal" to
 * someone who can't see that the word is merely bold.
 */
export function plainLabel(label?: string | null): string | undefined {
  if (!label) return undefined;
  if (!/[<&]/.test(label)) return label;
  const text = tokenize(label)
    .map(token => (token.name ? (token.name === 'br' ? '\n' : '') : decode(token.text)))
    .join('');
  return text || undefined;
}

const styles = StyleSheet.create({
  /**
   * A weight, not `fontWeight` alone: Inter is loaded as a family per weight, so on Android a bare
   * `fontWeight` is ignored and the run renders identically to the text around it. Both are set, and
   * the tracking that goes with the weight comes too — see `tracking` in the theme.
   */
  bold: {
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    letterSpacing: tracking.bold,
  },
  italic: {
    fontStyle: 'italic',
  },
});
