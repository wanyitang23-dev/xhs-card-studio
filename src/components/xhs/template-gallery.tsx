"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useElementSize } from "@/lib/xhs/use-element-size";
import { ScaledDocument } from "./scaled-document";
import { useTemplates, type TemplateDef } from "@/lib/templates";
import { aspectBadge, parsePageCount, parseViewport } from "@/lib/xhs/aspect";

/**
 * Visual template picker: every template renders its own `example.html` as a
 * live, scaled-down thumbnail, so the user picks a look rather than a name.
 *
 * Thumbnails load through `/api/templates/[id]/preview` (an `<iframe src>`)
 * rather than `srcDoc`. The route already exists and sets `Cache-Control`, so
 * the browser caches each preview and re-selecting a template costs nothing —
 * and the HTML never has to travel through React state.
 */

export function TemplateGallery({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const templates = useTemplates();
  const [zoomed, setZoomed] = useState<TemplateDef | null>(null);

  if (templates === undefined) {
    return (
      <div className="@container">
        <div className="grid gap-3 @[26rem]:grid-cols-2 @[46rem]:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-2xl"
              style={{ aspectRatio: "3 / 4", background: "var(--line-faint)" }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <p className="text-[13px] text-[var(--ink-faint)]">
        没有可用的模板。用右上角「上传模板」加一个。
      </p>
    );
  }

  return (
    <>
      {/* Column count follows this pane's width, not the viewport's — the
          picker now shares the window with a permanent preview column. */}
      <div className="@container">
        <div className="grid gap-3 @[26rem]:grid-cols-2 @[46rem]:grid-cols-3">
          {templates.map((t) => (
            <TemplateTile
              key={t.id}
              tpl={t}
              selected={t.id === value}
              onSelect={() => onChange(t.id)}
              onZoom={() => setZoomed(t)}
            />
          ))}
        </div>
      </div>
      {zoomed && <ZoomModal tpl={zoomed} onClose={() => setZoomed(null)} />}
    </>
  );
}

function TemplateTile({
  tpl,
  selected,
  onSelect,
  onZoom,
}: {
  tpl: TemplateDef;
  selected: boolean;
  onSelect: () => void;
  onZoom: () => void;
}) {
  const hasPreview = !!tpl.example?.hasHtml;
  const ref = useRef<HTMLDivElement | null>(null);
  const visible = useNearViewport(ref);
  const pages = parsePageCount(tpl.aspectHint);

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`选择模板 ${tpl.zhName}`}
        className="group relative block w-full overflow-hidden rounded-2xl transition-shadow"
        style={{
          aspectRatio: "3 / 4",
          background: "var(--surface)",
          border: `2px solid ${selected ? "var(--coral)" : "var(--line-soft)"}`,
          boxShadow: selected ? "0 14px 34px -20px var(--coral)" : "none",
        }}
      >
        {hasPreview && visible ? (
          <ScaledPreview id={tpl.id} name={tpl.zhName} hint={tpl.aspectHint} />
        ) : (
          <span className="grid h-full place-items-center text-[28px]">{tpl.emoji}</span>
        )}

        <span
          className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: "rgba(21,20,15,0.6)", color: "#fff" }}
        >
          {aspectBadge(tpl.aspectHint)}
          {pages ? ` · ${pages} 页` : ""}
        </span>

        {selected && (
          <span
            className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-[13px] text-white"
            style={{ background: "var(--coral)" }}
          >
            ✓
          </span>
        )}

        {hasPreview && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onZoom();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onZoom();
              }
            }}
            className="absolute bottom-2 right-2 rounded-lg px-2 py-1 text-[11px] font-medium opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
            style={{ background: "rgba(21,20,15,0.75)", color: "#fff" }}
          >
            看大图
          </span>
        )}
      </button>

      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-[var(--ink)]">
          {tpl.emoji} {tpl.zhName}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-[var(--ink-faint)]">
          {tpl.description}
        </p>
      </div>
    </div>
  );
}

/**
 * Render the example at its authored pixel size, then scale it to fit the tile.
 *
 * Two reasons not to just size the iframe to the tile. The pages are laid out
 * for a fixed card width (and the decks read `100vw` / `100vh` directly), so a
 * small iframe box reflows them into a broken layout. And forcing every
 * template into the tile's 3:4 would lie to a 16:9 deck about its viewport.
 * So: render at the true viewport, scale by the smaller axis, and letterbox
 * whatever is left over.
 */
function ScaledPreview({ id, name, hint }: { id: string; name: string; hint: string }) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const vp = parseViewport(hint);
  // Contain: shrink by whichever axis runs out first, letterboxing the rest.
  const scale = size ? Math.min(size.width / vp.width, size.height / vp.height) : 0;

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden">
      {scale > 0 && (
        <iframe
          title={`${name} 预览`}
          src={`/api/templates/${encodeURIComponent(id)}/preview`}
          sandbox="allow-scripts allow-same-origin"
          loading="lazy"
          scrolling="no"
          className="absolute left-1/2 top-1/2 border-0"
          style={{
            width: vp.width,
            // Anchor the unscaled box's centre to the tile's centre, then
            // shrink about that same point. Flex/grid centring is unreliable
            // for an item far larger than its container; this is exact.
            transform: `translate(-50%, -50%) scale(${scale})`,
            height: vp.height,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

function ZoomModal({ tpl, onClose }: { tpl: TemplateDef; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col p-6"
      style={{ background: "rgba(21,20,15,0.55)" }}
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        style={{ background: "var(--paper)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--line-faint)" }}
        >
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-[var(--ink)]">
              {tpl.emoji} {tpl.zhName}
            </p>
            <p className="truncate text-[12px] text-[var(--ink-faint)]">
              {tpl.aspectHint} · 这是模板的示例效果，你的内容会套用同一套视觉
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="ml-auto text-[18px] text-[var(--ink-faint)]"
          >
            ×
          </button>
        </header>
        <ScaledDocument
          authoredWidth={parseViewport(tpl.aspectHint).width}
          src={`/api/templates/${encodeURIComponent(tpl.id)}/preview`}
          title={`${tpl.zhName} 完整预览`}
          className="min-h-0 flex-1"
          style={{ background: "#fff" }}
        />
      </div>
    </div>
  );
}

/**
 * True once the element is near the viewport, so offscreen tiles don't each
 * spawn an iframe on mount. Matters as the user's own uploads accumulate.
 */
function useNearViewport(ref: React.RefObject<HTMLElement | null>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true);
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}
