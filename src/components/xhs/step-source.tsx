"use client";

import { useCallback, useRef } from "react";
import { useXhs } from "@/lib/xhs/store";
import { useFlow } from "@/lib/xhs/use-flow";
import { detectFormat } from "@/lib/parsers/auto";
import { parseFile } from "@/lib/parsers/file";
import type { ContentMode } from "@/lib/xhs/types";
import { TemplateGallery } from "./template-gallery";

const MODES: Array<{ id: ContentMode; label: string; hint: string }> = [
  {
    id: "verbatim",
    label: "保留原文",
    hint: "沿用你的句子和措辞，一个要点都不丢。适合观点文、教程。",
  },
  {
    id: "condensed",
    label: "可视化精简",
    hint: "提炼成卡片短句，数字和对比做成视觉结构。适合干货、清单。",
  },
];

export function StepSource() {
  const sourceText = useXhs((s) => s.sourceText);
  const setSourceText = useXhs((s) => s.setSourceText);
  const setFormat = useXhs((s) => s.setFormat);
  const mode = useXhs((s) => s.mode);
  const setMode = useXhs((s) => s.setMode);
  const templateId = useXhs((s) => s.templateId);
  const setTemplateId = useXhs((s) => s.setTemplateId);
  const status = useXhs((s) => s.outlineStatus);
  const error = useXhs((s) => s.outlineError);
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <section>
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
          className="h-64 w-full resize-y rounded-xl p-4 text-[14px] leading-relaxed text-[var(--ink)] outline-none"
          style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
        />
        <div className="mt-2 flex items-center justify-between text-[12px] text-[var(--ink-faint)]">
          <span>{chars.toLocaleString()} 字</span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="underline underline-offset-2 hover:text-[var(--ink)]"
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

      <section>
        <h2 className="mb-3 text-[15px] font-semibold text-[var(--ink)]">表达方式</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODES.map((m) => {
            const on = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                aria-pressed={on}
                className="rounded-xl p-3 text-left transition-colors"
                style={{
                  background: on ? "var(--coral-soft)" : "var(--surface)",
                  border: `1px solid ${on ? "var(--coral)" : "var(--line-soft)"}`,
                }}
              >
                <span className="block text-[14px] font-semibold text-[var(--ink)]">{m.label}</span>
                <span className="mt-1 block text-[12px] leading-snug text-[var(--ink-mute)]">
                  {m.hint}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-[15px] font-semibold text-[var(--ink)]">视觉模板</h2>
        <p className="mb-3 text-[13px] text-[var(--ink-faint)]">
          缩略图就是这套模板的真实效果。点「看大图」可以完整浏览。
        </p>
        <TemplateGallery value={templateId} onChange={setTemplateId} />
      </section>

      {error && (
        <p
          className="rounded-xl p-3 text-[13px]"
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
          className="rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ background: "var(--coral)" }}
        >
          {running ? "正在拆页…" : "拆成分页 →"}
        </button>
        {running && (
          <button
            type="button"
            onClick={cancel}
            className="text-[13px] text-[var(--ink-faint)] underline underline-offset-2"
          >
            取消
          </button>
        )}
      </div>
    </div>
  );
}
