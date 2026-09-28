/**
 * Putting the locked cover into the finished deck by code, instead of asking
 * the agent to copy it.
 *
 * The render used to receive the chosen cover's HTML and be told to reproduce
 * it as page 1. That meant reading a few thousand tokens and then writing the
 * same few thousand back out — output is the expensive direction — and the copy
 * could still drift from the card the user picked. Now the agent leaves an
 * empty slot where page 1 goes and the cover is spliced in here.
 *
 * The two documents were written independently, so their CSS cannot simply be
 * concatenated: both routinely use `.card` / `.title`, and whichever rule
 * lands last would restyle the other document's cards. So the cover is
 * isolated on the way in:
 *
 *   - every class its own stylesheet defines is renamed (`card` → `xc-card`),
 *     so the deck's `.card{…}` no longer matches anything on the cover;
 *   - every cover selector is scoped under `#xhs-cover`, so the cover's rules
 *     cannot reach the deck, and its `:root` / `html` / `body` rules land on
 *     the cover's own wrapper instead of the whole document.
 *
 * Tailwind utility classes are left alone: they are not defined in the cover's
 * stylesheet, and the Play CDN in the combined document generates them for
 * whatever markup it finds.
 */

import { extractHtml } from "@/lib/extract-html";

/** Attribute the agent puts on the empty page-1 slot. */
export const COVER_SLOT_ATTR = "data-xhs-cover";

const SCOPE_ID = "xhs-cover";
const CLASS_PREFIX = "xc-";

/**
 * Whether this run can splice the cover rather than have it rewritten.
 *
 * Page 1 can carry an attachment the locked cover never had — the cover step
 * and the outline are separate. Splicing would then drop the user's picture,
 * so that case keeps the old path, where the agent redraws page 1 with it.
 *
 * Shared by the render route (which picks the prompt) and the client (which
 * does the splice), so the two always agree.
 */
export function canSpliceCover(
  pages: ReadonlyArray<{ imageAssetIds?: string[] }>,
  coverHtml: string | undefined | null,
): boolean {
  if (!coverHtml?.trim()) return false;
  return (pages[0]?.imageAssetIds ?? []).every((id) => coverHtml.includes(id));
}

// ---------------------------------------------------------------------------
// CSS scoping
// ---------------------------------------------------------------------------

/** At-rules whose body is itself a list of rules and should be scoped. */
const NESTED_AT_RULES = new Set(["media", "supports", "container", "layer", "document"]);

/**
 * Index of the first `stops` character at bracket depth 0, skipping strings
 * and comments. -1 when there is none.
 */
function findAtDepth0(css: string, from: number, stops: string): number {
  let depth = 0;
  for (let i = from; i < css.length; i++) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end === -1) return -1;
      i = end + 1;
    } else if (ch === '"' || ch === "'") {
      i = skipString(css, i);
    } else if (ch === "(" || ch === "[") {
      depth++;
    } else if (ch === ")" || ch === "]") {
      depth--;
    } else if (depth === 0 && stops.includes(ch)) {
      return i;
    }
  }
  return -1;
}

function skipString(css: string, at: number): number {
  const quote = css[at];
  for (let i = at + 1; i < css.length; i++) {
    if (css[i] === "\\") i++;
    else if (css[i] === quote) return i;
  }
  return css.length;
}

/** Index of the `}` that closes the `{` at `open`. */
function matchingBrace(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end === -1) return css.length;
      i = end + 1;
    } else if (ch === '"' || ch === "'") {
      i = skipString(css, i);
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}" && --depth === 0) {
      return i;
    }
  }
  return css.length;
}

/** Split a selector list on its top-level commas. */
function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = findAtDepth0(list, from, ",");
    if (at === -1) break;
    out.push(list.slice(from, at));
    from = at + 1;
  }
  out.push(list.slice(from));
  return out.map((s) => s.trim()).filter(Boolean);
}

const CLASS_RE = /\.(-?[_a-zA-Z][\w-]*)/g;
const ROOT_RE = /^(?::root|html|body)(?![\w-])/;

/** Class names a stylesheet defines rules for. */
function definedClasses(css: string, into: Set<string>): void {
  walkRules(css, (selectors) => {
    for (const m of selectors.matchAll(CLASS_RE)) into.add(m[1]);
    return selectors;
  });
}

