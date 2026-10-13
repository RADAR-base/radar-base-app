/**
 * What markup a questionnaire definition may put on screen: the tags the renderer honours and the
 * URLs it will open or fetch. Pure string functions, no React.
 */

export const BOLD_TAGS = ['b', 'strong'];
export const ITALIC_TAGS = ['i', 'em'];
export const SMALL_TAGS = ['small'];

/** Every tag the renderer honours. Anything else is stripped to the text it wrapped. */
export const ALLOWED_TAGS = new Set([
  ...BOLD_TAGS,
  ...ITALIC_TAGS,
  ...SMALL_TAGS,
  'a',
  'br',
  'img',
  'iframe',
]);

/** Schemes a link may open. Rules out `javascript:`, `data:`, `file:` and app deep links. */
export const SAFE_LINK_SCHEMES = ['https:', 'mailto:', 'tel:'];

export const SAFE_IMAGE_SCHEMES = ['https:'];

/** An `<iframe>` is only honoured as a video file over TLS, never as a page to render. */
export const SAFE_VIDEO_SCHEMES = ['https:'];
export const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.mov', '.webm'];

/** One attribute off a tag, e.g. `href` or `src`. */
export function attr(attrs: string, name: string): string | undefined {
  const match = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attrs);
  return match?.[2] ?? match?.[3];
}

/** A URL's scheme in lower case, or `''` when it has none. */
export function scheme(url: string): string {
  // Skip leading whitespace and control characters, which are used to disguise a scheme.
  let start = 0;
  while (start < url.length && url.charCodeAt(start) <= 0x20) start += 1;
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*:)/.exec(url.slice(start));
  return (match?.[1] ?? '').toLowerCase();
}

/** The URL a link may open, or `undefined` if its scheme isn't allowed. */
export function safeHref(url?: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  return SAFE_LINK_SCHEMES.includes(scheme(trimmed)) ? trimmed : undefined;
}

/** The URL an image may be fetched from, or `undefined` if its scheme isn't allowed. */
export function safeImageSrc(url?: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  return SAFE_IMAGE_SCHEMES.includes(scheme(trimmed)) ? trimmed : undefined;
}

/** The URL a video may be played from, or `undefined` unless it is a media file over TLS. */
export function safeVideoSrc(url?: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!SAFE_VIDEO_SCHEMES.includes(scheme(trimmed))) return undefined;
  const path = trimmed.split(/[?#]/)[0].toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext)) ? trimmed : undefined;
}
