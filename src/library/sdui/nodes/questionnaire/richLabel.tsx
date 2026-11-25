import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fontFamily, tracking } from '../../../../theme/theme';
import { EVENTS, eventBus } from '../../../../core/EventBus';
import {
  ALLOWED_TAGS,
  BOLD_TAGS,
  ITALIC_TAGS,
  SMALL_TAGS,
  attr,
  safeHref,
  safeImageSrc,
  safeVideoSrc,
} from './allowedHTMLInjections';

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
 *
 * Which tags and URLs are permitted is decided in `allowedHTMLInjections.ts`.
 */

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

/** One tag or one run of text. `name` is empty for text; `attrs` is the raw attribute string. */
interface Token {
  text: string;
  name: string;
  attrs: string;
  closing: boolean;
}

function tokenize(label: string): Token[] {
  const tokens: Token[] = [];
  // `<br>`, `<br/>` and `<br />` all mean the same thing, so the slash is optional on either side.
  const tag = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(label)) !== null) {
    if (match.index > last)
      tokens.push({ text: label.slice(last, match.index), name: '', attrs: '', closing: false });
    tokens.push({
      text: '',
      name: match[2].toLowerCase(),
      attrs: match[3] ?? '',
      closing: match[1] === '/',
    });
    last = match.index + match[0].length;
  }
  if (last < label.length)
    tokens.push({ text: label.slice(last), name: '', attrs: '', closing: false });
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
export function richLabel(
  label?: string | null,
  opts?: { linkColor?: string },
): React.ReactNode {
  if (!label) return null;
  if (!/[<&]/.test(label)) return label;

  const tokens = tokenize(label);
  /** Open tags, innermost last — so nesting closes in the order it opened. */
  const open: { name: string; attrs: string }[] = [];
  const parts: React.ReactNode[] = [];

  tokens.forEach((token, i) => {
    if (!token.name) {
      const text = decode(token.text);
      if (!text) return;
      const bold = open.some(t => BOLD_TAGS.includes(t.name));
      const italic = open.some(t => ITALIC_TAGS.includes(t.name));
      const small = open.some(t => SMALL_TAGS.includes(t.name));
      // Innermost link wins. A refused scheme leaves the text in place but not tappable.
      const href = [...open].reverse().find(t => t.name === 'a' && safeHref(attr(t.attrs, 'href')));
      const target = href && safeHref(attr(href.attrs, 'href'));
      if (!bold && !italic && !small && !target) {
        parts.push(text);
        return;
      }
      parts.push(
        <Text
          key={i}
          style={[
            bold && styles.bold,
            italic && styles.italic,
            small && styles.small,
            target && [styles.link, !!opts?.linkColor && { color: opts.linkColor }],
          ]}
          // Raised rather than opened, so the shell can confirm before leaving the app.
          onPress={
            target ? () => eventBus.emit(EVENTS.OPEN_EXTERNAL_LINK, { url: target }) : undefined
          }
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
      const at = open.map(t => t.name).lastIndexOf(token.name);
      if (at >= 0) open.splice(at, 1);
      return;
    }
    // Tags off the allowlist are dropped, keeping their text.
    if (!ALLOWED_TAGS.has(token.name)) return;
    open.push({ name: token.name, attrs: token.attrs });
  });

  // Nothing survived the strip — an author left an empty tag behind.
  if (parts.length === 0) return null;
  if (parts.length === 1 && typeof parts[0] === 'string') return parts[0];
  return parts;
}

/** A run of inline markup, or a piece of media that has to sit outside the text around it. */
export interface RichBlock {
  type: 'text' | 'image' | 'video';
  /** The HTML run, or the media's `src`. */
  value: string;
  /** The author's `alt`/`title`, for a screen reader. Media only. */
  alt?: string;
}

/**
 * Splits a passage at its images and videos, which can't be drawn inside a `<Text>`. Runs with no
 * text of their own (the `<br>`s around a picture) are dropped.
 */
export function splitRichBlocks(label?: string | null): RichBlock[] {
  if (!label) return [];
  const blocks: RichBlock[] = [];
  // A paired `<iframe>…</iframe>` is consumed whole, so its browser-fallback text is dropped.
  const media = /<\s*iframe([^>]*)>[\s\S]*?<\s*\/\s*iframe\s*>|<\s*(img|iframe)([^>]*)>/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  const pushText = (run: string) => {
    if (plainLabel(run)?.trim()) blocks.push({ type: 'text', value: run });
  };
  while ((match = media.exec(label)) !== null) {
    pushText(label.slice(last, match.index));
    const paired = match[1] !== undefined;
    const tag = paired ? 'iframe' : (match[2] ?? '').toLowerCase();
    const attrs = (paired ? match[1] : match[3]) ?? '';
    if (tag === 'img') {
      const src = safeImageSrc(attr(attrs, 'src'));
      if (src) blocks.push({ type: 'image', value: src, alt: attr(attrs, 'alt') });
    } else {
      const src = safeVideoSrc(attr(attrs, 'src'));
      if (src) blocks.push({ type: 'video', value: src, alt: attr(attrs, 'title') });
    }
    last = match.index + match[0].length;
  }
  pushText(label.slice(last));
  return blocks;
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
  small: {
    fontSize: 12,
  },
  link: {
    textDecorationLine: 'underline',
    fontFamily: fontFamily.medium,
    fontWeight: '500',
  },
});