/**
 * One selector, renamed and moved under the cover's wrapper.
 *
 * A leading `:root` / `html` / `body` *is* the wrapper now — the cover was a
 * whole document and its page-level rules (background, font, CSS variables)
 * belong on the box that stands in for that page.
 */
function scopeSelector(sel: string, classes: Set<string>): string {
  const renamed = sel.replace(CLASS_RE, (m, c: string) => (classes.has(c) ? `.${CLASS_PREFIX}${c}` : m));
  let rest = renamed;
  let sawRoot = false;
  for (;;) {
    const m = rest.match(ROOT_RE);
    if (!m) break;
    sawRoot = true;
    rest = rest.slice(m[0].length);
    // Attached to the root compound (`body.dark`, `body::before`): keep it on the wrapper.
    if (rest && !/^[\s>+~]/.test(rest)) return `#${SCOPE_ID}${rest}`;
    const comb = rest.match(/^\s*([>+~]?)\s*/)!;
    rest = rest.slice(comb[0].length);
    if (!rest) return `#${SCOPE_ID}`;
    if (!ROOT_RE.test(rest)) return `#${SCOPE_ID} ${comb[1] ? `${comb[1]} ` : ""}${rest}`;
  }
  return sawRoot ? `#${SCOPE_ID}` : `#${SCOPE_ID} ${renamed}`;
}

/**
 * Visit every style rule's selector list, recursing into `@media` and friends.
 * `@font-face`, `@keyframes`, `@import` and the like pass through untouched.
 */
function walkRules(css: string, onSelectors: (selectors: string) => string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const stop = findAtDepth0(css, i, "{;");
    if (stop === -1) {
      out += css.slice(i);
      break;
    }
    const prelude = css.slice(i, stop).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (css[stop] === ";") {
      out += `${prelude};`;
      i = stop + 1;
      continue;
    }
    const close = matchingBrace(css, stop);
    const body = css.slice(stop + 1, close);
    if (prelude.startsWith("@")) {
      const name = prelude.match(/^@([\w-]+)/)?.[1]?.toLowerCase() ?? "";
      out += NESTED_AT_RULES.has(name)
        ? `${prelude}{${walkRules(body, onSelectors)}}`
        : `${prelude}{${body}}`;
    } else if (prelude) {
      out += `${onSelectors(prelude)}{${body}}`;
    }
    i = close + 1;
  }
  return out;
}

/** Scope a whole stylesheet under the cover wrapper. Exported for tests. */
export function scopeCoverCss(css: string, classes: Set<string>): string {
  return walkRules(css, (list) =>
    splitSelectors(list)
      .map((s) => scopeSelector(s, classes))
      .join(","),
  );
}

// ---------------------------------------------------------------------------
// Splicing
// ---------------------------------------------------------------------------

const TAILWIND_CDN = /cdn\.tailwindcss\.com/;
const NOT_CONTENT = new Set(["SCRIPT", "STYLE", "LINK", "META", "TITLE", "NOSCRIPT", "TEMPLATE"]);

function renameClassAttr(el: Element, classes: Set<string>): void {
  const value = el.getAttribute("class");
  if (!value) return;
  el.setAttribute(
    "class",
    value
      .split(/\s+/)
      .filter(Boolean)
      .map((c) => (classes.has(c) ? `${CLASS_PREFIX}${c}` : c))
      .join(" "),
  );
}

/**
 * Where the cover goes: the agent's slot, or — if the agent forgot it — a new
 * slot shaped like the deck's first card, so deck navigation and spacing still
 * treat the cover as a card.
 */
function findSlot(doc: Document): Element {
  const slot = doc.querySelector(`[${COVER_SLOT_ATTR}]`);
  if (slot) return slot;
  const firstCard = doc.body.querySelector("section.slide, .card, [class*='card']");
  const made = doc.createElement(firstCard?.tagName.toLowerCase() ?? "div");
  if (firstCard?.getAttribute("class")) made.setAttribute("class", firstCard.getAttribute("class")!);
  made.setAttribute(COVER_SLOT_ATTR, "");
  if (firstCard) firstCard.before(made);
  else doc.body.prepend(made);
  return made;
}

