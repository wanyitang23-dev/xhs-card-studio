"use client";

import { useSyncExternalStore } from "react";
import { CheckCircle2, LoaderCircle, X, XCircle } from "lucide-react";
import {
  cancelTemplateGenerationJob,
  dismissTemplateGenerationJob,
  getTemplateGenerationJobs,
  subscribeTemplateGenerationJobs,
  type TemplateGenerationStage,
} from "@/lib/templates/background-generation";

const EMPTY_JOBS: ReturnType<typeof getTemplateGenerationJobs> = [];

const STAGE_LABEL: Record<TemplateGenerationStage, string> = {
  deriving: "正在分析视觉",
  generating: "正在生成模板",
  refining: "正在对照原图微调",
  saving: "正在保存",
  success: "模板生成完成",
  error: "模板生成失败",
  cancelled: "模板生成已取消",
};

export function TemplateGenerationStatus() {
  const jobs = useSyncExternalStore(
    subscribeTemplateGenerationJobs,
    getTemplateGenerationJobs,
    () => EMPTY_JOBS,
  );
  if (!jobs.length) return null;

  return (
    <div className="fixed bottom-5 right-5 z-40 flex w-[min(360px,calc(100vw-40px))] flex-col gap-2" aria-live="polite">
      {jobs.map((job) => {
        const running = !["success", "error", "cancelled"].includes(job.stage);
        const failed = job.stage === "error";
        return (
          <div
            key={job.id}
            className="flex items-start gap-3 rounded-2xl px-4 py-3 shadow-lg"
            style={{ background: "var(--paper)", border: "1px solid var(--line-soft)" }}
          >
            {running ? (
              <LoaderCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--coral)]" />
            ) : failed ? (
              <XCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            ) : (
              <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[var(--ink)]">{job.name}</p>
              <p className="mt-0.5 text-[12px] text-[var(--ink-faint)]">{job.message || STAGE_LABEL[job.stage]}</p>
            </div>
            <button
              type="button"
              onClick={() => running ? cancelTemplateGenerationJob(job.id) : dismissTemplateGenerationJob(job.id)}
              aria-label={running ? "取消后台生成" : "关闭提示"}
              className="icon-control shrink-0 text-[15px] text-[var(--ink-faint)]"
            >
              <X aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
