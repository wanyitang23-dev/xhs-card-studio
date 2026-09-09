"use client";

import { useEffect, useMemo, useRef } from "react";
import { useElementSize } from "@/lib/xhs/use-element-size";
import { useXhs } from "@/lib/xhs/store";
import { useFlow } from "@/lib/xhs/use-flow";
import { previewHtml } from "@/lib/extract-html";
import { ExportMenu } from "@/components/export-menu";
import { parseViewport } from "@/lib/xhs/aspect";
import { useTemplates } from "@/lib/templates";

export function StepRender() {
  const html = useXhs((s) => s.finalHtml);
  const status = useXhs((s) => s.renderStatus);
  const error = useXhs((s) => s.renderError);
  const pages = useXhs((s) => s.pages);
  const templateId = useXhs((s) => s.templateId);
  const setStep = useXhs((s) => s.setStep);
  const templates = useTemplates();
  const { runRender, cancel } = useFlow();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const started = useRef(false);

  // Auto-start once. `started` guards against React StrictMode's double-mount
  // in dev, which would otherwise spawn two agents and interleave their output.
  useEffect(() => {
    if (started.current || status !== "idle" || !pages.length) return;
    started.current = true;
    void runRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = status === "running";
  const display = useMemo(() => previewHtml(html), [html]);
  // Lay the page out at the width the cards were authored for. The pane is
  // narrower than that, so the iframe is scaled down for display only —
  // `clientWidth` stays 1080, which is what the PNG export reads.
  const authoredWidth = useMemo(() => {
    const hint = templates?.find((t) => t.id === templateId)?.aspectHint;
    return parseViewport(hint).width;
  }, [templates, templateId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 px-6 py-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[var(--ink)]">
            成品 · {pages.length} 页
          </h2>
          <p className="mt-0.5 truncate text-[13px] text-[var(--ink-faint)]">
            {running
              ? `正在生成… 已收到 ${(html.length / 1024).toFixed(1)} KB`
              : status === "done"
                ? "生成完成。用右侧导出成 PNG 发小红书。"
                : status === "error"
                  ? error
                  : "准备生成"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep("outline")}
            className="rounded-xl px-4 py-2 text-[13px]"
            style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
          >
            ← 回去改分页
          </button>
          <button
            type="button"
            onClick={() => (running ? cancel() : void runRender())}
            className="rounded-xl px-4 py-2 text-[13px] font-medium"
            style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
          >
            {running ? "取消" : "重新生成"}
          </button>
          <ExportMenu iframeRef={iframeRef} html={html} />
        </div>
      </header>

      <div className="min-h-0 flex-1 px-6 pb-6">
        {html ? (
          <ScaledDocument
            iframeRef={iframeRef}
            srcDoc={display}
            authoredWidth={authoredWidth}
          />
        ) : (
          <div
            className="grid h-full place-items-center rounded-2xl text-[13px] text-[var(--ink-faint)]"
            style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
          >
            {running ? "agent 正在写…" : status === "error" ? error : "还没有内容"}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Render the finished page at its authored pixel width, scaled to fit the pane.
 *
 * A `width:100%` iframe lays the document out at the pane's width — around
 * 800px — so a 1080px card wraps its text at the wrong place, and because the
 * PNG export reads `documentElement.clientWidth`, that wrong wrapping is what
 * gets exported. Fixing the iframe at the authored width and shrinking it with
 * a CSS transform keeps layout correct; `clientWidth` is unaffected by
 * transforms, so the export still comes out at full resolution.
 */
function ScaledDocument({
  iframeRef,
  srcDoc,
  authoredWidth,
}: {
  iframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  srcDoc: string;
  authoredWidth: number;
}) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  // Fit by width only — the page is a tall stack of cards the user scrolls.
  // Never scale up: a card smaller than the pane should sit at 1:1.
  const scale = size ? Math.min(1, size.width / authoredWidth) : 0;

  return (
    <div
      ref={ref}
      className="h-full w-full overflow-hidden rounded-2xl"
      style={{ background: "#fff", border: "1px solid var(--line-soft)" }}
    >
      {scale > 0 && size && (
        <iframe
          ref={iframeRef}
          title="成品预览"
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-same-origin"
          className="origin-top-left border-0"
          style={{
            width: authoredWidth,
            // Undo the scale so the iframe still fills the pane vertically and
            // scrolls its own content rather than being clipped short.
            height: size.height / scale,
            transform: `scale(${scale})`,
          }}
        />
      )}
    </div>
  );
}