/**
 * Put the locked cover into the rendered deck as page 1.
 *
 * Both inputs may be raw agent output; each is run through `extractHtml`
 * first. Returns the combined document. If either side has no parseable
 * document, the deck is returned as it was rather than throwing away a render.
 */
export function spliceCover(deckRaw: string, coverRaw: string): string {
  const deckHtml = extractHtml(deckRaw);
  const coverHtml = extractHtml(coverRaw);
  if (!deckHtml || !coverHtml) return deckHtml;

  const parser = new DOMParser();
  const deck = parser.parseFromString(deckHtml, "text/html");
  const cover = parser.parseFromString(coverHtml, "text/html");
  if (!deck.body || !cover.body) return deckHtml;

  const styles = Array.from(cover.querySelectorAll("style"));
  const classes = new Set<string>();
  for (const s of styles) definedClasses(s.textContent ?? "", classes);

  // Styles: scoped, and after the deck's own so the cover wins its own ties.
  for (const s of styles) {
    const scoped = deck.createElement("style");
    scoped.setAttribute("data-xhs-cover-style", "");
    scoped.textContent = scopeCoverCss(s.textContent ?? "", classes);
    deck.head.append(scoped);
  }

  // Fonts and other stylesheets the cover pulled in.
  const haveHrefs = new Set(
    Array.from(deck.querySelectorAll("link[href]")).map((l) => l.getAttribute("href")),
  );
  for (const link of Array.from(cover.querySelectorAll("link[href]"))) {
    if (haveHrefs.has(link.getAttribute("href"))) continue;
    deck.head.append(deck.importNode(link, true));
  }

  // Tailwind: the cover's utility classes need the CDN, and its custom theme
  // if it had one and the deck does not.
  const scripts = (d: Document) => Array.from(d.querySelectorAll("script"));
  const deckHasCdn = scripts(deck).some((s) => TAILWIND_CDN.test(s.getAttribute("src") ?? ""));
  const deckHasConfig = scripts(deck).some((s) => /tailwind\.config\s*=/.test(s.textContent ?? ""));
  for (const s of scripts(cover)) {
    const isCdn = TAILWIND_CDN.test(s.getAttribute("src") ?? "");
    const isConfig = /tailwind\.config\s*=/.test(s.textContent ?? "");
    if ((isCdn && !deckHasCdn) || (isConfig && !deckHasConfig)) {
      const copy = deck.createElement("script");
      for (const a of Array.from(s.attributes)) copy.setAttribute(a.name, a.value);
      copy.textContent = s.textContent;
      deck.head.append(copy);
    }
  }

  // The cover's page, as one fixed-size box standing in for its <body>.
  const wrapper = deck.createElement("div");
  wrapper.id = SCOPE_ID;
  const bodyClass = cover.body.getAttribute("class");
  if (bodyClass) {
    wrapper.setAttribute("class", bodyClass);
    renameClassAttr(wrapper, classes);
  }
  wrapper.setAttribute(
    "style",
    `${cover.body.getAttribute("style") ?? ""};position:relative;width:1080px;height:1440px;overflow:hidden;flex:none;margin:0;box-sizing:border-box`,
  );
  for (const child of Array.from(cover.body.children)) {
    if (NOT_CONTENT.has(child.tagName)) continue;
    const node = deck.importNode(child, true) as Element;
    renameClassAttr(node, classes);
    node.querySelectorAll("[class]").forEach((el) => renameClassAttr(el, classes));
    wrapper.append(node);
  }

  const slot = findSlot(deck);
  slot.replaceChildren(wrapper);
  // The slot keeps the deck's card classes so navigation and gaps treat it as
  // a card, but none of the card's own dressing: padding would push the cover
  // off-centre, and a `.card::before` accent strip (deck-xhs-white draws a
  // 12px rainbow bar) would be painted over a cover that never had one.
  const reset = deck.createElement("style");
  reset.setAttribute("data-xhs-cover-style", "");
  reset.textContent =
    `[${COVER_SLOT_ATTR}]{padding:0!important;border:0!important}` +
    `[${COVER_SLOT_ATTR}]::before,[${COVER_SLOT_ATTR}]::after{content:none!important;display:none!important}`;
  deck.head.append(reset);

  return `<!DOCTYPE html>\n${deck.documentElement.outerHTML}`;
}
