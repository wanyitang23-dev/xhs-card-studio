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
 * Pulls the actual HTML document out of an agent's possibly chatty response.
 * Agents sometimes wrap output in ```html ... ``` fences or prepend explanation.
 */
export function extractHtml(streamed: string): string {
  if (!streamed) return "";
  streamed = clampNegativeLetterSpacing(streamed);

  // 1. Strip leading ```html fence (and trailing ```)
  const fence = streamed.match(/```(?:html|HTML)?\s*([\s\S]*?)```/);
  if (fence) {
    const inner = fence[1].trim();
    if (inner.startsWith("<")) return inner;
  }

  // 2. Find <!DOCTYPE html ... </html>
  const doctypeStart = streamed.search(/<!DOCTYPE\s+html/i);
  if (doctypeStart !== -1) {
    const closeIdx = streamed.lastIndexOf("</html>");
    if (closeIdx !== -1) {
      return streamed.slice(doctypeStart, closeIdx + "</html>".length);
    }
    // streaming, partial — return from doctype to end
    return streamed.slice(doctypeStart);
  }

  // 3. Find <html> ... </html>
  const htmlStart = streamed.search(/<html[\s>]/i);
  if (htmlStart !== -1) {
    const closeIdx = streamed.lastIndexOf("</html>");
    if (closeIdx !== -1) {
      return streamed.slice(htmlStart, closeIdx + "</html>".length);
    }
    return streamed.slice(htmlStart);
  }

  // 4. If it begins with < (root element), trust it
  if (streamed.trimStart().startsWith("<")) {
    return streamed;
  }

  // 5. Wrap whatever we got in a minimal scaffold so something renders
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
