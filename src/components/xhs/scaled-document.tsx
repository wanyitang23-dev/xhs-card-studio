"use client";

import { useElementSize } from "@/lib/xhs/use-element-size";

/**
 * Render an agent-authored page at the pixel width it was designed for, then
 * scale it down to whatever space the UI has.
 *
 * Sizing the iframe to its container instead re-lays-out the document at the
 * wrong width: a 1080px card in an 800px pane either reflows (if it has
 * `max-width`) or overflows and gets clipped (if it doesn't). Both are wrong,
 * and the second is what the zoom modal was doing — the card's left and right
 * edges were cut off with a horizontal scrollbar underneath.
 *
 * `clientWidth` is unaffected by CSS transforms, so the PNG export still reads
 * the authored width and comes out at full resolution.
 */
export function ScaledDocument({
  authoredWidth,
  scale: scaleProp,
  src,
  srcDoc,
  title,
  iframeRef,
  onLoad,
  className,
  style,
}: {
  /** The width the page lays out at — 1080 for a Xiaohongshu card. */
  authoredWidth: number;
  /**
   * Explicit display scale. Omit to fit the container's width.
   * The iframe still lays out at `authoredWidth` either way, so zooming never
   * changes the document's layout — only how large it appears.
   */
  scale?: number;
  src?: string;
  srcDoc?: string;
  title: string;
  iframeRef?: React.MutableRefObject<HTMLIFrameElement | null>;
  onLoad?: React.ReactEventHandler<HTMLIFrameElement>;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  // Fit by width — the page is a tall stack of cards the user scrolls through.
  // Never scale up: a page narrower than the pane should sit at 1:1.
  const fitScale = size ? Math.min(1, size.width / authoredWidth) : 0;
  const scale = scaleProp ?? fitScale;

  return (
    <div ref={ref} className={`overflow-hidden ${className ?? ""}`} style={style}>
      {scale > 0 && size && (
        <iframe
          ref={iframeRef}
          onLoad={onLoad}
          title={title}
          {...(src ? { src } : {})}
          {...(srcDoc ? { srcDoc } : {})}
          sandbox="allow-scripts allow-same-origin"
          className="origin-top-left border-0"
          style={{
            width: authoredWidth,
            display: "block",
            // Undo the scale so the iframe still fills the container vertically
            // and scrolls its own content rather than being clipped short.
            height: size.height / scale,
            // Centre with the transform, never with a margin. The iframe's
            // layout box stays `authoredWidth` wide however far it is scaled
            // down, so a margin would add to that width and push the whole page
            // sideways — at 35% it added ~310px and gave the app a horizontal
            // scrollbar. Transforms don't participate in layout at all.
            // Functions compose right-to-left: scale first, then shift by an
            // unscaled amount.
            transform: `translateX(${Math.max(0, (size.width - authoredWidth * scale) / 2)}px) scale(${scale})`,
          }}
        />
      )}
    </div>
  );
}
