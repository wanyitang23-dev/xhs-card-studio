"use client";

import { useCallback, useRef } from "react";
import { useTask, useXhs } from "@/lib/xhs/store";
import { useFlow } from "@/lib/xhs/use-flow";
import { parseFile } from "@/lib/parsers/file";
import { RECOMMENDED_MAX_PAGES, MAX_PAGES, type XhsPage } from "@/lib/xhs/types";
import { prepareImage } from "@/lib/xhs/image";

const KIND_LABEL = { cover: "封面", content: "正文", ending: "结尾" } as const;

export function StepOutline() {
  const pages = useTask((t) => t.pages);
  const requestedPages = useTask((t) => t.requestedPages);
  const setStep = useXhs((s) => s.setStep);
  const allConfirmed = pages.length > 0 && pages.every((p) => p.confirmed);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <header>
        <h2 className="text-[15px] font-semibold text-[var(--ink)]">
          分页清单 · 共 {pages.length} 页
        </h2>
        <p className="mt-1 text-[13px] text-[var(--ink-faint)]">
          每页的文字在这里定稿，下一步生成时一个字都不会被改。
          {pages.length > RECOMMENDED_MAX_PAGES && (
            <span style={{ color: "var(--amber)" }}>
              {" "}
              超过 {RECOMMENDED_MAX_PAGES} 页了，小红书上通常 {RECOMMENDED_MAX_PAGES} 页以内阅读完成率更高。
            </span>
          )}
        </p>
        {requestedPages !== null && requestedPages !== pages.length && (
          <p
            className="mt-2 rounded-xl px-3 py-2 text-[13px]"
            style={{ background: "rgba(178,98,0,0.08)", color: "var(--amber)" }}
          >
            你要求 {requestedPages} 页，agent 给了 {pages.length} 页。可以直接用下面的 ＋ / × 增删，或者回上一步重新生成。
          </p>
        )}
      </header>

      <ol className="flex flex-col gap-3">
        {pages.map((p, i) => (
          <PageCard key={p.id} page={p} index={i} total={pages.length} />
        ))}
      </ol>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          disabled={!allConfirmed}
          onClick={() => setStep("cover")}
          className="rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ background: "var(--coral)" }}
        >
          去挑封面 →
        </button>
        <ConfirmAll />
        {!allConfirmed && (
          <span className="text-[13px] text-[var(--ink-faint)]">
            还有 {pages.filter((p) => !p.confirmed).length} 页没确认
          </span>
        )}
      </div>
    </div>
  );
}

function ConfirmAll() {
  const pages = useTask((t) => t.pages);
  const setPages = useXhs((s) => s.setPages);
  const allConfirmed = pages.every((p) => p.confirmed);
  return (
    <button
      type="button"
      onClick={() => setPages(pages.map((p) => ({ ...p, confirmed: !allConfirmed })))}
      className="text-[13px] text-[var(--ink-mute)] underline underline-offset-2"
    >
      {allConfirmed ? "全部取消确认" : "全部确认"}
    </button>
  );
}

