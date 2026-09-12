"use client";

import { useCallback, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { useTask, useXhs } from "@/lib/xhs/store";
import { useFlow } from "@/lib/xhs/use-flow";
import { detectFormat } from "@/lib/parsers/auto";
import { parseFile } from "@/lib/parsers/file";
import { clampPageCount, MAX_PAGES, MIN_PAGES } from "@/lib/xhs/types";
import { TemplateGallery } from "./template-gallery";


export function StepSource() {
  const sourceText = useTask((t) => t.sourceText);
  const setSourceText = useXhs((s) => s.setSourceText);
  const setFormat = useXhs((s) => s.setFormat);
  const pageCount = useTask((t) => t.pageCount);
  const setPageCount = useXhs((s) => s.setPageCount);
  const templateId = useTask((t) => t.templateId);
  const setTemplateId = useXhs((s) => s.setTemplateId);
  const handle = useTask((t) => t.handle);
  const setHandle = useXhs((s) => s.setHandle);
  const status = useTask((t) => t.outlineStatus);
  const error = useTask((t) => t.outlineError);
  const { runOutline, cancel } = useFlow();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onText = useCallback(
    (t: string) => {
      setSourceText(t);
      setFormat(detectFormat(t));
    },
    [setSourceText, setFormat],
  );

  const ingest = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const parts: string[] = [];
      for (const f of Array.from(files)) {
        try {
          const parsed = await parseFile(f);
          // Images belong to individual cards (step ②), not the source blob.
          if (parsed.format !== "image") parts.push(parsed.text);
        } catch {
          // A single unreadable file shouldn't discard the rest of the batch.
        }
      }
      if (parts.length) {
        const next = [sourceText, ...parts].filter(Boolean).join("\n\n");
        onText(next);
      }
    },
    [sourceText, onText],
  );

  const running = status === "running";
  const chars = sourceText.trim().length;

  return (
    <div className="source-step mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <section className="content-card">
        <h2 className="mb-1 text-[15px] font-semibold text-[var(--ink)]">你的文章</h2>
        <p className="mb-3 text-[13px] text-[var(--ink-faint)]">
          支持 Markdown / 纯文本 / CSV / JSON。也可以直接拖文件进来。
        </p>
        <textarea
          value={sourceText}
          onChange={(e) => onText(e.target.value)}
          onDrop={(e) => {
            e.preventDefault();
            void ingest(e.dataTransfer.files);
          }}
          onDragOver={(e) => e.preventDefault()}
          placeholder="把文章粘贴到这里…"
          spellCheck={false}
          className="milky-input h-64 w-full resize-y rounded-xl p-4 text-[14px] leading-relaxed text-[var(--ink)] outline-none"
          style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
        />
        <div className="mt-2 flex items-center justify-between text-[12px] text-[var(--ink-faint)]">
          <span>{chars.toLocaleString()} 字</span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="quiet-link underline underline-offset-2 hover:text-[var(--ink)]"
          >
            选择文件…
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              void ingest(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </section>

      <section className="content-card">
        <h2 className="mb-1 text-[15px] font-semibold text-[var(--ink)]">出几张图</h2>
        <p className="mb-3 text-[13px] text-[var(--ink-faint)]">
          封面和结尾都算在内。选「自动」时，如果你的文案里写了张数（比如「4 张图讲清楚…」），会按你写的来。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPageCount("auto")}
            aria-pressed={pageCount === "auto"}
            className="choice-pill rounded-full px-4 py-1.5 text-[13px] transition-colors"
            style={{
              background: pageCount === "auto" ? "var(--coral)" : "var(--surface)",
              color: pageCount === "auto" ? "#fff" : "var(--ink)",
              border: `1px solid ${pageCount === "auto" ? "var(--coral)" : "var(--line-soft)"}`,
            }}
          >
            自动
          </button>
          {[4, 6, 9].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPageCount(n)}
              aria-pressed={pageCount === n}
              className="choice-pill rounded-full px-4 py-1.5 text-[13px] transition-colors"
              style={{
                background: pageCount === n ? "var(--coral)" : "var(--surface)",
                color: pageCount === n ? "#fff" : "var(--ink)",
                border: `1px solid ${pageCount === n ? "var(--coral)" : "var(--line-soft)"}`,
              }}
            >
              {n} 张
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-[13px] text-[var(--ink-mute)]">
            或
            <input
              type="number"
              min={MIN_PAGES}
              max={MAX_PAGES}
              value={typeof pageCount === "number" ? pageCount : ""}
              placeholder="自定"
              onChange={(e) => {
                const v = e.target.value.trim();
                setPageCount(v === "" ? "auto" : clampPageCount(Number(v)));
              }}
              className="milky-input w-16 rounded-lg px-2 py-1 text-[13px] outline-none"
              style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
            />
            张
          </label>
        </div>
      </section>

      <section className="content-card">
        <h2 className="mb-1 text-[15px] font-semibold text-[var(--ink)]">你的小红书号</h2>
        <p className="mb-3 text-[13px] text-[var(--ink-faint)]">
          会印在每张卡的页脚水印上，原样使用。留空也不会瞎编一个 —— 那个位置改放内容关键词。
        </p>
        <div
          className="milky-input-group flex w-full max-w-sm items-center rounded-xl px-3 py-2"
          style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
        >
          <span className="select-none pr-0.5 text-[14px] text-[var(--ink-faint)]">@</span>
          <input
            value={handle}
            // Strip a pasted "@" so the prefix is never doubled up.
            onChange={(e) => setHandle(e.target.value.replace(/^@+/, ""))}
            placeholder="不填也可以"
            spellCheck={false}
            maxLength={40}
            className="w-full bg-transparent text-[14px] text-[var(--ink)] outline-none"
          />
        </div>
      </section>

      <section className="content-card">
        <h2 className="mb-1 text-[15px] font-semibold text-[var(--ink)]">视觉模板</h2>
        <p className="mb-3 text-[13px] text-[var(--ink-faint)]">
          缩略图就是这套模板的真实效果。选中后右边会完整展开，也可以点「看大图」看全屏。
        </p>
        <TemplateGallery value={templateId} onChange={setTemplateId} />
      </section>

      {error && (
        <p
          className="status-note status-error rounded-xl p-3 text-[13px]"
          style={{ background: "rgba(156,42,37,0.08)", color: "var(--red)" }}
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!chars || running}
          onClick={() => (running ? cancel() : void runOutline())}
          className="primary-button rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ background: "var(--coral)" }}
        >
          {running ? "正在拆页…" : <>拆成分页 <ArrowRight aria-hidden="true" /></>}
        </button>
        {running && (
          <button
            type="button"
            onClick={() => cancel()}
            className="quiet-link text-[13px] text-[var(--ink-faint)] underline underline-offset-2"
          >
            取消
          </button>
        )}
      </div>
    </div>
  );
}
