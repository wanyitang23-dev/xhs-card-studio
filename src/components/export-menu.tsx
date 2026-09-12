"use client";

import { useMemo, useState, useRef, useEffect, type ReactNode } from "react";
import {
  AlignLeft,
  Bird,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  Code2,
  Download,
  FileImage,
  FileText,
  Images,
  MessageCircle,
  Presentation,
  Share2,
  XCircle,
} from "lucide-react";
import { useStore, selectActiveTask } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { copyToWechat } from "@/lib/export/wechat";
import { copyToZhihu } from "@/lib/export/zhihu";
import { copyHtml, copyText } from "@/lib/export/clipboard";
import {
  copyIframeToClipboard,
  downloadIframeAsImage,
} from "@/lib/export/image";
import { downloadHtml } from "@/lib/export/download";
import { extractHtml } from "@/lib/extract-html";
import { inlineAssets } from "@/lib/xhs/inline-assets";
import { parseDeck } from "@/lib/deck";
import {
  exportDeckPngZip,
  exportDeckPptx,
  exportDeckPrint,
} from "@/lib/export/deck";

type ExportMenuProps = {
  iframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  /**
   * HTML to export. Omit to fall back to the active task in the main store —
   * the four-step flow keeps its output in its own store and passes it here.
   */
  html?: string;
  /**
   * `asset:<id>` → data URL. The agent emits tokens, so a downloaded file must
   * have the real bytes put back in or it exports with placeholders.
   */
  assets?: Record<string, string>;
};

type Toast = { message: string; tone: "success" | "error" };
type ExportAction = { id: string; label: string; icon: ReactNode; fn: () => Promise<void> };

export function ExportMenu({ iframeRef, html: htmlProp, assets }: ExportMenuProps) {
  const storeHtml = useStore((s) => selectActiveTask(s)?.html ?? "");
  const html = htmlProp ?? storeHtml;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const t = useT();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (open && e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const showToast = (message: string, tone: Toast["tone"]) => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 2200);
  };

  const wrap =
    (label: string, fn: () => Promise<void>) =>
    async () => {
      setBusy(true);
      try {
        await fn();
        showToast(label, "success");
      } catch (e) {
        showToast(e instanceof Error ? e.message : t("export.error.generic"), "error");
      } finally {
        setBusy(false);
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };

  const cleanHtml = () => inlineAssets(extractHtml(html), assets);
  // Re-parse for the deck section. Cheap because parseDeck is regex-only and
  // the menu only opens on user click.
  const deck = useMemo(() => parseDeck(inlineAssets(extractHtml(html), assets)), [html, assets]);

  const sections: Array<{
    title: string;
    actions: ExportAction[];
  }> = [
    {
      title: t("export.section.platform"),
      actions: [
        { id: "wechat", label: t("export.action.wechat"), icon: <MessageCircle aria-hidden="true" />, fn: wrap(t("export.toast.wechat"), async () => { await copyToWechat(cleanHtml()); }) },
        { id: "zhihu",  label: t("export.action.zhihu"),  icon: <BookOpenText aria-hidden="true" />, fn: wrap(t("export.toast.zhihu"), async () => { await copyToZhihu(cleanHtml()); }) },
        { id: "twitter-img", label: t("export.action.twitterImg"), icon: <Bird aria-hidden="true" />, fn: wrap(t("export.toast.image"), async () => {
          if (!iframeRef.current) throw new Error(t("export.error.previewNotReady")); await copyIframeToClipboard(iframeRef.current);
        }) },
      ],
    },
    {
      title: t("export.section.raw"),
      actions: [
        { id: "html", label: t("export.action.html"), icon: <Code2 aria-hidden="true" />, fn: wrap(t("export.toast.html"), async () => { await copyHtml(cleanHtml()); }) },
        { id: "text", label: t("export.action.text"), icon: <AlignLeft aria-hidden="true" />,  fn: wrap(t("export.toast.text"), async () => {
          const tmp = document.createElement("div"); tmp.innerHTML = cleanHtml(); await copyText(tmp.textContent ?? "");
        }) },
      ],
    },
    {
      title: t("export.section.download"),
      actions: [
        { id: "download-html", label: t("export.action.downloadHtml"), icon: <Download aria-hidden="true" />, fn: wrap(t("export.toast.htmlSaved"), async () => { downloadHtml(cleanHtml()); }) },
        { id: "download-png",  label: t("export.action.downloadPng"),  icon: <FileImage aria-hidden="true" />, fn: wrap(t("export.toast.imgSaved"), async () => {
          if (!iframeRef.current) throw new Error(t("export.error.previewNotReady")); await downloadIframeAsImage(iframeRef.current);
        }) },
      ],
    },
    ...(deck.isDeck
      ? [
          {
            title: t("export.section.deck", { n: deck.slides.length }),
            actions: [
              {
                id: "deck-pdf",
                label: t("export.action.deckPdf"),
                icon: <FileText aria-hidden="true" />,
                fn: wrap(t("export.toast.deckPdf"), async () => {
                  exportDeckPrint(deck.slides, deck.title);
                }),
              },
              {
                id: "deck-png-zip",
                label: t("export.action.deckPngZip"),
                icon: <Images aria-hidden="true" />,
                fn: wrap(t("export.toast.deckPngZip"), async () => {
                  await exportDeckPngZip(deck.slides, deck.title);
                }),
              },
              {
                id: "deck-pptx",
                label: t("export.action.deckPptx"),
                icon: <Presentation aria-hidden="true" />,
                fn: wrap(t("export.toast.deckPptx"), async () => {
                  await exportDeckPptx(deck.slides, deck.title);
                }),
              },
            ],
          },
        ]
      : []),
  ];

  const disabled = !html || busy;

  return (
    <div className="export-menu relative" ref={ref}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="primary-button export-trigger btn-ink"
        aria-expanded={open}
        aria-controls="export-actions"
      >
        <Share2 aria-hidden="true" />
        {t("export.button")}
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div
          data-testid="export-menu"
          id="export-actions"
          className="menu-popover absolute right-0 z-30 mt-2 w-72 od-fade-in overflow-hidden rounded-2xl"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
            boxShadow: "0 30px 60px -20px rgba(21, 20, 15, 0.25)",
          }}
        >
          {sections.map((sec, sIdx) => (
            <div key={sec.title} style={sIdx ? { borderTop: "1px solid var(--line-faint)" } : undefined}>
              <div className="menu-label px-4 pt-3 pb-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                {sec.title}
              </div>
              <div className="px-1 pb-1">
                {sec.actions.map((a) => (
                  <button
                    key={a.id}
                    onClick={a.fn}
                    className="menu-item flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] hover:bg-[var(--paper)]"
                  >
                    <span className="menu-icon grid w-6 place-items-center">{a.icon}</span>
                    <span className="text-[var(--ink-soft)]">{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {toast && (
        <div
          className={`status-toast fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm shadow-lg od-fade-in ${toast.tone === "error" ? "is-error" : "is-success"}`}
          style={{ background: "var(--ink)", color: "var(--paper)" }}
          role={toast.tone === "error" ? "alert" : "status"}
          aria-live={toast.tone === "error" ? "assertive" : "polite"}
        >
          {toast.tone === "error" ? <XCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
