/**
 * Clamp negative `letter-spacing` to zero.
 *
 * Negative tracking is standard practice for large Latin display type, and
 * models reach for it constantly — but CJK glyphs already fill their em box,
 * so on a Chinese headline it makes characters physically overlap. Observed at
 * `letter-spacing:-.04em` on a 96px heading, where 「专属大脑」collided into an
 * unreadable smear.
 *
 * The prompts now forbid it (see CJK_TYPOGRAPHY_RULES), but a prompt is a
 * request, not a guarantee, and this particular defect destroys the artifact
 * rather than merely making it uglier. So the value is neutralised here too.
 * Positive and zero tracking are left exactly as authored.
 *
 * Trade-off: a Latin-only headline loses a hair of tightening. In a
 * Chinese-first card tool that is the right side to err on.
 */
export function clampNegativeLetterSpacing(html: string): string {
  return html.replace(
    /letter-spacing\s*:\s*-\s*(?:\d*\.)?\d+(?:em|rem|px|ch|ex|%)/gi,
    "letter-spacing:0",
  );
}


/**
 * Stop Tailwind's Preflight from silently erasing hand-written heading sizes.
 *
 * Measured on a real cover whose title vanished. The author's stylesheet said
 * `h1{font-size:150px}` and the heading rendered at 16px. Both rules match at
 * specificity (0,0,1):
 *
 *   sheet 1  the document's own <style>   h1                    font-size:150px
 *   sheet 2  injected by the Play CDN     h1,h2,h3,h4,h5,h6     font-size:inherit
 *
 * The Play CDN builds its stylesheet at runtime and appends it, so source order
 * decides and Preflight always wins. Anything styled through a class is
 * untouched — a class beats an element selector — which is why only the
 * headline disappeared while the rest of the card looked right. Nothing about
 * the generated HTML looks wrong when you read it.
 *
 * Preflight is disabled, and the parts of it that are actually load-bearing
 * (margin and list normalisation, sane media defaults) are restored as a base
 * layer placed *before* the document's own styles, so the author still wins
 * every conflict. Tailwind's utility classes are unaffected — Preflight is only
 * the reset.
 */
const BASE_RESET = `<style data-xhs="base-reset">*,::before,::after{box-sizing:border-box}` +
  `html{-webkit-text-size-adjust:100%}body{margin:0;line-height:1.5}` +
  `h1,h2,h3,h4,h5,h6,p,figure,blockquote,dl,dd,pre{margin:0}` +
  `ol,ul,menu{list-style:none;margin:0;padding:0}` +
  `img,svg,video,canvas,audio,iframe,embed,object{display:block;vertical-align:middle}` +
  `img,video{max-width:100%;height:auto}` +
  `button,input,optgroup,select,textarea{font:inherit;color:inherit;margin:0}` +
  `table{border-collapse:collapse}</style>`;

const TAILWIND_CDN = /<script\b[^>]*\bsrc\s*=\s*["'][^"']*cdn\.tailwindcss\.com[^"']*["'][^>]*>\s*<\/script>/i;

export function neutralizeTailwindPreflight(html: string): string {
  const cdn = TAILWIND_CDN.exec(html);
  if (!cdn) return html; // No Play CDN, no Preflight, nothing to undo.
  if (/data-xhs="base-reset"/.test(html)) return html; // already processed

  // The config has to come *after* the CDN tag; that is how Play reads it.
  const configured = html.replace(
    TAILWIND_CDN,
    (tag) => `${tag}\n<script>tailwind.config={corePlugins:{preflight:false}}</script>`,
  );

  // The base layer has to come *before* the document's own styles so that any
  // rule the author wrote continues to win on source order.
  const head = /<head\b[^>]*>/i.exec(configured);
  if (head) {
    const at = head.index + head[0].length;
    return configured.slice(0, at) + "\n" + BASE_RESET + configured.slice(at);
  }
  return BASE_RESET + "\n" + configured;
}

/** Every index where a document could begin, in order. */
function starts(s: string, re: RegExp): number[] {
  const out: number[] = [];
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  for (let m = g.exec(s); m; m = g.exec(s)) out.push(m.index);
  return out;
}

/**
 * Slice out the last *complete* document that begins at one of `openings`.
 *
 * "Complete" means it has a closing tag of its own — found by scanning forward
 * from the opening, never by taking the file's last `</html>`. That distinction
 * is the whole point: an agent that answers with a draft and then a revision
 * used to have both spliced into one string, so the second document's `<head>`
 * landed inside the first one's `<body>` and its CSS rendered as page text.
 *
 * Preference is for the *last* complete document, because a model that emits
 * two is revising forward — the later one is the answer. Falling back to the
 * last opening with no close covers the streaming case, where the document
 * currently arriving is legitimately unfinished.
 */
function lastDocument(s: string, openings: number[], close: string): string | null {
  if (openings.length === 0) return null;
  for (let i = openings.length - 1; i >= 0; i--) {
    const from = openings[i];
    const end = s.indexOf(close, from);
    if (end !== -1) return s.slice(from, end + close.length);
  }
  // Nothing closed yet — still streaming. Show what has arrived.
  return s.slice(openings[openings.length - 1]);
}

/**
 * Pulls the actual HTML document out of an agent's possibly chatty response.
 * Agents wrap output in ```html … ``` fences, prepend explanation, and
 * sometimes answer with more than one document.
 */
export function extractHtml(streamed: string): string {
  if (!streamed) return "";
  streamed = clampNegativeLetterSpacing(streamed);

  // 1. A real document wins, wherever it sits. Locating it by its own tags
  //    rather than by fences also sidesteps the case where the *card content*
  //    contains a ``` run, which used to truncate the document at that point.
  const byDoctype = lastDocument(streamed, starts(streamed, /<!DOCTYPE\s+html/i), "</html>");
  if (byDoctype) return neutralizeTailwindPreflight(byDoctype);

  const byHtmlTag = lastDocument(streamed, starts(streamed, /<html[\s>]/i), "</html>");
  if (byHtmlTag) return neutralizeTailwindPreflight(byHtmlTag);

  // 2. No document tags at all — a fragment, possibly inside a fence.
  const fence = streamed.match(/```(?:html|HTML)?\s*([\s\S]*?)```/);
  if (fence) {
    const inner = fence[1].trim();
    if (inner.startsWith("<")) return inner;
  }

  // 3. Begins with a root element — trust it.
  if (streamed.trimStart().startsWith("<")) return streamed;

  // 4. Wrap whatever we got so something renders.
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="https://cdn.tailwindcss.com"></script></head><body class="p-8 font-sans"><pre class="whitespace-pre-wrap">${escape(
    streamed,
  )}</pre></body></html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * For previews while the stream is still arriving — make sure we always
 * produce a closing </body></html> so the iframe can render incrementally.
 */
export function previewHtml(streamed: string): string {
  const html = extractHtml(streamed);
  if (!html) return "";
  if (/<\/html>/i.test(html)) return html;
  return html + "\n</body>\n</html>";
}
