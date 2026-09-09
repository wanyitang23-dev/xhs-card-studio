"use client";

import { useCallback, useState } from "react";
import { STEP_ORDER, useXhs, type Step, type XhsTask } from "@/lib/xhs/store";

const STEP_LABEL: Record<Step, string> = {
  source: "贴文章",
  outline: "定分页",
  cover: "挑封面",
  render: "出成品",
};

/** True while any agent call for this task is in flight. */
function isBusy(t: XhsTask): boolean {
  return (
    t.outlineStatus === "running" ||
    t.renderStatus === "running" ||
    t.captionStatus === "running" ||
    t.covers.some((c) => c.status === "running")
  );
}

/**
 * Task switcher. Each entry is one article being turned into cards; runs keep
 * streaming into their own task after the user switches away, so the list shows
 * a live dot for whichever tasks are still working.
 */
export function TaskSidebar() {
  const tasks = useXhs((s) => s.tasks);
  const activeId = useXhs((s) => s.activeId);
  const addTask = useXhs((s) => s.addTask);
  const selectTask = useXhs((s) => s.selectTask);
  const removeTask = useXhs((s) => s.removeTask);
  const renameTask = useXhs((s) => s.renameTask);
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <aside
        className="flex w-11 shrink-0 flex-col items-center gap-2 py-3"
        style={{ borderRight: "1px solid var(--line-faint)" }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="展开任务列表"
          title={`任务列表（${tasks.length}）`}
          className="grid h-8 w-8 place-items-center rounded-lg text-[15px] text-[var(--ink-mute)] hover:bg-[var(--line-faint)]"
        >
          ☰
        </button>
        {tasks.some(isBusy) && (
          <span className="pulse-dot" title="有任务正在生成" />
        )}
      </aside>
    );
  }

  return (
    <aside
      className="flex w-[220px] shrink-0 flex-col"
      style={{ borderRight: "1px solid var(--line-faint)" }}
    >
      <div className="flex items-center gap-1 px-3 py-2.5">
        <span className="text-[12.5px] font-semibold text-[var(--ink)]">
          任务 <span className="text-[var(--ink-faint)]">{tasks.length}</span>
        </span>
        <button
          type="button"
          onClick={() => addTask()}
          className="ml-auto grid h-6 w-6 place-items-center rounded-md text-[15px] text-[var(--ink-mute)] hover:bg-[var(--line-faint)]"
          aria-label="新建任务"
          title="新建任务"
        >
          ＋
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="grid h-6 w-6 place-items-center rounded-md text-[13px] text-[var(--ink-mute)] hover:bg-[var(--line-faint)]"
          aria-label="收起任务列表"
          title="收起"
        >
          ‹
        </button>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-2 pb-2">
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            active={t.id === activeId}
            onSelect={() => selectTask(t.id)}
            onRemove={() => removeTask(t.id)}
            onRename={(name) => renameTask(t.id, name)}
          />
        ))}
      </ul>
    </aside>
  );
}

function TaskRow({
  task,
  active,
  onSelect,
  onRemove,
  onRename,
}: {
  task: XhsTask;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const busy = isBusy(task);
  const stepIdx = STEP_ORDER.indexOf(task.step);

  const commit = useCallback(
    (v: string) => {
      setEditing(false);
      if (v.trim() && v.trim() !== task.name) onRename(v);
    },
    [onRename, task.name],
  );

  return (
    <li>
      <div
        className="group flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors"
        style={{
          background: active ? "var(--coral-soft)" : "transparent",
          border: `1px solid ${active ? "var(--coral)" : "transparent"}`,
        }}
      >
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{
            background: busy ? "var(--coral)" : "var(--line)",
            // Reuse the app's existing keyframes rather than defining new ones.
            animation: busy ? "od-pulse 2.4s ease-in-out infinite" : undefined,
          }}
        />
        {editing ? (
          <input
            autoFocus
            defaultValue={task.name}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
              if (e.key === "Escape") setEditing(false);
            }}
            className="min-w-0 flex-1 rounded bg-white px-1 py-0.5 text-[12.5px] outline-none"
            style={{ border: "1px solid var(--line-soft)" }}
          />
        ) : (
          <button
            type="button"
            onClick={onSelect}
            onDoubleClick={() => setEditing(true)}
            title={`${task.name} · 双击重命名`}
            className="min-w-0 flex-1 text-left"
          >
            <span className="block truncate text-[12.5px] font-medium text-[var(--ink)]">
              {task.name}
            </span>
            <span className="block truncate text-[11px] text-[var(--ink-faint)]">
              {stepIdx + 1}/4 {STEP_LABEL[task.step]}
              {task.pages.length > 0 && ` · ${task.pages.length} 页`}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`删除 ${task.name}`}
          title="删除任务"
          className="grid h-5 w-5 shrink-0 place-items-center rounded text-[13px] text-[var(--ink-faint)] opacity-0 transition-opacity hover:bg-[var(--line-faint)] hover:text-[var(--ink)] focus:opacity-100 group-hover:opacity-100"
        >
          ×
        </button>
      </div>
    </li>
  );
}