function PageCard({ page, index, total }: { page: XhsPage; index: number; total: number }) {
  const patchPage = useXhs((s) => s.patchPage);
  const addPageAfter = useXhs((s) => s.addPageAfter);
  const removePage = useXhs((s) => s.removePage);
  const movePage = useXhs((s) => s.movePage);
  const addAsset = useXhs((s) => s.addAsset);
  const assets = useTask((t) => t.assets);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const attach = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const added: string[] = [];
      for (const f of Array.from(files)) {
        try {
          const parsed = await parseFile(f);
          // Bound it before it reaches the store: these are persisted now, and
          // a raw phone screenshot is several megabytes of base64. The size is
          // kept alongside so the agent is told the aspect ratio rather than
          // guessing at a picture it never sees.
          if (parsed.format === "image" && parsed.dataUrl) {
            const { dataUrl, size } = await prepareImage(parsed.dataUrl);
            added.push(addAsset(dataUrl, size ?? undefined));
          }
        } catch {
          // skip unreadable files; the rest of the batch still lands
        }
      }
      if (added.length) {
        patchPage(page.id, { imageAssetIds: [...page.imageAssetIds, ...added] });
      }
    },
    [addAsset, patchPage, page.id, page.imageAssetIds],
  );

  return (
    <li
      className="rounded-xl p-4"
      style={{
        background: "var(--surface)",
        border: `1px solid ${page.confirmed ? "var(--green)" : "var(--line-soft)"}`,
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: "var(--line-faint)", color: "var(--ink-mute)" }}
        >
          {index + 1} / {total} · {KIND_LABEL[page.kind]}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <IconBtn label="上移" disabled={index === 0} onClick={() => movePage(page.id, -1)}>
            ↑
          </IconBtn>
          <IconBtn
            label="下移"
            disabled={index === total - 1}
            onClick={() => movePage(page.id, 1)}
          >
            ↓
          </IconBtn>
          <IconBtn
            label="在后面插入一页"
            disabled={total >= MAX_PAGES}
            onClick={() => addPageAfter(page.id)}
          >
            ＋
          </IconBtn>
          <IconBtn label="删除这一页" disabled={total <= 2} onClick={() => removePage(page.id)}>
            ×
          </IconBtn>
        </div>
      </div>

      <input
        value={page.title}
        onChange={(e) => patchPage(page.id, { title: e.target.value, confirmed: false })}
        placeholder="卡片大标题"
        className="w-full bg-transparent text-[16px] font-semibold text-[var(--ink)] outline-none"
      />
      <textarea
        value={page.body}
        onChange={(e) => patchPage(page.id, { body: e.target.value, confirmed: false })}
        placeholder="正文（可留空）"
        /* Bodies used to be capped at 60 characters, so two rows showed a whole
           one. A long source now yields 120-220 characters across a few lines;
           two rows turned that into a scrollbar the user had to fight to edit. */
        rows={5}
        className="mt-2 w-full resize-y bg-transparent text-[13px] leading-relaxed text-[var(--ink-mute)] outline-none"
      />

      {page.imageAssetIds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {page.imageAssetIds.map((a) => (
            <span key={a} className="relative">
              {assets[a] ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={assets[a]}
                  alt="配图"
                  className="h-16 w-16 rounded-lg object-cover"
                  style={{ border: "1px solid var(--line-soft)" }}
                />
              ) : (
                /* The bytes are gone (an old task saved before uploads were
                   persisted, or a storage eviction). Say so here rather than
                   letting it surface as a broken tag in the finished card. */
                <span
                  title="这张配图的数据已丢失，请重新上传"
                  className="grid h-16 w-16 place-items-center rounded-lg text-center text-[10px] leading-tight"
                  style={{
                    border: "1px dashed var(--line-soft)",
                    color: "var(--amber)",
                    background: "rgba(178,98,0,0.06)",
                  }}
                >
                  图片
                  <br />
                  已丢失
                </span>
              )}
              <button
                type="button"
                aria-label="移除这张配图"
                onClick={() =>
                  patchPage(page.id, {
                    imageAssetIds: page.imageAssetIds.filter((x) => x !== a),
                    confirmed: false,
                  })
                }
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full text-[11px] text-white"
                style={{ background: "var(--ink)" }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="text-[12px] text-[var(--ink-mute)] underline underline-offset-2"
        >
          + 传配图
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void attach(e.target.files);
            e.target.value = "";
          }}
        />
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[13px] text-[var(--ink-mute)]">
          <input
            type="checkbox"
            checked={page.confirmed}
            onChange={(e) => patchPage(page.id, { confirmed: e.target.checked })}
          />
          确认这一页
        </label>
      </div>
    </li>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-6 w-6 place-items-center rounded-md text-[13px] text-[var(--ink-mute)] transition-colors hover:bg-[var(--line-faint)] disabled:opacity-25"
    >
      {children}
    </button>
  );
}
