"use client";

import { useEffect, useMemo, useRef } from "react";
import { useXhs } from "@/lib/xhs/store";
import { useFlow } from "@/lib/xhs/use-flow";
import { previewHtml } from "@/lib/extract-html";
import { ExportMenu } from "@/components/export-menu";

export function StepRender() {
  const html = useXhs((s) => s.finalHtml);
  const status = useXhs((s) => s.renderStatus);
  const error = useXhs((s) => s.renderError);
  const pages = useXhs((s) => s.pages);
  const setStep = useXhs((s) => s.setStep);
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
          <iframe
            ref={iframeRef}
            title="成品预览"
            srcDoc={display}
            sandbox="allow-scripts allow-same-origin"
            className="h-full w-full rounded-2xl border-0"
            style={{ background: "#fff", border: "1px solid var(--line-soft)" }}
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
