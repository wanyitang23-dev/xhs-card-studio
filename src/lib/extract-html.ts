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
  if (byDoctype) return byDoctype;

  const byHtmlTag = lastDocument(streamed, starts(streamed, /<html[\s>]/i), "</html>");
  if (byHtmlTag) return byHtmlTag;

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
