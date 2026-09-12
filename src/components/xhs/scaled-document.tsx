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
  authoredHeight,
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
  /** Fix the iframe viewport to the authored card height when provided. */
  authoredHeight?: number;
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
  const fixedCanvas = Boolean(authoredHeight && authoredHeight > 0);

  const frame = scale > 0 && size ? (
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
        height: fixedCanvas ? authoredHeight : size.height / scale,
        display: "block",
        position: fixedCanvas ? "absolute" : undefined,
        left: fixedCanvas ? 0 : undefined,
        top: fixedCanvas ? 0 : undefined,
        transform: `translateX(${Math.max(0, (size.width - authoredWidth * scale) / 2)}px) scale(${scale})`,
      }}
    />
  ) : null;

  return (
    <div
      ref={ref}
      className={`${fixedCanvas ? "overflow-auto" : "overflow-hidden"} ${className ?? ""}`}
      style={style}
    >
      {fixedCanvas && size && authoredHeight ? (
        <div
          className="relative"
          style={{
            width: Math.max(size.width, authoredWidth * scale),
            height: authoredHeight * scale,
          }}
        >
          {frame}
        </div>
      ) : (
        frame
      )}
    </div>
  );
}
