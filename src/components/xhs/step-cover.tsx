"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTask, useXhs } from "@/lib/xhs/store";
import { useFlow } from "@/lib/xhs/use-flow";
import { previewHtml } from "@/lib/extract-html";
import { useElementSize } from "@/lib/xhs/use-element-size";
import { DEFAULT_VIEWPORT } from "@/lib/xhs/aspect";
import { cardFitTransform, measureCard, type CardBox } from "@/lib/xhs/measure-card";
import type { CoverCandidate } from "@/lib/xhs/types";
import { COVER_DIRECTION_IDS, coverLabel } from "@/lib/xhs/cover-directions";



export function StepCover() {
  const covers = useTask((t) => t.covers);
  const selectedCoverId = useTask((t) => t.selectedCoverId);
  const selectCover = useXhs((s) => s.selectCover);
  const setStep = useXhs((s) => s.setStep);
  const cover = useTask((t) => t.pages[0]);
  const { runCovers, cancelCover, cancel } = useFlow();

  const running = covers.some((c) => c.status === "running");

  // Kick off the first batch automatically — the user already committed to
  // this step by navigating here, so an extra "generate" click is friction.
  //
  // `started` guards React StrictMode's double-mount in dev, the same way
  // step ④ does. Without it the effect fired twice, the second `runCovers`
  // aborted the first one's three controllers, and all three tiles ended up
  // stuck on 「已取消」 while their replacements were still streaming.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || covers.length > 0 || !cover) return;
    started.current = true;
    void runCovers(COVER_DIRECTION_IDS);
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
              onClick={() => cancel()}
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
              全部重新生成
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
            onRegenerate={() => void runCovers([c.id])}
            onCancel={() => cancelCover(c.id)}
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
  onRegenerate,
  onCancel,
}: {
  cover: CoverCandidate;
  selected: boolean;
  onSelect: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
}) {
  const ready = cover.status === "done";
  const busy = cover.status === "running";
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
          <ScaledCover html={cover.html} label={cover.label} />
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
        <span className="mr-auto shrink-0 font-medium text-[var(--ink)]">{cover.label}</span>
        {cover.status === "error" && (
          <span className="truncate text-[12px]" style={{ color: "var(--red)" }}>
            {cover.error}
          </span>
        )}
        {cover.html && <CopyHtmlButton html={cover.html} />}
        <button
          type="button"
          onClick={busy ? onCancel : onRegenerate}
          className="shrink-0 rounded-lg px-2.5 py-1 text-[12px] text-[var(--ink-mute)] transition-colors hover:text-[var(--ink)]"
          style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
        >
          {busy ? "取消" : "只重生成这版"}
        </button>
      </figcaption>
    </figure>
  );
}

/**
 * A cover candidate, scaled so the *card* fills the tile.
 *
 * The scale used to be hard-coded at 0.28, then derived from a nominal
 * 1080×1440 viewport. Both assume the document is nothing but the card. That
 * broke once the agent started copying the example's gallery shell
 * (`body{padding:36px 0}`, a `.deck` wrapper, rounded corners and a drop
 * shadow) around its single cover: the tile scaled the shell, so the card
 * rendered small and inset with dead space around it.
 *
 * So measure the card in the loaded document and fit that instead. Correct for
 * a bare card, for one wrapped in a shell, and for one authored at some other
 * size — the preview no longer has to know which it got.
 */
function ScaledCover({ html, label }: { html: string; label: string }) {
  const assets = useTask((t) => t.assets);
  const { ref, size } = useElementSize<HTMLDivElement>();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [card, setCard] = useState<CardBox | null>(null);

  const remeasure = useCallback(() => {
    const box = measureCard(frameRef.current);
    // Keep the last good box on a failed read — a transient null would make the
    // tile jump to blank and back.
    if (box) setCard(box);
  }, []);

  // Web fonts land after `load` and can change the card's height, so measure
  // again once they settle.
  const onLoad = useCallback(() => {
    remeasure();
    const doc = frameRef.current?.contentDocument;
    doc?.fonts?.ready.then(remeasure).catch(() => {});
  }, [remeasure]);

  // The document is replaced on every re-render of the stream, so re-measure
  // as new markup arrives rather than only once.
  useEffect(() => {
    const t = setTimeout(remeasure, 120);
    return () => clearTimeout(t);
  }, [html, remeasure]);

  // Lay the document out at the width cards are authored for; only the display
  // size is scaled, so the card's own layout never changes.
  const layoutWidth = DEFAULT_VIEWPORT.width;
  const box = card ?? { x: 0, y: 0, ...DEFAULT_VIEWPORT };
  const fit = size ? cardFitTransform(box, size) : { scale: 0, x: 0, y: 0 };

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden">
      {fit.scale > 0 && (
        <iframe
          ref={frameRef}
          title={`封面预览 · ${label}`}
          srcDoc={previewHtml(html, assets)}
          sandbox="allow-scripts allow-same-origin"
          scrolling="no"
          onLoad={onLoad}
          className="absolute left-0 top-0 origin-top-left border-0"
          style={{
            width: layoutWidth,
            // Tall enough that a shell with page padding is not clipped before
            // it can be measured.
            height: Math.max(DEFAULT_VIEWPORT.height, box.y + box.height) + 200,
            transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

/**
 * Hand the raw generated HTML to the clipboard.
 *
 * When a card comes out wrong, a screenshot only shows the symptom — whether
 * the type is small because the agent wrote a small font-size, or because a
 * declaration silently failed to apply, is not visible in a picture. This is
 * the difference between diagnosing the defect and guessing at it.
 */
function CopyHtmlButton({ html }: { html: string }) {
  const assets = useTask((t) => t.assets);
  const [done, setDone] = useState(false);

  const copy = useCallback(async () => {
    const text = previewHtml(html, assets);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API needs a secure context; http://localhost is not one in
      // every browser, so fall back to the old selection-based copy.
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
    setTimeout(() => setDone(false), 1500);
  }, [html, assets]);

  return (
    <button
      type="button"
      onClick={copy}
      title="复制这版的原始 HTML，排版出问题时可以直接发给别人看"
      className="shrink-0 rounded-lg px-2.5 py-1 text-[12px] text-[var(--ink-mute)] transition-colors hover:text-[var(--ink)]"
      style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
    >
      {done ? "已复制" : "复制 HTML"}
    </button>
  );
}
