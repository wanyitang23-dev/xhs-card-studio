"use client";

import { useEffect, useState } from "react";
import { ScanSearch } from "lucide-react";
import { useStore, type AgentInfo } from "@/lib/store";
import { useT, type DictKey } from "@/lib/i18n";

const PROTOCOL_KEY: Record<AgentInfo["protocol"], { key: DictKey; tone: "ok" | "warn" }> = {
  stdin: { key: "protocol.stdin", tone: "ok" },
  argv: { key: "protocol.argv", tone: "ok" },
  "argv-message": { key: "protocol.argvMessage", tone: "ok" },
  acp: { key: "protocol.acp", tone: "warn" },
  "pi-rpc": { key: "protocol.piRpc", tone: "warn" },
};

const VENDOR_HINT: Record<string, { install: string }> = {
  Anthropic: {
    install: "npm i -g @anthropic-ai/claude-code  ·  claude /login",
  },
  OpenAI: {
    install: "npm i -g @openai/codex",
  },
  Cursor: {
    install: "curl https://cursor.com/install -fsS | bash",
  },
  Google: {
    install: "npm i -g @google/gemini-cli",
  },
  GitHub: {
    install: "gh extension install github/gh-copilot",
  },
  Open: {
    install: "npm i -g @opencode-ai/cli",
  },
  Alibaba: {
    install: "npm i -g @alibabacloud/qwen-code",
  },
  Aider: {
    install: "pip install aider-install && aider-install",
  },
  DeepSeek: {
    install: "npm install -g deepseek-tui  ·  deepseek-tui auth",
  },
  CodeWhale: {
    install: "cargo install codewhale  ·  codewhale auth",
  },
  Cognition: {
    install: "curl -fsSL https://cli.devin.ai/install.sh | bash",
  },
  Mature: {
    install: "npm i -g @mature/hermes-cli  ·  hermes login",
  },
  Moonshot: {
    install: "npm i -g @moonshot-ai/kimi-cli  ·  kimi login",
  },
  Inflection: {
    install: "curl -fsSL https://pi.ai/install.sh | bash  ·  pi login",
  },
  AWS: {
    install: "brew install kiro  ·  kiro-cli login",
  },
  Kilo: {
    install: "npm i -g kilo  ·  kilo login",
  },
  Mistral: {
    install: "npm i -g @mistralai/vibe-cli  ·  vibe login",
  },
  Qoder: {
    install: "brew tap qoder/cli && brew install qodercli  ·  qodercli login",
  },
};

type Props = { onClose: () => void };

