"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, LayoutTemplate, LoaderCircle, Maximize2, Trash2, X } from "lucide-react";
import { useElementSize } from "@/lib/xhs/use-element-size";
import { ScaledDocument } from "./scaled-document";
import { refreshTemplates, useTemplates, type TemplateDef } from "@/lib/templates";
import { parseViewport } from "@/lib/xhs/aspect";
import { localTemplateSlugFromSkillId } from "@/lib/templates/local-id";
import { DEFAULT_TEMPLATE, useXhs } from "@/lib/xhs/store";
import {
  readTemplateTitleAliases,
  subscribeTemplateTitleAliases,
  writeTemplateTitleAliases,
} from "@/lib/xhs/template-title-aliases";

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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [titleAliases, setTitleAliases] = useState<Record<string, string>>({});

  useEffect(() => {
    const sync = () => setTitleAliases(readTemplateTitleAliases());
    sync();
    return subscribeTemplateTitleAliases(sync);
  }, []);

  const renameTemplate = useCallback((id: string, canonicalName: string, nextName: string) => {
    const clean = nextName.trim();
    const next = { ...readTemplateTitleAliases() };
    if (!clean || clean === canonicalName) delete next[id];
    else next[id] = clean;
    writeTemplateTitleAliases(next);
  }, []);

  const deleteTemplate = useCallback(
    async (tpl: TemplateDef, displayName: string) => {
      if (!localTemplateSlugFromSkillId(tpl.id) || deletingId) return;
      if (!window.confirm(`确定删除上传的模板“${displayName}”吗？此操作无法撤销。`)) return;

      setDeletingId(tpl.id);
      setDeleteError("");
      try {
        const res = await fetch(`/api/templates/upload?id=${encodeURIComponent(tpl.id)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(body?.message || `删除失败（${res.status}）`);
        }

        const fresh = await refreshTemplates();
        const fallback = fresh.some((item) => item.id === DEFAULT_TEMPLATE)
          ? DEFAULT_TEMPLATE
          : fresh[0]?.id;
        if (fallback) {
          useXhs.getState().replaceTemplateId(tpl.id, fallback);
          if (value === tpl.id) onChange(fallback);
        }
        if (zoomed?.id === tpl.id) setZoomed(null);
        renameTemplate(tpl.id, tpl.zhName, "");
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : "删除模板失败，请重试");
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId, onChange, renameTemplate, value, zoomed?.id],
  );

  if (templates === undefined) {
    return (
      <div className="@container">
        <div className="grid gap-3 @[17rem]:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="skeleton-card animate-pulse rounded-2xl"
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
          picker shares the window with both the form column and a permanent
          preview column, so the viewport says little about the room here.
          Two is the cap, and the threshold is low on purpose: the picker sits
          in a deliberately narrow column (~20rem, so the article text gets the
          width), and two per row is what it still has to manage there. */}
      <div className="@container">
        <div className="grid gap-3 @[17rem]:grid-cols-2">
          {templates.map((t) => {
            const displayName = titleAliases[t.id] || t.zhName;
            return (
              <TemplateTile
                key={t.id}
                tpl={t}
                displayName={displayName}
                selected={t.id === value}
                onSelect={() => onChange(t.id)}
                onZoom={() => setZoomed({ ...t, zhName: displayName })}
                onRename={(nextName) => renameTemplate(t.id, t.zhName, nextName)}
                onDelete={
                  localTemplateSlugFromSkillId(t.id)
                    ? () => void deleteTemplate(t, displayName)
                    : undefined
                }
                deleting={deletingId === t.id}
              />
            );
          })}
        </div>
        {deleteError && (
          <p role="alert" className="mt-3 text-[12px] text-red-600">
            {deleteError}
          </p>
        )}
      </div>
      {zoomed && <ZoomModal tpl={zoomed} onClose={() => setZoomed(null)} />}
    </>
  );
}

function TemplateTile({
  tpl,
  displayName,
  selected,
  onSelect,
  onZoom,
  onRename,
  onDelete,
  deleting,
}: {
  tpl: TemplateDef;
  displayName: string;
  selected: boolean;
  onSelect: () => void;
  onZoom: () => void;
  onRename: (name: string) => void;
  onDelete?: () => void;
  deleting: boolean;
}) {
  const hasPreview = !!tpl.example?.hasHtml;
  const ref = useRef<HTMLDivElement | null>(null);
  const visible = useNearViewport(ref);

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`选择模板 ${displayName}`}
        className={`select-card template-tile group relative block w-full overflow-hidden rounded-2xl transition-shadow${selected ? " is-selected" : ""}`}
        style={{
          aspectRatio: "3 / 4",
          background: "var(--surface)",
          border: `2px solid ${selected ? "var(--coral)" : "var(--line-soft)"}`,
          boxShadow: selected ? "0 14px 34px -20px var(--coral)" : "none",
        }}
      >
        {hasPreview && visible ? (
          <ScaledPreview id={tpl.id} name={displayName} hint={tpl.aspectHint} />
        ) : (
          <span className="empty-state grid h-full place-items-center">
            <LayoutTemplate aria-hidden="true" className="h-7 w-7" />
          </span>
        )}

        {selected && (
          <span
            className="selection-mark absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-[13px] text-white"
            style={{ background: "var(--coral)" }}
          >
            <Check aria-hidden="true" />
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
            className="overlay-action absolute bottom-2 right-2 rounded-lg px-2 py-1 text-[11px] font-medium opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
            style={{ background: "rgba(21,20,15,0.75)", color: "#fff" }}
          >
            <Maximize2 aria-hidden="true" />
            看大图
          </span>
        )}
      </button>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <EditableTemplateTitle value={displayName} onSave={onRename} />
          {onDelete && (
            <button
              type="button"
              disabled={deleting}
              onClick={onDelete}
              aria-label={`删除上传的模板 ${displayName}`}
              className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
            >
              {deleting ? (
                <LoaderCircle aria-hidden="true" className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 aria-hidden="true" className="h-3 w-3" />
              )}
              {deleting ? "删除中" : "删除"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EditableTemplateTitle({ value, onSave }: { value: string; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    onSave(draft);
    setEditing(false);
  };

  const cancel = () => {
    cancelRef.current = true;
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <label className="flex min-w-0 flex-1 items-center gap-1.5">
        <LayoutTemplate aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[var(--ink-faint)]" />
        <span className="sr-only">模板标题</span>
        <input
          ref={inputRef}
          value={draft}
          maxLength={40}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (cancelRef.current) {
              cancelRef.current = false;
              return;
            }
            commit();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
          className="min-w-0 flex-1 rounded-md px-1.5 py-0.5 text-[13px] font-semibold outline-none"
          style={{ background: "var(--surface)", border: "1px solid var(--coral)" }}
        />
      </label>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        cancelRef.current = false;
        setEditing(true);
      }}
      title="点击修改模板标题"
      aria-label={`修改模板标题 ${value}`}
      className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[13px] font-semibold text-[var(--ink)]"
    >
      <LayoutTemplate aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[var(--ink-faint)]" />
      <span className="truncate underline-offset-2 hover:underline">{value}</span>
    </button>
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
      className="modal-backdrop fixed inset-0 z-50 flex flex-col p-6"
      style={{ background: "rgba(21,20,15,0.55)" }}
      onClick={onClose}
    >
      <div
        className="modal-shell template-modal mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        style={{ background: "var(--paper)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="modal-header flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--line-faint)" }}
        >
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-[14px] font-semibold text-[var(--ink)]">
              <LayoutTemplate aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--ink-faint)]" />
              {tpl.zhName}
            </p>
            <p className="truncate text-[12px] text-[var(--ink-faint)]">
              这是模板的示例效果，你的内容会套用同一套视觉
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="icon-control ml-auto text-[18px] text-[var(--ink-faint)]"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <ScaledDocument
          authoredWidth={parseViewport(tpl.aspectHint).width}
          src={`/api/templates/${encodeURIComponent(tpl.id)}/preview`}
          title={`${tpl.zhName} 完整预览`}
          className="preview-frame min-h-0 flex-1"
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
