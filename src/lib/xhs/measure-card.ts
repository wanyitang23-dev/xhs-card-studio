/**
 * Working out how big the card inside a generated document actually is.
 *
 * A cover preview used to assume the document *was* the card — scale
 * 1080×1440 to fit the tile and done. That holds only while the agent emits a
 * bare card. It stopped holding once the template's `example.html` started
 * reaching the prompt: every example is a gallery page (`body{padding:36px 0}`,
 * `.deck{gap:24px}`, a rounded card with a drop shadow) because it has several
 * cards to show, and the agent copied that shell around its single cover. The
 * tile then scaled the *shell* to fit and the card came out small and inset.
 *
 * Rather than assume a size, measure the card and fit that. This is correct for
 * a bare card, a card inside a gallery shell, and a card authored at some other
 * size — none of which the preview has to know about in advance.
 */

/** Where a card sits inside its document, in the document's own pixels. */
export type CardBox = { x: number; y: number; width: number; height: number };

/**
 * Find the element that is the card.
 *
 * Walks down from `body` for as long as there is exactly one laid-out child,
 * which unwraps the usual `body > .deck > .card` nesting without needing to
 * know those class names. Stops at the first element that has siblings — the
 * card's own contents — and never returns `body` itself, since body's box
 * includes the page padding we are trying to exclude.
 */
export function findCardElement(doc: Document): HTMLElement | null {
  const body = doc.body;
  if (!body) return null;

  let el: HTMLElement = body;
  // Six is well past `body > .deck > .card`; the bound just stops a cycle.
  for (let depth = 0; depth < 6; depth++) {
    const laidOut = Array.from(el.children).filter(
      (k): k is HTMLElement => k instanceof (doc.defaultView?.HTMLElement ?? HTMLElement) && hasBox(k),
    );
    if (laidOut.length !== 1) break;
    el = laidOut[0];
  }
  return el === body ? null : el;
}

function hasBox(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/**
 * The transform that puts `card` in the middle of a `tile`-sized box, as large
 * as fits.
 *
 * `transform-origin` is assumed to be the iframe's top-left, so the translate
 * is applied in unscaled pixels *after* the scale in CSS's right-to-left
 * composition order — hence subtracting the card's own scaled offset.
 */
export function cardFitTransform(
  card: CardBox,
  tile: { width: number; height: number },
): { scale: number; x: number; y: number } {
  if (!(card.width > 0) || !(card.height > 0) || !(tile.width > 0) || !(tile.height > 0)) {
    return { scale: 0, x: 0, y: 0 };
  }
  const scale = Math.min(tile.width / card.width, tile.height / card.height);
  return {
    scale,
    x: (tile.width - card.width * scale) / 2 - card.x * scale,
    y: (tile.height - card.height * scale) / 2 - card.y * scale,
  };
}

/**
 * Measure the card in a same-origin iframe.
 *
 * Returns `null` when the document is not readable or has not laid out yet, so
 * the caller can keep its previous estimate rather than flashing to zero.
 */
export function measureCard(frame: HTMLIFrameElement | null): CardBox | null {
  const doc = frame?.contentDocument;
  if (!doc?.body) return null;
  const el = findCardElement(doc);
  const target = el ?? doc.body;
  const r = target.getBoundingClientRect();
  if (!(r.width > 0) || !(r.height > 0)) return null;
  const win = doc.defaultView;
  // getBoundingClientRect is viewport-relative; add the scroll offset so the
  // box is in document coordinates and stays correct for a scrolled shell.
  return {
    x: r.left + (win?.scrollX ?? 0),
    y: r.top + (win?.scrollY ?? 0),
    width: r.width,
    height: r.height,
  };
}
