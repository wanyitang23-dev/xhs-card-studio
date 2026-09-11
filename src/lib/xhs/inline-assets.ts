/**
 * Put the real image bytes into a finished document, after the agent is done.
 *
 * The pipeline used to inline every attached screenshot as a full data URL
 * *into the prompt*, which meant the agent had to copy that base64 back out,
 * character for character, into its answer. A screenshot bounded at a 1600px
 * long edge is a few hundred kilobytes, so the base64 runs to several hundred
 * thousand characters — far past any model's output budget. The observed
 * failure was a cover that stopped mid-string:
 *
 *   <img src="data:image/jpeg;base64,/9j/4AAQ … Q7MkaS
 *   </body></html>          <- appended by previewHtml, the document never closed
 *
 * So the agent now writes a short `asset:<id>` token and the bytes are
 * substituted here. The prompt shrinks by orders of magnitude, the document can
 * never be truncated by image size, and the image cannot be corrupted by a
 * single mistyped character.
 */

/** `asset:` followed by the id characters `nid()` produces. */
const TOKEN = /asset:[A-Za-z0-9_-]+/g;

/**
 * A visible stand-in for a token with no bytes behind it, so a missing image
 * leaves an obvious gap rather than a broken-image glyph or a raw token.
 */
const MISSING =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">` +
      `<rect width="100%" height="100%" fill="#f1f0ee"/>` +
      `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"` +
      ` font-family="sans-serif" font-size="22" fill="#a09a92">图片已丢失</text></svg>`,
  );

/**
 * Swap every `asset:<id>` token for its data URL.
 *
 * Substitution is textual rather than DOM-based on purpose: this also runs on
 * partial documents mid-stream, where there is no parseable DOM yet.
 */
export function inlineAssets(html: string, assets: Record<string, string> | undefined): string {
  if (!html || !TOKEN.test(html)) return html;
  TOKEN.lastIndex = 0; // `test` on a /g regex advances lastIndex
  return html.replace(TOKEN, (token) => {
    const url = assets?.[token];
    return typeof url === "string" && url.length > 0 ? url : MISSING;
  });
}
