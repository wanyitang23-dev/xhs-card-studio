"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowRight, FileCode2, ImageUp, Sparkles, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { startTemplateGeneration } from "@/lib/templates/background-generation";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
type SourceKind = "image" | "html";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

/** Queue an uploaded reference for background template generation. */
export function TemplateUpload({ onClose }: { onClose: () => void }) {
  const [sourceKind, setSourceKind] = useState<SourceKind>("image");
  const [name, setName] = useState("");
  const [html, setHtml] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [imageFileName, setImageFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const htmlFileRef = useRef<HTMLInputElement | null>(null);
  const imageFileRef = useRef<HTMLInputElement | null>(null);

  const readHtmlFile = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setHtml(await file.text());
    setName((current) => current || file.name.replace(/\.html?$/i, ""));
    setError(null);
  }, []);

  const readImageFile = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!/^image\/(?:png|jpeg|webp)$/i.test(file.type)) {
      setError("只支持 PNG、JPEG 或 WebP 图片");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("图片不能超过 10 MB");
      return;
    }
    try {
      setImageDataUrl(await fileToDataUrl(file));
      setImageFileName(file.name);
      setName((current) => current || file.name.replace(/\.(?:png|jpe?g|webp)$/i, ""));
      setError(null);
    } catch (err) {
      setError((err as Error)?.message ?? String(err));
    }
  }, []);

  const submit = useCallback(() => {
    const agent = useStore.getState().selectedAgent;
    const cleanName = name.trim();
    if (!agent) return setError("请先在顶部选择一个 agent");
    if (!cleanName) return setError("请填写模板名称");
    if (sourceKind === "image" && !imageDataUrl) return setError("请先上传一张风格图片");
    if (sourceKind === "html" && !html.trim()) return setError("请先提供参考 HTML");

    if (sourceKind === "image") {
      startTemplateGeneration({
        agent,
        name: cleanName,
        sourceKind,
        imageDataUrl,
        imageFileName,
      });
    } else {
      startTemplateGeneration({ agent, name: cleanName, sourceKind, html });
    }
    onClose();
  }, [html, imageDataUrl, imageFileName, name, onClose, sourceKind]);

  const canSubmit = !!name.trim() && !!(sourceKind === "image" ? imageDataUrl : html.trim());

  return (
    <div className="modal-backdrop fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(21,20,15,0.4)" }}>
      <div className="modal-shell upload-modal flex max-h-full w-full max-w-3xl flex-col gap-4 overflow-auto rounded-2xl p-6" style={{ background: "var(--paper)" }}>
        <header className="modal-header flex items-start gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-[var(--ink)]">上传我喜欢的风格</h2>
            <p className="mt-1 text-[13px] text-[var(--ink-faint)]">提交后会在后台分析、生成并保存模板，你可以继续使用其他功能。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="icon-control ml-auto text-[18px] text-[var(--ink-faint)]"><X aria-hidden="true" /></button>
        </header>

        <div className="grid grid-cols-2 gap-2 rounded-xl p-1" style={{ background: "var(--surface)" }} role="tablist" aria-label="参考素材类型">
          {(["image", "html"] as const).map((kind) => (
            <button key={kind} type="button" role="tab" aria-selected={sourceKind === kind} onClick={() => { setSourceKind(kind); setError(null); }} className="rounded-lg px-3 py-2 text-[13px] font-medium" style={sourceKind === kind ? { background: "var(--paper)", color: "var(--ink)" } : { color: "var(--ink-mute)" }}>
              {kind === "image" ? "上传风格图片" : "上传参考 HTML"}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-[var(--ink)]">模板名称</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例：冰蓝玻璃卡片" className="milky-input rounded-xl px-3 py-2 text-[14px] outline-none" style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }} />
        </label>

        {sourceKind === "image" ? (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-[var(--ink)]">风格图片</span>
            <button type="button" onClick={() => imageFileRef.current?.click()} className="grid min-h-44 place-items-center overflow-hidden rounded-2xl text-left" style={{ background: "var(--surface)", border: "1px dashed var(--line-soft)" }}>
              {imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageDataUrl} alt="上传的风格参考" className="max-h-72 w-full object-contain" />
              ) : (
                <span className="flex flex-col items-center gap-2 text-[13px] text-[var(--ink-mute)]"><ImageUp aria-hidden="true" />点击选择 PNG、JPEG 或 WebP，最大 10 MB</span>
              )}
            </button>
            <input ref={imageFileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { void readImageFile(event.target.files); event.target.value = ""; }} />
            {imageFileName && <span className="text-[12px] text-[var(--ink-faint)]">{imageFileName}</span>}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-[var(--ink)]">参考 HTML</span>
            <textarea value={html} onChange={(event) => setHtml(event.target.value)} placeholder="把 HTML 粘贴进来，或选择一个 .html 文件" rows={8} spellCheck={false} className="milky-input rounded-xl px-3 py-2 font-mono text-[12px] outline-none" style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }} />
            <div className="flex items-center gap-3 text-[12px]">
              <button type="button" onClick={() => htmlFileRef.current?.click()} className="quiet-link inline-flex items-center gap-1.5 text-[var(--ink-mute)] underline underline-offset-2"><FileCode2 aria-hidden="true" />选择 .html 文件…</button>
              <input ref={htmlFileRef} type="file" accept=".html,.htm,text/html" hidden onChange={(event) => { void readHtmlFile(event.target.files); event.target.value = ""; }} />
              <span className="text-[var(--ink-faint)]">{html ? `${(html.length / 1024).toFixed(1)} KB` : "未提供"}</span>
            </div>
          </div>
        )}

        {error && <p className="status-note status-error rounded-xl p-3 text-[13px]" style={{ background: "rgba(156,42,37,0.08)", color: "var(--red)" }}>{error}</p>}

        <div className="flex items-center gap-3">
          <button type="button" disabled={!canSubmit} onClick={submit} className="primary-button inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white transition-opacity disabled:opacity-40" style={{ background: "var(--coral)" }}>
            <Sparkles aria-hidden="true" />开始后台生成 <ArrowRight aria-hidden="true" />
          </button>
          <button type="button" onClick={onClose} className="quiet-link text-[13px] text-[var(--ink-mute)]">取消</button>
        </div>
      </div>
    </div>
  );
}
