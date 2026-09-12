"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { ScaledDocument } from "./scaled-document";
import { useTask, useXhs } from "@/lib/xhs/store";
import { useFlow } from "@/lib/xhs/use-flow";
import { previewHtml } from "@/lib/extract-html";
import { ExportMenu } from "@/components/export-menu";
import { parseViewport } from "@/lib/xhs/aspect";
import { useTemplates } from "@/lib/templates";
import { CaptionPane } from "./caption-pane";

export function StepRender() {
  const html = useTask((t) => t.finalHtml);
  const status = useTask((t) => t.renderStatus);
  const error = useTask((t) => t.renderError);
  const pages = useTask((t) => t.pages);
  const templateId = useTask((t) => t.templateId);
  const setStep = useXhs((s) => s.setStep);
  const zoom = useXhs((s) => s.previewZoom);
  const setZoom = useXhs((s) => s.setPreviewZoom);
  const caption = useTask((t) => t.caption);
  const captionStatus = useTask((t) => t.captionStatus);
  const templates = useTemplates();
  const { runRender, runCaption, cancel } = useFlow();
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

  // Write the caption once the cards are done. It is a cheap text-only call and
  // the post is not finished without it, so it should not need a second click.
  const captionKicked = useRef(false);
  useEffect(() => {
    if (status !== "done" || captionKicked.current || caption || captionStatus === "running") return;
    captionKicked.current = true;
    void runCaption();
  }, [status, caption, captionStatus, runCaption]);

  const running = status === "running";
  const assets = useTask((t) => t.assets);
  const display = useMemo(() => previewHtml(html, assets), [html, assets]);
  // Lay the page out at the width the cards were authored for. The pane is
  // narrower than that, so the iframe is scaled down for display only —
  // `clientWidth` stays 1080, which is what the PNG export reads.
  const authoredWidth = useMemo(() => {
    const hint = templates?.find((t) => t.id === templateId)?.aspectHint;
    return parseViewport(hint).width;
  }, [templates, templateId]);

  // Keep navigation inside the authored HTML. This adds mouse/trackpad
  // gestures without drawing controls over the card or changing its layout.
  const enableDeckGestures = useCallback((event: React.SyntheticEvent<HTMLIFrameElement>) => {
    const doc = event.currentTarget.contentDocument;
    if (!doc || doc.documentElement.dataset.deckGestures === "on") return;

    const previous = doc.getElementById("prevPage");
    const next = doc.getElementById("nextPage");
    if (!previous || !next) return;

    doc.documentElement.dataset.deckGestures = "on";
    let dragStartX: number | null = null;
    let wheelDistance = 0;
    let wheelLockedUntil = 0;

    doc.addEventListener("pointerdown", (pointerEvent) => {
      if (pointerEvent.pointerType === "mouse" && pointerEvent.button === 0) {
        dragStartX = pointerEvent.clientX;
      }
    });
    doc.addEventListener("pointerup", (pointerEvent) => {
      if (pointerEvent.pointerType !== "mouse" || dragStartX === null) return;
      const distance = pointerEvent.clientX - dragStartX;
      dragStartX = null;
      if (Math.abs(distance) < 60) return;
      (distance > 0 ? previous : next).click();
    });
    doc.addEventListener("pointercancel", () => {
      dragStartX = null;
    });
    doc.addEventListener(
      "wheel",
      (wheelEvent) => {
        const horizontal = Math.abs(wheelEvent.deltaX) > Math.abs(wheelEvent.deltaY);
        if (!horizontal) return;
        wheelEvent.preventDefault();
        if (Date.now() < wheelLockedUntil) return;
        wheelDistance += wheelEvent.deltaX;
        if (Math.abs(wheelDistance) < 45) return;
        (wheelDistance < 0 ? previous : next).click();
        wheelDistance = 0;
        wheelLockedUntil = Date.now() + 450;
      },
      { passive: false },
    );
  }, []);

  return (
    <div className="render-step flex h-full min-h-0 flex-col">
      <header className="render-toolbar flex items-center gap-3 px-6 py-3">
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
          <ZoomControl value={zoom} onChange={setZoom} />
          <button
            type="button"
            onClick={() => setStep("outline")}
            className="glass-control rounded-xl px-4 py-2 text-[13px]"
            style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
          >
            <ArrowLeft aria-hidden="true" />
            回去改分页
          </button>
          <button
            type="button"
            onClick={() => (running ? cancel() : void runRender())}
            className="glass-control rounded-xl px-4 py-2 text-[13px] font-medium"
            style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
          >
            {!running && <RefreshCw aria-hidden="true" />}
            {running ? "取消" : "重新生成"}
          </button>
          <ExportMenu iframeRef={iframeRef} html={html} assets={assets} />
        </div>
      </header>

      <div className="render-body flex min-h-0 flex-1">
        <div className="render-stage min-h-0 min-w-0 flex-1 px-6 pb-6">
          {html ? (
            <ScaledDocument
              iframeRef={iframeRef}
              onLoad={enableDeckGestures}
              srcDoc={display}
              authoredWidth={authoredWidth}
              scale={zoom}
              title="成品预览"
              className="render-document h-full w-full"
            />
          ) : (
            <div
              className="render-empty grid h-full place-items-center rounded-2xl text-[13px] text-[var(--ink-faint)]"
              style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
            >
              {running ? "agent 正在写…" : status === "error" ? error : "还没有内容"}
            </div>
          )}
        </div>
        <CaptionPane />
      </div>
    </div>
  );
}

/** Preset zoom levels. 50% shows a whole 1080x1440 card in a typical pane. */
const ZOOMS = [0.35, 0.5, 0.75, 1] as const;

function ZoomControl({ value, onChange }: { value: number; onChange: (z: number) => void }) {
  return (
    <div
      className="zoom-control flex items-center overflow-hidden rounded-xl"
      style={{ border: "1px solid var(--line-soft)", background: "var(--surface)" }}
      role="group"
      aria-label="预览缩放"
    >
      {ZOOMS.map((z) => {
        const on = Math.abs(value - z) < 0.01;
        return (
          <button
            key={z}
            type="button"
            onClick={() => onChange(z)}
            aria-pressed={on}
            className={`segmented-option px-2.5 py-2 text-[12px] transition-colors${on ? " is-active" : ""}`}
            style={{
              background: on ? "var(--coral)" : "transparent",
              color: on ? "#fff" : "var(--ink-mute)",
            }}
          >
            {Math.round(z * 100)}%
          </button>
        );
      })}
    </div>
  );
}
