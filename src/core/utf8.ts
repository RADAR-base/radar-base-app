/**
 * Undoes UTF-8 text that was decoded as single-byte.
 *
 * `fetch().text()` picks its encoding from the response's `Content-Type` charset. When a server
 * sends none — which the app server does when it proxies raw GitHub content — iOS falls back to
 * Latin-1, so every byte becomes its own character: a curly quote (U+2018, bytes `E2 80 98`) arrives
 * as "â€˜", and "don't" reads as "donâ€™t". Study copy is full of curly quotes and dashes, so a
 * questionnaire shows them on almost every screen.
 *
 * The right fix is a `charset=utf-8` on the response, which isn't ours to send. This repairs it at
 * the point the body is read instead, and does so conservatively: it only rewrites a string when the
 * bytes it is standing in for are *valid UTF-8*. Text that is genuinely Latin-1, or that happens to
 * hold a stray high byte, fails that test and is returned untouched.
 */

/** Text with no byte above 0x7F was never mis-decoded, whatever the server said. */
function hasHighBytes(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) > 0x7f) return true;
  }
  return false;
}

/**
 * The string's characters read back as the bytes they stand for, or `null` if any is out of range.
 *
 * A character above 0xFF means the string is already real text — some of it decoded correctly — and
 * so is not a byte-for-byte Latin-1 reading of anything.
 */
function toBytes(text: string): Uint8Array | null {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code > 0xff) return null;
    bytes[i] = code;
  }
  return bytes;
}

/**
 * UTF-8 decode, returning `null` on anything malformed.
 *
 * Hand-rolled rather than `TextDecoder`, which React Native does not reliably provide, and with
 * `fatal` semantics on purpose: a malformed sequence is the signal that this text was never UTF-8 in
 * the first place, so failing is how the caller knows to leave it alone.
 */
function decodeUtf8(bytes: Uint8Array): string | null {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    let codePoint: number;
    let extra: number;

    if (b0 < 0x80) {
      codePoint = b0;
      extra = 0;
    } else if (b0 >= 0xc2 && b0 <= 0xdf) {
      codePoint = b0 & 0x1f;
      extra = 1;
    } else if (b0 >= 0xe0 && b0 <= 0xef) {
      codePoint = b0 & 0x0f;
      extra = 2;
    } else if (b0 >= 0xf0 && b0 <= 0xf4) {
      codePoint = b0 & 0x07;
      extra = 3;
    } else {
      // A continuation byte on its own, or an over-long lead — not UTF-8.
      return null;
    }

    if (i + extra >= bytes.length) return null;
    for (let k = 1; k <= extra; k += 1) {
      const bn = bytes[i + k];
      if ((bn & 0xc0) !== 0x80) return null;
      codePoint = (codePoint << 6) | (bn & 0x3f);
    }

    // Over-long encodings and surrogates are invalid, and accepting them would let a Latin-1 string
    // masquerade as UTF-8 often enough to matter.
    if (extra === 2 && codePoint < 0x800) return null;
    if (extra === 3 && codePoint < 0x10000) return null;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) return null;
    if (codePoint > 0x10ffff) return null;

    out += String.fromCodePoint(codePoint);
    i += extra + 1;
  }
  return out;
}

/**
 * Returns `text` with a Latin-1 mis-decode undone, or `text` unchanged when it doesn't look like one.
 *
 * Safe to call on anything: ASCII, already-correct text, and genuinely Latin-1 content all come back
 * untouched.
 */
export function repairUtf8(text: string): string {
  if (!hasHighBytes(text)) return text;
  const bytes = toBytes(text);
  if (!bytes) return text;
  const decoded = decodeUtf8(bytes);
  // Unchanged when the bytes weren't valid UTF-8 — that means the text was never mis-decoded.
  return decoded ?? text;
}

/**
 * `repairUtf8` applied to every string inside a parsed JSON value.
 *
 * Needed because the damage outlives the fix: definitions are cached once and then never refetched
 * — `loadDefinitions` skips an assessment it already holds — so an install that cached mis-decoded
 * text keeps showing it however the fetch behaves afterwards. Repairing on the way out of the cache
 * heals those without a reinstall or a cache-version bump.
 *
 * Returns the value unchanged when nothing needed repair, so an already-clean cache costs one walk
 * and no allocation.
 */
export function repairUtf8Deep<T>(value: T): T {
  if (typeof value === 'string') return repairUtf8(value) as unknown as T;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map(item => {
      const next = repairUtf8Deep(item);
      if (next !== item) changed = true;
      return next;
    });
    return (changed ? out : value) as unknown as T;
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const next = repairUtf8Deep(item);
      if (next !== item) changed = true;
      out[key] = next;
    }
    return (changed ? out : value) as unknown as T;
  }
  return value;
}
