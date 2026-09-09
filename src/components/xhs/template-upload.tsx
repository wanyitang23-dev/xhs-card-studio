"use client";

import { useCallback, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { refreshTemplates } from "@/lib/templates";
import { useXhs } from "@/lib/xhs/store";
import { streamSse } from "@/lib/xhs/sse-client";

/**
 * Upload a page you like and turn it into a reusable template.
 *
 * Two paths: paste the style rules yourself, or hand the HTML to the agent and
 * let it write them (`/api/templates/derive`). The second is the point — most
 * users have a card they like, not a spec they can write.
 */
export function TemplateUpload({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [html, setHtml] = useState("");
  const [rules, setRules] = useState("");
  const [busy, setBusy] = useState<"idle" | "deriving" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const setTemplateId = useXhs((s) => s.setTemplateId);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const readFile = useCallback(async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setHtml(await f.text());
    setName((n) => n || f.name.replace(/\.html?$/i, ""));
  }, []);

  const derive = useCallback(async () => {
    const agent = useStore.getState().selectedAgent;
    if (!agent) return setError("请先在顶部选择一个 agent");
    if (!html.trim()) return setError("请先提供参考 HTML");
    setError(null);
    setBusy("deriving");
    setRules("");
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      await streamSse(
        "/api/templates/derive",
        { agent, html },
        {
          onDelta: (t) => setRules((r) => r + t),
          onHtml: (t) => setRules(t),
          onError: (m) => setError(m),
        },
        ctl.signal,
      );
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setError((err as Error)?.message ?? String(err));
      }
    } finally {
      setBusy("idle");
    }
  }, [html]);

  const save = useCallback(async () => {
    setError(null);
    setBusy("saving");
    try {
      const res = await fetch("/api/templates/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, skillBody: rules, exampleHtml: html }),
      });
      const json = (await res.json()) as { skillId?: string; message?: string; error?: string };
      if (!res.ok) throw new Error(json.message ?? json.error ?? `HTTP ${res.status}`);
      await refreshTemplates();
      if (json.skillId) setTemplateId(json.skillId);
      onClose();
    } catch (err) {
      setError((err as Error)?.message ?? String(err));
    } finally {
      setBusy("idle");
    }
  }, [name, rules, html, setTemplateId, onClose]);

  const canSave = !!name.trim() && !!rules.trim() && !!html.trim() && busy === "idle";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(21,20,15,0.4)" }}>
      <div
        className="flex max-h-full w-full max-w-2xl flex-col gap-4 overflow-auto rounded-2xl p-6"
        style={{ background: "var(--paper)" }}
      >
        <header className="flex items-start gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-[var(--ink)]">上传我喜欢的模板</h2>
            <p className="mt-1 text-[13px] text-[var(--ink-faint)]">
              传一份你喜欢的 HTML，让 agent 读完它、反推出设计规格。之后就能用这套风格生成你自己的内容。
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

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-[var(--ink)]">模板名称</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：我的奶油橘卡片"
            className="rounded-xl px-3 py-2 text-[14px] outline-none"
            style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-[var(--ink)]">参考 HTML</span>
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder="把 HTML 粘贴进来，或选择一个 .html 文件"
            rows={4}
            spellCheck={false}
            className="rounded-xl px-3 py-2 font-mono text-[12px] outline-none"
            style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
          />
          <div className="flex items-center gap-3 text-[12px]">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-[var(--ink-mute)] underline underline-offset-2"
            >
              选择 .html 文件…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm,text/html"
              hidden
              onChange={(e) => {
                void readFile(e.target.files);
                e.target.value = "";
              }}
            />
            <span className="text-[var(--ink-faint)]">
              {html ? `${(html.length / 1024).toFixed(1)} KB` : "未提供"}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-medium text-[var(--ink)]">设计规格</span>
            <button
              type="button"
              onClick={() => (busy === "deriving" ? abortRef.current?.abort() : void derive())}
              disabled={!html.trim() || busy === "saving"}
              className="rounded-lg px-3 py-1 text-[12px] font-medium disabled:opacity-40"
              style={{ background: "var(--coral-soft)", color: "var(--coral-hover)" }}
            >
              {busy === "deriving" ? "取消" : "让 agent 从上面的 HTML 反推 →"}
            </button>
          </div>
          <textarea
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            placeholder="点上面的按钮自动生成，也可以自己写。这段就是发给 agent 的模板说明。"
            rows={10}
            className="rounded-xl px-3 py-2 text-[13px] leading-relaxed outline-none"
            style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
          />
        </div>

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
            disabled={!canSave}
            onClick={() => void save()}
            className="rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ background: "var(--coral)" }}
          >
            {busy === "saving" ? "保存中…" : "保存为模板"}
          </button>
          <button type="button" onClick={onClose} className="text-[13px] text-[var(--ink-mute)]">
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
