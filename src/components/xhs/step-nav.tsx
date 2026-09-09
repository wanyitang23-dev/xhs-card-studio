"use client";

import { STEP_ORDER, useXhs, type Step } from "@/lib/xhs/store";

const LABELS: Record<Step, { n: string; title: string; hint: string }> = {
  source: { n: "1", title: "贴文章", hint: "原文 / 模板 / 表达方式" },
  outline: { n: "2", title: "定分页", hint: "逐页改文案、传配图" },
  cover: { n: "3", title: "挑封面", hint: "三版并排对比" },
  render: { n: "4", title: "出成品", hint: "生成完整图文" },
};

/** How far the user is allowed to jump — you cannot pick a cover with no pages. */
function reachable(step: Step, hasPages: boolean, hasCover: boolean): boolean {
  if (step === "source") return true;
  if (step === "outline") return hasPages;
  if (step === "cover") return hasPages;
  return hasPages && hasCover;
}

export function StepNav() {
  const step = useXhs((s) => s.step);
  const setStep = useXhs((s) => s.setStep);
  const pages = useXhs((s) => s.pages);
  const selectedCoverId = useXhs((s) => s.selectedCoverId);

  const activeIdx = STEP_ORDER.indexOf(step);

  return (
    <nav className="flex items-stretch gap-1 px-4 py-3" aria-label="流程步骤">
      {STEP_ORDER.map((s, i) => {
        const meta = LABELS[s];
        const active = s === step;
        const done = i < activeIdx;
        const can = reachable(s, pages.length > 0, !!selectedCoverId);
        return (
          <button
            key={s}
            type="button"
            onClick={() => can && setStep(s)}
            disabled={!can}
            aria-current={active ? "step" : undefined}
            className="group flex flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: active ? "var(--coral-soft)" : "transparent",
              border: `1px solid ${active ? "var(--coral)" : "var(--line-faint)"}`,
            }}
          >
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold"
              style={{
                background: active || done ? "var(--coral)" : "var(--line-faint)",
                color: active || done ? "#fff" : "var(--ink-faint)",
              }}
            >
              {done ? "✓" : meta.n}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold text-[var(--ink)]">
                {meta.title}
              </span>
              <span className="block truncate text-[12px] text-[var(--ink-faint)]">
                {meta.hint}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
