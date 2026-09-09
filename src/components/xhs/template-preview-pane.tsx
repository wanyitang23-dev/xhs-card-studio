"use client";

import { useTemplates } from "@/lib/templates";
import { parseViewport, aspectBadge, parsePageCount } from "@/lib/xhs/aspect";
import { ScaledDocument } from "./scaled-document";

/**
 * The always-on right-hand column for steps ① and ②: a live, full-height
 * rendering of whichever template is currently selected.
 *
 * It lives in the page shell rather than inside either step so that moving
 * between "贴文章" and "定分页" doesn't unmount the iframe — the preview would
 * otherwise reload and flash white on every step change.
 *
 * The document is rendered at its authored width and scaled to fit, the same
 * way the zoom modal does it, so a 1080px card is legible in a ~420px column
 * without being re-laid-out at the wrong width.
 */
export function TemplatePreviewPane({
  templateId,
  collapsed,
  onToggle,
}: {
  templateId: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const templates = useTemplates();
  const tpl = templates?.find((t) => t.id === templateId);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="展开模板预览"
        className="hidden w-10 shrink-0 flex-col items-center gap-2 py-4 text-[12px] text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)] lg:flex"
        style={{ borderLeft: "1px solid var(--line-faint)", background: "var(--surface)" }}
      >
        <span aria-hidden>‹</span>
        <span style={{ writingMode: "vertical-rl" }}>模板预览</span>
      </button>
    );
  }

  return (
    <aside
      className="hidden min-h-0 w-[38%] min-w-[340px] max-w-[560px] shrink-0 flex-col lg:flex"
      style={{ borderLeft: "1px solid var(--line-faint)", background: "var(--surface)" }}
    >
      <header
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ borderBottom: "1px solid var(--line-faint)" }}
      >
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[var(--ink)]">
            {tpl ? `${tpl.emoji} ${tpl.zhName}` : "模板预览"}
          </p>
          <p className="truncate text-[11.5px] text-[var(--ink-faint)]">
            {tpl
              ? `${aspectBadge(tpl.aspectHint)}${
                  parsePageCount(tpl.aspectHint) ? ` · ${parsePageCount(tpl.aspectHint)} 页` : ""
                } · 示例效果，你的内容会套用同一套视觉`
              : "在左边选一个模板"}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label="收起模板预览"
          title="收起"
          className="ml-auto shrink-0 rounded-md px-1.5 text-[16px] text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
        >
          ›
        </button>
      </header>

      {tpl?.example?.hasHtml ? (
        <div className="flex min-h-0 flex-1 p-3">
          <ScaledDocument
            // Keyed so switching templates gets a fresh iframe rather than
            // navigating the existing one, which would keep the old scroll offset.
            key={tpl.id}
            authoredWidth={parseViewport(tpl.aspectHint).width}
            src={`/api/templates/${encodeURIComponent(tpl.id)}/preview`}
            title={`${tpl.zhName} 预览`}
            className="min-h-0 w-full flex-1 rounded-xl"
            style={{ background: "#fff", border: "1px solid var(--line-faint)" }}
          />
        </div>
      ) : (
        <p className="grid flex-1 place-items-center px-6 text-center text-[13px] text-[var(--ink-faint)]">
          {tpl ? "这个模板没有示例页面可以预览。" : "选中模板后，这里会显示它的真实效果。"}
        </p>
      )}
    </aside>
  );
}