export function WelcomeModal({ onClose }: Props) {
  const setSelectedAgent = useStore((s) => s.setSelectedAgent);
  const setWelcomeAck = useStore((s) => s.setWelcomeAck);
  const setAgents = useStore((s) => s.setAgents);
  const setAgentModel = useStore((s) => s.setAgentModel);
  const agents = useStore((s) => s.agents);
  const selected = useStore((s) => s.selectedAgent);
  const agentModels = useStore((s) => s.agentModels);
  const t = useT();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/agents", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { agents: AgentInfo[] };
      setAgents(data.agents);
      const installed = data.agents.filter((a) => a.available);
      if (!installed.find((a) => a.id === selected) && installed.length) {
        setSelectedAgent(installed[0].id);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "detection failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const installed = agents.filter((a) => a.available);
  const missing = agents.filter((a) => !a.available);
  const selectedAgent = installed.find((a) => a.id === selected);
  const selectedModelId = selected ? agentModels[selected] ?? "default" : "default";
  const canEnter = !!selectedAgent && !selectedAgent.unsupported;

  const confirm = () => {
    if (!canEnter) return;
    setWelcomeAck(true);
    onClose();
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center od-backdrop"
      style={{ background: "rgba(21, 20, 15, 0.45)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && canEnter) confirm();
      }}
    >
      <div
        className="modal-shell welcome-modal relative w-[640px] max-w-[92vw] max-h-[88vh] flex flex-col overflow-hidden od-fade-in"
        style={{
          background: "var(--surface)",
          borderRadius: 24,
          border: "1px solid var(--line-soft)",
          boxShadow: "0 40px 80px -20px rgba(21, 20, 15, 0.35)",
        }}
      >
        {/* Header */}
        <div className="modal-header px-8 pt-8 pb-5 border-b" style={{ borderColor: "var(--line-faint)" }}>
          <div className="flex items-center justify-between">
            <span className="eyebrow">{t("welcome.eyebrow")}</span>
            <button
              onClick={load}
              disabled={loading}
              className="quiet-link text-xs text-[var(--ink-faint)] hover:text-[var(--ink)] disabled:opacity-50 transition-colors"
              title={t("welcome.rescanTitle")}
            >
              {loading ? t("welcome.scanning") : t("welcome.rescan")}
            </button>
          </div>
          <h1 className="mt-3 text-[28px] leading-[1.18] font-semibold tracking-tight text-[var(--ink)] font-[family-name:var(--font-display)]">
            {t("welcome.titlePart1")} <em className="serif-em">{t("welcome.titleAccent")}</em>
          </h1>
          <p className="mt-2 text-[13.5px] text-[var(--ink-mute)] leading-relaxed">
            {t("welcome.description")}
          </p>
        </div>

        {/* Agent grid */}
        <div className="modal-body flex-1 overflow-y-auto px-8 py-6">
          {err && (
            <div className="status-note status-error mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--coral-soft)", color: "var(--coral)" }}>
              {t("welcome.detectionFailed")}: {err}
            </div>
          )}

          {installed.length > 0 && (
            <>
              <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                <span className="pulse-dot" /> {t("welcome.installed", { n: installed.length })}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {installed.map((a) => (
                  <AgentCard
                    key={a.id}
                    agent={a}
                    selected={selected === a.id}
                    onClick={() => setSelectedAgent(a.id)}
                  />
                ))}
              </div>
            </>
          )}

          {missing.length > 0 && (
            <>
              <div className="mt-6 mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                {t("welcome.notInstalled", { n: missing.length })}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {missing.map((a) => (
                  <MissingCard key={a.id} agent={a} />
                ))}
              </div>
            </>
          )}

          {!loading && installed.length === 0 && (
            <div className="empty-state rounded-2xl border-2 border-dashed py-10 px-6 text-center" style={{ borderColor: "var(--line)" }}>
              <ScanSearch aria-hidden="true" className="empty-state-icon mx-auto mb-2" />
              <p className="text-sm font-medium text-[var(--ink-soft)]">{t("welcome.noAgentsTitle")}</p>
              <p className="mt-2 text-xs text-[var(--ink-mute)]">{t("welcome.noAgentsBody")}</p>
            </div>
          )}

          {selectedAgent && (
            <ModelPicker
              agent={selectedAgent}
              modelId={selectedModelId}
              onPick={(id) => setAgentModel(selectedAgent.id, id)}
            />
          )}
        </div>

        {/* Attribution — this tool is a fork; say so once, quietly. */}
        <div
          className="modal-attribution px-8 py-3 text-center text-[11.5px] text-[var(--ink-mute)]"
          style={{ borderTop: "1px solid var(--line-faint)" }}
        >
          {t("welcome.forkedFrom.prefix")}{" "}
          <a
            href="https://github.com/nexu-io/html-anything"
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2 transition-colors hover:text-[var(--ink)]"
          >
            html-anything
          </a>
          {t("welcome.forkedFrom.suffix")}
        </div>

        {/* Footer */}
        <div
          className="modal-footer px-8 py-5 flex items-center justify-between gap-4"
          style={{ borderTop: "1px solid var(--line-faint)", background: "var(--paper)" }}
        >
          <div className="text-xs text-[var(--ink-mute)] truncate">
            {selectedAgent ? (
              <>
                {t("welcome.current")}: <strong className="text-[var(--ink)]">{selectedAgent.label}</strong>
                {selectedModelId !== "default" && (
                  <span className="ml-1 text-[var(--ink-faint)]">· {selectedModelId}</span>
                )}
                {selectedAgent.unsupported && (
                  <span className="ml-2 text-[var(--coral)]">{t("welcome.unsupportedHint")}</span>
                )}
              </>
            ) : (
              <>{t("welcome.pickInstalled")}</>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => {
                setWelcomeAck(true);
                onClose();
              }}
              className="btn-ghost"
            >
              {t("welcome.later")}
            </button>
            <button
              onClick={confirm}
              disabled={!canEnter}
              className="btn-primary"
              title={
                !selectedAgent
                  ? t("welcome.enterTooltip.noAgent")
                  : selectedAgent.unsupported
                    ? t("welcome.enterTooltip.unsupported")
                    : t("welcome.enterTooltip.ok")
              }
            >
              {t("welcome.enter")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  selected,
  onClick,
}: {
  agent: AgentInfo;
  selected: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const hint = VENDOR_HINT[agent.vendor];
  const proto = PROTOCOL_KEY[agent.protocol];
  return (
    <button
      onClick={onClick}
      className={`select-card agent-card group relative flex items-start gap-3 rounded-2xl p-4 text-left transition-all ${
        selected ? "is-selected ring-2 ring-[var(--coral)]" : "ring-1 ring-[var(--line-soft)] hover:ring-[var(--ink)]/30"
      }`}
      style={{ background: "var(--surface)" }}
    >
      <div
        className="vendor-avatar shrink-0 grid h-9 w-9 place-items-center rounded-xl"
      >
        <span className="font-semibold text-[15px]">{agent.label.charAt(0)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="text-[14px] font-semibold text-[var(--ink)] truncate">{agent.label}</div>
          {selected && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--coral)]">
              {t("agent.selected")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--ink-faint)] mt-0.5">
          <span>{agent.vendor}</span>
          <span>·</span>
          <span className={proto.tone === "warn" ? "text-[var(--coral)]" : ""}>{t(proto.key)}</span>
        </div>
        {agent.path && (
          <div className="font-mono text-[10px] text-[var(--ink-mute)] mt-1.5 truncate" title={agent.path}>
            {agent.path}
          </div>
        )}
      </div>
    </button>
  );
}

