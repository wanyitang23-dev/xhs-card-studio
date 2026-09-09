"use client";

import { useEffect } from "react";
import { useXhs } from "@/lib/xhs/store";
import { useFlow } from "@/lib/xhs/use-flow";
import { previewHtml } from "@/lib/extract-html";
import type { CoverCandidate } from "@/lib/xhs/types";
import { COVER_DIRECTION_IDS, coverLabel } from "@/lib/xhs/cover-directions";



export function StepCover() {
  const covers = useXhs((s) => s.covers);
  const selectedCoverId = useXhs((s) => s.selectedCoverId);
  const selectCover = useXhs((s) => s.selectCover);
  const setStep = useXhs((s) => s.setStep);
  const cover = useXhs((s) => s.pages[0]);
  const { runCovers, cancel } = useFlow();

  const running = covers.some((c) => c.status === "running");

  // Kick off the first batch automatically — the user already committed to
  // this step by navigating here, so an extra "generate" click is friction.
  useEffect(() => {
    if (covers.length === 0 && cover) void runCovers(COVER_DIRECTION_IDS);
    // Intentionally once-on-mount: re-running on every covers change would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
      <header className="flex items-center gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--ink)]">三版封面，挑一个</h2>
          <p className="mt-1 text-[13px] text-[var(--ink-faint)]">
            文案都是「{cover?.title || "（未设置标题）"}」，只有构图不同。选中的那版会定下整套图的视觉风格。
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {running ? (
            <button
              type="button"
              onClick={cancel}
              className="text-[13px] text-[var(--ink-faint)] underline underline-offset-2"
            >
              取消
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void runCovers(COVER_DIRECTION_IDS)}
              className="rounded-xl px-4 py-2 text-[13px] font-medium"
              style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
            >
              重新生成三版
            </button>
          )}
          <button
            type="button"
            disabled={!selectedCoverId}
            onClick={() => setStep("render")}
            className="rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ background: "var(--coral)" }}
          >
            用这版出成品 →
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {(covers.length ? covers : COVER_DIRECTION_IDS.map(placeholder)).map((c) => (
          <CoverTile
            key={c.id}
            cover={c}
            selected={c.id === selectedCoverId}
            onSelect={() => c.status === "done" && selectCover(c.id)}
          />
        ))}
      </div>
    </div>
  );
}

function placeholder(id: string): CoverCandidate {
  return { id, label: coverLabel(id), html: "", status: "pending" };
}

function CoverTile({
  cover,
  selected,
  onSelect,
}: {
  cover: CoverCandidate;
  selected: boolean;
  onSelect: () => void;
}) {
  const ready = cover.status === "done";
  return (
    <figure className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onSelect}
        disabled={!ready}
        aria-pressed={selected}
        className="relative block overflow-hidden rounded-2xl transition-all disabled:cursor-default"
        style={{
          border: `2px solid ${selected ? "var(--coral)" : "var(--line-soft)"}`,
          boxShadow: selected ? "0 12px 32px -18px var(--coral)" : "none",
          aspectRatio: "3 / 4",
          background: "var(--surface)",
        }}
      >
        {cover.html ? (
          <iframe
            title={`封面预览 · ${cover.label}`}
            srcDoc={previewHtml(cover.html)}
            sandbox="allow-scripts allow-same-origin"
            // The card is authored at 1080px wide; scale it down to the tile
            // instead of letting the iframe scroll.
            className="pointer-events-none origin-top-left border-0"
            style={{ width: "1080px", height: "1440px", transform: "scale(0.28)" }}
          />
        ) : (
          <span className="grid h-full place-items-center text-[13px] text-[var(--ink-faint)]">
            {cover.status === "error" ? "生成失败" : "正在生成…"}
          </span>
        )}
        {selected && (
          <span
            className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-[13px] text-white"
            style={{ background: "var(--coral)" }}
          >
            ✓
          </span>
        )}
      </button>
      <figcaption className="flex items-center gap-2 text-[13px]">
        <span className="font-medium text-[var(--ink)]">{cover.label}</span>
        {cover.status === "error" && (
          <span className="truncate text-[12px]" style={{ color: "var(--red)" }}>
            {cover.error}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
