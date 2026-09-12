"use client";

import { useEffect, useState } from "react";
import { Bot, RotateCcw, Upload } from "lucide-react";
import { WelcomeModal } from "@/components/welcome-modal";
import { SettingsModal } from "@/components/settings-modal";
import { StepNav } from "@/components/xhs/step-nav";
import { StepSource } from "@/components/xhs/step-source";
import { StepOutline } from "@/components/xhs/step-outline";
import { StepCover } from "@/components/xhs/step-cover";
import { StepRender } from "@/components/xhs/step-render";
import { TemplateUpload } from "@/components/xhs/template-upload";
import { TaskSidebar } from "@/components/xhs/task-sidebar";
import { TemplatePreviewPane } from "@/components/xhs/template-preview-pane";
import { TemplateGenerationStatus } from "@/components/xhs/template-generation-status";
import { useStore, type AgentInfo } from "@/lib/store";
import { useTask, useXhs } from "@/lib/xhs/store";

export default function Home() {
  const welcomeAck = useStore((s) => s.welcomeAck);
  const selectedAgent = useStore((s) => s.selectedAgent);
  const agents = useStore((s) => s.agents);
  const setAgents = useStore((s) => s.setAgents);
  const locale = useStore((s) => s.locale);
  const step = useTask((t) => t.step);
  const templateId = useTask((t) => t.templateId);
  const resetFlow = useXhs((s) => s.resetFlow);

  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  // Detect installed CLIs on mount so the agent chip can resolve the persisted
  // selection without waiting for the user to open Settings.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agents", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { agents: AgentInfo[] };
        if (!cancelled) setAgents(data.agents);
      } catch {
        // Settings / Welcome retry on open.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, setAgents]);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.setAttribute("lang", locale);
  }, [locale]);

  useEffect(() => {
    if (!hydrated) return;
    if (!welcomeAck || !selectedAgent) setWelcomeOpen(true);
  }, [hydrated, welcomeAck, selectedAgent]);

  const agentLabel = agents.find((a) => a.id === selectedAgent)?.label ?? "选择 agent";

  return (
    <main className="aurora-shell flex h-screen flex-col" style={{ background: "var(--paper)" }}>
      <header
        className="app-header flex items-center gap-3 px-4 py-2.5"
        style={{ borderBottom: "1px solid var(--line-faint)" }}
      >
        <span className="app-brand text-[15px] font-semibold text-[var(--ink)]">
          小红书图文 <span className="text-[var(--ink-faint)]">· 分步生成</span>
        </span>
        <div className="app-header-actions ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="glass-control rounded-lg px-3 py-1.5 text-[13px]"
            style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
          >
            <Upload aria-hidden="true" />
            上传模板
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("清空当前内容，重新开始？")) resetFlow();
            }}
            className="glass-control rounded-lg px-3 py-1.5 text-[13px]"
            style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
          >
            <RotateCcw aria-hidden="true" />
            重新开始
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="glass-control agent-control rounded-lg px-3 py-1.5 text-[13px]"
            style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
          >
            <Bot aria-hidden="true" />
            {agentLabel}
          </button>
        </div>
      </header>

      <div className="app-stepbar" style={{ borderBottom: "1px solid var(--line-faint)" }}>
        <StepNav />
      </div>

      <div className="app-workspace flex min-h-0 flex-1">
        <TaskSidebar />
        <div className="app-canvas min-h-0 min-w-0 flex-1 overflow-auto">
          {step === "source" && <StepSource />}
          {step === "outline" && <StepOutline />}
          {step === "cover" && <StepCover />}
          {step === "render" && <StepRender />}
        </div>
        {/* Steps ③ and ④ show the user's own generated pages, so the template
            sample would only compete with them for space. */}
        {(step === "source" || step === "outline") && (
          <TemplatePreviewPane
            templateId={templateId}
            collapsed={previewCollapsed}
            onToggle={() => setPreviewCollapsed((v) => !v)}
          />
        )}
      </div>

      {welcomeOpen && <WelcomeModal onClose={() => setWelcomeOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {uploadOpen && <TemplateUpload onClose={() => setUploadOpen(false)} />}
      <TemplateGenerationStatus />
    </main>
  );
}
