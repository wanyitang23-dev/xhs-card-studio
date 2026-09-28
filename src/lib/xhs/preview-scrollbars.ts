/** Marker used to keep repeated iframe `load` events idempotent. */
export const PREVIEW_SCROLLBAR_STYLE_ID = "xhs-preview-scrollbars";

/**
 * Hide only the root document scrollbars while preserving scrolling itself.
 *
 * A finished deck commonly stacks several 1080×1440 cards vertically. The
 * preview iframe is exactly one card tall, so its vertical scrollbar consumes
 * part of the 1080px viewport. The fixed-width card then overflows that reduced
 * viewport, which creates a horizontal scrollbar and clips its right edge.
 *
 * `overflow:hidden` would also prevent the user from scrolling through a
 * stacked deck. Styling the scrollbars instead keeps wheel/touch scrolling and
 * gives the document the full authored width.
 */
export function hidePreviewScrollbars(doc: Document): void {
  if (doc.getElementById(PREVIEW_SCROLLBAR_STYLE_ID)) return;

  const style = doc.createElement("style");
  style.id = PREVIEW_SCROLLBAR_STYLE_ID;
  style.textContent =
    "html,body{scrollbar-width:none!important}" +
    "html::-webkit-scrollbar,body::-webkit-scrollbar{" +
    "display:none!important;width:0!important;height:0!important}";
  (doc.head ?? doc.documentElement).appendChild(style);
}
