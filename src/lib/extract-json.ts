/**
 * Pulls a JSON payload out of an agent's possibly chatty response.
 *
 * The sibling of `extract-html.ts`. Where that one rescues an HTML document,
 * this one rescues a JSON object — needed by the outline stage, which asks the
 * agent for a page-by-page plan rather than a rendered page.
 *
 * Agents wrap JSON in ```json fences, prepend "好的，这是大纲：", or append a
 * trailing summary. All three are stripped here so the caller only ever sees
 * the object.
 */

/** Strip ```json … ``` fences, returning the inner text if one is present. */
function stripFence(s: string): string {
  const fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  return s;
}

/**
 * Yield every balanced `{…}` / `[…]` run in `s`, in start order, ignoring
 * brackets that appear inside string literals.
 *
 * Multiple candidates matter: agents routinely write prose containing braces
 * ("use {curly} braces") *before* the real payload, so anchoring on the first
 * opening bracket alone finds a balanced-but-not-JSON span and gives up. We
 * hand every span to the caller and let `JSON.parse` pick the winner.
 */
function* balancedSpans(s: string): Generator<string> {
  for (let start = 0; start < s.length; start++) {
    const open = s[start];
    if (open !== "{" && open !== "[") continue;
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    let escaped = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          yield s.slice(start, i + 1);
          break;
        }
      }
    }
  }
}

/**
 * Best-effort parse of an agent response into `T`.
 * Returns `null` when nothing JSON-shaped could be recovered — callers should
 * surface that as a retryable error rather than crashing.
 */
export function extractJson<T = unknown>(streamed: string): T | null {
  if (!streamed?.trim()) return null;
  const candidates = [stripFence(streamed), streamed];
  for (const c of candidates) {
    const trimmed = c.trim();
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      // fall through to the balanced-span scan
    }
    for (const span of balancedSpans(trimmed)) {
      try {
        return JSON.parse(span) as T;
      } catch {
        // not the payload — keep scanning later opening brackets
      }
    }
  }
  return null;
}
