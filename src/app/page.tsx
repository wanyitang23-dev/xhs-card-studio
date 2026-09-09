"use client";

import { useEffect, useState } from "react";
import { WelcomeModal } from "@/components/welcome-modal";
import { SettingsModal } from "@/components/settings-modal";
import { StepNav } from "@/components/xhs/step-nav";
import { StepSource } from "@/components/xhs/step-source";
import { StepOutline } from "@/components/xhs/step-outline";
import { StepCover } from "@/components/xhs/step-cover";
import { StepRender } from "@/components/xhs/step-render";
import { TemplateUpload } from "@/components/xhs/template-upload";
import { useStore, type AgentInfo } from "@/lib/store";
import { useXhs } from "@/lib/xhs/store";

export default function Home() {
  const welcomeAck = useStore((s) => s.welcomeAck);
  const selectedAgent = useStore((s) => s.selectedAgent);
  const agents = useStore((s) => s.agents);
  const setAgents = useStore((s) => s.setAgents);
  const locale = useStore((s) => s.locale);
  const step = useXhs((s) => s.step);
  const resetFlow = useXhs((s) => s.resetFlow);

  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
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
    <main className="flex h-screen flex-col" style={{ background: "var(--paper)" }}>
      <header
        className="flex items-center gap-3 px-4 py-2.5"
        style={{ borderBottom: "1px solid var(--line-faint)" }}
      >
        <span className="text-[15px] font-semibold text-[var(--ink)]">
          小红书图文 <span className="text-[var(--ink-faint)]">· 分步生成</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="rounded-lg px-3 py-1.5 text-[13px]"
            style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
          >
            上传模板
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("清空当前内容，重新开始？")) resetFlow();
            }}
            className="rounded-lg px-3 py-1.5 text-[13px]"
            style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
          >
            重新开始
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg px-3 py-1.5 text-[13px]"
            style={{ background: "var(--surface)", border: "1px solid var(--line-soft)" }}
          >
            {agentLabel}
          </button>
        </div>
      </header>

      <div style={{ borderBottom: "1px solid var(--line-faint)" }}>
        <StepNav />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {step === "source" && <StepSource />}
        {step === "outline" && <StepOutline />}
        {step === "cover" && <StepCover />}
        {step === "render" && <StepRender />}
      </div>

      {welcomeOpen && <WelcomeModal onClose={() => setWelcomeOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {uploadOpen && <TemplateUpload onClose={() => setUploadOpen(false)} />}
    </main>
  );
}