function ModelPicker({
  agent,
  modelId,
  onPick,
}: {
  agent: AgentInfo;
  modelId: string;
  onPick: (id: string) => void;
}) {
  const t = useT();
  const models = agent.models.length
    ? agent.models
    : [{ id: "default", label: t("model.defaultLabel") }];
  const MARK = "​";
  const [before, after = ""] = t("model.label", { agent: MARK }).split(MARK);
  return (
    <div
      className="subtle-card mt-6 rounded-2xl p-4"
      style={{ background: "var(--paper)", border: "1px solid var(--line-faint)" }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">{t("model.eyebrow")}</div>
          <div className="text-[13px] font-medium text-[var(--ink-soft)] mt-0.5">
            {before}
            <strong className="text-[var(--ink)]">{agent.label}</strong>
            {after}
          </div>
        </div>
        <div className="text-[10.5px] text-[var(--ink-mute)] max-w-[200px] text-right leading-snug">
          {t("model.defaultHint.prefix")}
          <code className="px-1 rounded bg-[var(--surface)] border border-[var(--line-faint)]">--model</code>
          {t("model.defaultHint.suffix")}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {models.map((m) => {
          const active = m.id === modelId;
          return (
            <button
              key={m.id}
              onClick={() => onPick(m.id)}
              className={`choice-pill rounded-full px-3 py-1.5 text-[12px] transition-all ${
                active
                  ? "is-selected bg-[var(--ink)] text-[var(--paper)] font-medium"
                  : "bg-[var(--surface)] text-[var(--ink-soft)] border border-[var(--line-soft)] hover:border-[var(--ink)]/40"
              }`}
              title={m.id}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MissingCard({ agent }: { agent: AgentInfo }) {
  const t = useT();
  const hint = VENDOR_HINT[agent.vendor];
  return (
    <div
      className="subtle-card is-muted flex items-center gap-3 rounded-xl p-3 opacity-70"
      style={{ background: "var(--paper)", border: "1px solid var(--line-faint)" }}
    >
      <div
        className="vendor-avatar shrink-0 grid h-8 w-8 place-items-center rounded-lg text-[13px] font-semibold"
      >
        {agent.label.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-[var(--ink-soft)]">{agent.label}</div>
        {hint && (
          <div className="font-mono text-[10.5px] text-[var(--ink-faint)] truncate" title={hint.install}>
            {hint.install}
          </div>
        )}
      </div>
      <span className="text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t("agent.notInstalled")}</span>
    </div>
  );
}
