"use client";

import { useCallback, useState } from "react";
import { useXhs } from "@/lib/xhs/store";
import { useFlow } from "@/lib/xhs/use-flow";

/** Xiaohongshu truncates the title in the feed at roughly this length. */
const TITLE_LIMIT = 20;

/**
 * The text half of a Xiaohongshu post: what goes in the caption box beside the
 * uploaded images. Editable, and copyable field by field — the title and body
 * go into different inputs when posting, so one combined blob would just make
 * the user cut it apart again.
 */
export function CaptionPane() {
  const caption = useXhs((s) => s.caption);
  const status = useXhs((s) => s.captionStatus);
  const error = useXhs((s) => s.captionError);
  const patchCaption = useXhs((s) => s.patchCaption);
  const { runCaption } = useFlow();
  const running = status === "running";

  const tagText = caption ? caption.tags.map((t) => `#${t}`).join(" ") : "";
  const allText = caption ? `${caption.title}\n\n${caption.body}\n\n${tagText}` : "";

  return (
    <aside
      className="flex h-full min-h-0 w-[340px] shrink-0 flex-col gap-3 overflow-auto p-4"
      style={{ borderLeft: "1px solid var(--line-faint)" }}
    >
      <header className="flex items-center gap-2">
        <h3 className="text-[14px] font-semibold text-[var(--ink)]">发布文案</h3>
        <button
          type="button"
          onClick={() => void runCaption()}
          disabled={running}
          className="ml-auto rounded-lg px-2.5 py-1 text-[12px] disabled:opacity-40"
          style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
        >
          {running ? "生成中…" : caption ? "重写" : "生成"}
        </button>
      </header>

      {error && (
        <p
          className="rounded-lg p-2.5 text-[12px]"
          style={{ background: "rgba(156,42,37,0.08)", color: "var(--red)" }}
        >
          {error}
        </p>
      )}

      {!caption && !running && !error && (
        <p className="text-[12.5px] leading-relaxed text-[var(--ink-faint)]">
          根据你确认过的分页写一份标题、正文和标签，可以逐段复制，直接粘到小红书发布页。
        </p>
      )}

      {running && !caption && (
        <p className="text-[12.5px] text-[var(--ink-faint)]">agent 正在写…</p>
      )}

      {caption && (
        <>
          <Field
            label="标题"
            hint={`${caption.title.length} / ${TITLE_LIMIT} 字${caption.title.length > TITLE_LIMIT ? " · 偏长，信息流里会被截断" : ""}`}
            hintWarn={caption.title.length > TITLE_LIMIT}
            value={caption.title}
            rows={2}
            onChange={(title) => patchCaption({ title })}
          />
          <Field
            label="正文"
            hint={`${caption.body.length} 字`}
            value={caption.body}
            rows={14}
            onChange={(body) => patchCaption({ body })}
          />
          <Field
            label="标签"
            hint={`${caption.tags.length} 个`}
            value={tagText}
            rows={3}
            onChange={(v) =>
              patchCaption({
                tags: v
                  .split(/[\s,，]+/)
                  .map((t) => t.replace(/^#+/, "").trim())
                  .filter(Boolean),
              })
            }
          />
          <CopyButton
            text={allText}
            className="mt-1 w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white"
            style={{ background: "var(--coral)" }}
            label="复制全部"
          />
        </>
      )}
    </aside>
  );
}

function Field({
  label,
  hint,
  hintWarn,
  value,
  rows,
  onChange,
}: {
  label: string;
  hint: string;
  hintWarn?: boolean;
  value: string;
  rows: number;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[12.5px] font-medium text-[var(--ink)]">{label}</span>
        <span
          className="text-[11px]"
          style={{ color: hintWarn ? "var(--amber)" : "var(--ink-faint)" }}
        >
          {hint}
        </span>
        <CopyButton
          text={value}
          className="ml-auto rounded-md px-2 py-0.5 text-[11px] text-[var(--ink-mute)]"
          style={{ border: "1px solid var(--line-soft)" }}
          label="复制"
        />
      </div>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-lg px-3 py-2 text-[12.5px] leading-relaxed text-[var(--ink)] outline-none"
        style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
      />
    </div>
  );
}

function CopyButton({
  text,
  label,
  className,
  style,
}: {
  text: string;
  label: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [done, setDone] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API needs a secure context and can be blocked; fall back to
      // the legacy path so copying still works over plain http://localhost.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        ta.remove();
      }
    }
    setDone(true);
    setTimeout(() => setDone(false), 1400);
  }, [text]);

  return (
    <button type="button" onClick={() => void copy()} className={className} style={style}>
      {done ? "已复制 ✓" : label}
    </button>
  );
}
