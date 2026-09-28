"use client";

import { useEffect, useMemo, useState } from "react";
import { ScanSearch, X } from "lucide-react";
import { useStore, type AgentInfo } from "@/lib/store";
import { useT, type DictKey } from "@/lib/i18n";

type Props = { onClose: () => void; initialSection?: SectionId };

export type SectionId = "agent";

const SECTIONS: Array<{ id: SectionId; labelKey: DictKey; hintKey: DictKey }> = [
  { id: "agent", labelKey: "settings.section.agent.label", hintKey: "settings.section.agent.hint" },
];

const PROTOCOL_KEY: Record<AgentInfo["protocol"], { key: DictKey; tone: "ok" | "warn" }> = {
  stdin: { key: "protocol.stdin", tone: "ok" },
  argv: { key: "protocol.argv", tone: "ok" },
  "argv-message": { key: "protocol.argvMessage", tone: "ok" },
  acp: { key: "protocol.acp", tone: "warn" },
  "pi-rpc": { key: "protocol.piRpc", tone: "warn" },
};

export function SettingsModal({ onClose, initialSection = "agent" }: Props) {
  const [section, setSection] = useState<SectionId>(initialSection);
  const t = useT();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center od-backdrop"
      style={{ background: "rgba(21, 20, 15, 0.45)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-shell settings-modal relative w-[860px] max-w-[94vw] h-[600px] max-h-[88vh] flex flex-col overflow-hidden od-fade-in"
        style={{
          background: "var(--surface)",
          borderRadius: 24,
          border: "1px solid var(--line-soft)",
          boxShadow: "0 40px 80px -20px rgba(21, 20, 15, 0.35)",
        }}
      >
        <div
          className="modal-header flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--line-faint)" }}
        >
          <div>
            <div className="eyebrow">{t("settings.eyebrow")}</div>
            <h2 className="mt-2 text-[20px] font-semibold tracking-tight text-[var(--ink)] font-[family-name:var(--font-display)]">
              {t("settings.titlePart1")} <em className="serif-em">{t("settings.titleAccent")}</em>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="icon-control grid h-8 w-8 place-items-center rounded-full text-[var(--ink-mute)] hover:bg-[var(--line-faint)] hover:text-[var(--ink)] transition-colors"
            aria-label={t("settings.close")}
            title={t("settings.close")}
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <nav
            className="modal-sidebar w-[200px] shrink-0 px-3 py-4 overflow-y-auto"
            style={{ background: "var(--paper)", borderRight: "1px solid var(--line-faint)" }}
          >
            {SECTIONS.map((s) => {
              const active = s.id === section;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`modal-nav-item block w-full rounded-xl px-3 py-2.5 mb-1 text-left transition-all ${
                    active
                      ? "is-active bg-[var(--surface)] ring-1 ring-[var(--line)]"
                      : "hover:bg-[var(--surface)]"
                  }`}
                >
                  <div className={`text-[13.5px] font-medium ${active ? "text-[var(--ink)]" : "text-[var(--ink-soft)]"}`}>
                    {t(s.labelKey)}
                  </div>
                  <div className="text-[11px] text-[var(--ink-faint)] mt-0.5">{t(s.hintKey)}</div>
                </button>
              );
            })}
          </nav>

          <div className="modal-body flex-1 min-w-0 overflow-y-auto px-7 py-6">
            {section === "agent" && <AgentSection />}
          </div>
        </div>

        <div
          className="modal-footer flex items-center justify-end gap-2 px-6 py-4"
          style={{ borderTop: "1px solid var(--line-faint)", background: "var(--paper)" }}
        >
          <button onClick={onClose} className="btn-primary">
            {t("settings.done")}
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentSection() {
  const setSelectedAgent = useStore((s) => s.setSelectedAgent);
  const setAgents = useStore((s) => s.setAgents);
  const setAgentModel = useStore((s) => s.setAgentModel);
  const setAgentBinOverride = useStore((s) => s.setAgentBinOverride);
  const agents = useStore((s) => s.agents);
  const selected = useStore((s) => s.selectedAgent);
  const agentModels = useStore((s) => s.agentModels);
  const agentBinOverrides = useStore((s) => s.agentBinOverrides);
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
    if (!agents.length) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const installed = useMemo(() => agents.filter((a) => a.available), [agents]);
  const missing = useMemo(() => agents.filter((a) => !a.available), [agents]);
  const selectedAgent = installed.find((a) => a.id === selected);
  const selectedModelId = selected ? agentModels[selected] ?? "default" : "default";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[17px] font-semibold text-[var(--ink)]">{t("settings.agent.title")}</h3>
          <p className="mt-1 text-[12.5px] text-[var(--ink-mute)] leading-relaxed">
            {t("settings.agent.subtitle")}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="quiet-link text-xs text-[var(--ink-faint)] hover:text-[var(--ink)] disabled:opacity-50 transition-colors shrink-0"
        >
          {loading ? t("welcome.scanning") : t("welcome.rescan")}
        </button>
      </div>

      {err && (
        <div
          className="status-note status-error mb-4 rounded-xl px-4 py-3 text-sm"
          style={{ background: "var(--coral-soft)", color: "var(--coral)" }}
        >
          {t("welcome.detectionFailed")}: {err}
        </div>
      )}

      {installed.length > 0 && (
        <>
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
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

      {selectedAgent && (
        <ModelPicker
          agent={selectedAgent}
          modelId={selectedModelId}
          onPick={(id) => setAgentModel(selectedAgent.id, id)}
        />
      )}

      {selectedAgent && (
        <CustomBinPath
          agent={selectedAgent}
          value={agentBinOverrides[selectedAgent.id] ?? ""}
          onChange={(p) => setAgentBinOverride(selectedAgent.id, p)}
        />
      )}

      {missing.length > 0 && (
        <>
          <div className="mt-6 mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            {t("welcome.notInstalled", { n: missing.length })}
          </div>
          <div className="grid grid-cols-1 gap-2">
            {missing.map((a) => (
              <MissingCard key={a.id} agent={a} />
            ))}
          </div>
        </>
      )}

      {!loading && agents.length === 0 && (
        <div
          className="empty-state rounded-2xl border-2 border-dashed py-10 px-6 text-center"
          style={{ borderColor: "var(--line)" }}
        >
          <ScanSearch aria-hidden="true" className="empty-state-icon mx-auto mb-2" />
          <p className="text-sm font-medium text-[var(--ink-soft)]">{t("welcome.noAgentsTitle")}</p>
          <p className="mt-2 text-xs text-[var(--ink-mute)]">{t("welcome.noAgentsBody")}</p>
        </div>
      )}
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
          <div
            className="font-mono text-[10px] text-[var(--ink-mute)] mt-1.5 truncate"
            title={agent.path}
          >
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
      className="subtle-card mt-5 rounded-2xl p-4"
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
        <div className="text-[10.5px] text-[var(--ink-mute)] max-w-[220px] text-right leading-snug">
          {t("model.defaultHint.prefix")}
          <code className="px-1 rounded bg-[var(--surface)] border border-[var(--line-faint)]">
            --model
          </code>
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

function CustomBinPath({
  agent,
  value,
  onChange,
}: {
  agent: AgentInfo;
  value: string;
  onChange: (path: string) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(value);
  // Keep the local input in sync if the persisted value changes from elsewhere
  // (e.g. agent switch). Avoid clobbering an in-progress edit.
  useEffect(() => {
    setDraft(value);
  }, [value, agent.id]);
  // Best-effort platform sniff for the placeholder hint. The actual path
  // resolution happens server-side in `resolveBinForAgent`.
  const isWindows = typeof navigator !== "undefined" && /Win/i.test(navigator.platform);
  const placeholder = isWindows
    ? "C:\\Users\\you\\scoop\\apps\\nodejs\\current\\claude.cmd"
    : "/usr/local/bin/claude";
  const detected = agent.path;
  const dirty = draft.trim() !== value.trim();
  return (
    <div
      className="subtle-card mt-3 rounded-2xl p-4"
      style={{ background: "var(--paper)", border: "1px solid var(--line-faint)" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            {t("agent.customBin.eyebrow")}
          </div>
          <div className="text-[12.5px] text-[var(--ink-soft)] mt-0.5">
            {t("agent.customBin.subtitle", { agent: agent.label })}
          </div>
        </div>
        {detected && (
          <div className="text-[10.5px] text-[var(--ink-mute)] max-w-[260px] text-right leading-snug">
            {t("agent.customBin.detected")}
            <code className="ml-1 break-all font-mono text-[10px] text-[var(--ink-soft)]">{detected}</code>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onChange(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onChange(draft);
            if (e.key === "Escape") setDraft(value);
          }}
          placeholder={placeholder}
          className="milky-input min-w-0 flex-1 rounded-lg px-3 py-1.5 font-mono text-[12px] outline-none"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            color: "var(--ink)",
          }}
        />
        {value && (
          <button
            onClick={() => {
              setDraft("");
              onChange("");
            }}
            className="glass-control shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--ink-mute)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--coral)]"
          >
            {t("agent.customBin.clear")}
          </button>
        )}
        {dirty && (
          <button
            onClick={() => onChange(draft)}
            className="primary-button shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-medium"
            style={{ background: "var(--ink)", color: "var(--paper)" }}
          >
            {t("agent.customBin.save")}
          </button>
        )}
      </div>
      <div className="mt-2 text-[10.5px] text-[var(--ink-mute)] leading-snug">
        {t("agent.customBin.hint")}
      </div>
    </div>
  );
}

function MissingCard({ agent }: { agent: AgentInfo }) {
  const t = useT();
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
        <div className="text-[10.5px] text-[var(--ink-faint)]">{agent.vendor}</div>
      </div>
      <span className="text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
        {t("agent.notInstalled")}
      </span>
    </div>
  );
}
