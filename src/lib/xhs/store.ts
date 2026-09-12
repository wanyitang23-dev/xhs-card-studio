"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type {
  Caption,
  CoverCandidate,
  OutlineMode,
  PageCountSetting,
  PageKind,
  XhsPage,
} from "./types";

/** Which of the four steps a task is on. */
export type Step = "source" | "outline" | "cover" | "render";

export const STEP_ORDER: Step[] = ["source", "outline", "cover", "render"];

export type FlowStatus = "idle" | "running" | "done" | "error";

let seq = 0;
/** Short, collision-free id. `crypto.randomUUID` is overkill for list keys. */
function nid(prefix: string): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
}

export function makePage(kind: PageKind, title = "", body = ""): XhsPage {
  return { id: nid("p"), kind, title, body, imageAssetIds: [], confirmed: false };
}

/**
 * One article being turned into a set of cards.
 *
 * Everything the four-step flow touches lives here rather than at the store's
 * top level, so several articles can be in flight at once — a render started on
 * one task keeps streaming into that task after the user switches away.
 */
export type XhsTask = {
  id: string;
  /** Shown in the sidebar. Auto-derived from the content until renamed. */
  name: string;
  /**
   * Set once the user renames the task by hand, which stops the name from
   * tracking the article. A heuristic ("does the name still look derived?")
   * cannot tell the two apart for a task whose source is still empty.
   */
  nameIsCustom?: boolean;
  createdAt: number;
  updatedAt: number;

  step: Step;
  // ① source
  sourceText: string;
  format: string;
  pageCount: PageCountSetting;
  /**
   * Whether the paging step may rewrite the user's words or only split them.
   * Optional on the type so a task persisted before the setting existed still
   * loads; `makeTask` fills in the default.
   */
  outlineMode: OutlineMode;
  templateId: string;
  /**
   * The account name stamped into each card's footer, without the leading `@`.
   *
   * Every template asks for 作者名 / 水印 in its footer but nothing used to
   * supply one, so the agent filled the slot with an invention — a different
   * one each run ("@产品复盘日记", "@Agent 手记", "@做 Agent 的日常"), and
   * sometimes a different one per cover in the same batch. Empty means the user
   * declined, which is not a licence to make one up: see `footerRule`.
   */
  handle: string;
  // ② outline
  pages: XhsPage[];
  outlineStatus: FlowStatus;
  outlineError?: string;
  requestedPages: number | null;
  // ③ cover
  covers: CoverCandidate[];
  selectedCoverId?: string;
  // ④ render + caption
  finalHtml: string;
  renderStatus: FlowStatus;
  renderError?: string;
  caption: Caption | null;
  captionStatus: FlowStatus;
  captionError?: string;

  /** `asset:<id>` → data URL, for screenshots attached to individual pages. */
  assets: Record<string, string>;
  /**
   * `asset:<id>` → the picture's real pixel size.
   *
   * Kept so the agent is told the aspect ratio instead of guessing it. Missing
   * entries are fine — older uploads are measured from their data URL on demand.
   */
  assetMeta: Record<string, { width: number; height: number }>;
  log: Array<{ ts: number; kind: string; text: string }>;
};

const DEFAULT_TEMPLATE = "card-xiaohongshu";

export function makeTask(name: string, seedFrom?: Partial<XhsTask>): XhsTask {
  return {
    id: nid("t"),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    step: "source",
    sourceText: "",
    format: "text",
    pageCount: seedFrom?.pageCount ?? "auto",
    // Carried into new tasks: someone who wants their own words kept usually
    // wants that for the next article too.
    outlineMode: seedFrom?.outlineMode ?? "condense",
    templateId: seedFrom?.templateId ?? DEFAULT_TEMPLATE,
    // Carried into new tasks: one person's handle does not change per article.
    handle: seedFrom?.handle ?? "",
    pages: [],
    outlineStatus: "idle",
    requestedPages: null,
    covers: [],
    finalHtml: "",
    renderStatus: "idle",
    caption: null,
    captionStatus: "idle",
    assets: {},
    assetMeta: {},
    log: [],
  };
}

/** First non-empty line of the source, trimmed — a better label than "任务 3". */
export function deriveName(sourceText: string, fallback: string): string {
  const line = sourceText
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").trim())
    .find((l) => l.length > 0);
  if (!line) return fallback;
  return line.length > 18 ? `${line.slice(0, 18)}…` : line;
}

type TaskPatch = Partial<XhsTask> | ((t: XhsTask) => Partial<XhsTask>);

type State = {
  tasks: XhsTask[];
  activeId: string;
  /** UI preference, shared across tasks rather than stored per article. */
  previewZoom: number;

  // ── task management ──
  addTask: () => string;
  removeTask: (id: string) => void;
  selectTask: (id: string) => void;
  renameTask: (id: string, name: string) => void;
  /** The one primitive every other mutator goes through. */
  patchTask: (id: string, patch: TaskPatch) => void;

  // ── active-task actions (what the step components call) ──
  setStep: (s: Step) => void;
  setSourceText: (t: string) => void;
  setFormat: (f: string) => void;
  setPageCount: (n: PageCountSetting) => void;
  setOutlineMode: (m: OutlineMode) => void;
  setTemplateId: (id: string) => void;
  setHandle: (handle: string) => void;

  setPages: (p: XhsPage[]) => void;
  patchPage: (id: string, patch: Partial<XhsPage>) => void;
  addPageAfter: (id: string) => void;
  removePage: (id: string) => void;
  movePage: (id: string, dir: -1 | 1) => void;

  selectCover: (id?: string) => void;
  patchCaption: (patch: Partial<Caption>) => void;

  addAsset: (dataUrl: string, size?: { width: number; height: number }) => string;
  setAssetSize: (key: string, size: { width: number; height: number }) => void;
  setPreviewZoom: (z: number) => void;
  resetFlow: () => void;
};

const firstTask = makeTask("任务 1");

export const useXhs = create<State>()(
  persist(
    (set, get) => {
      /** Apply `patch` to one task and stamp `updatedAt`. */
      const patchTask = (id: string, patch: TaskPatch) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? { ...t, ...(typeof patch === "function" ? patch(t) : patch), updatedAt: Date.now() }
              : t,
          ),
        }));
      /** Same, but always the task the user is looking at. */
      const patchActive = (patch: TaskPatch) => patchTask(get().activeId, patch);

      return {
        tasks: [firstTask],
        activeId: firstTask.id,
        previewZoom: 0.5,

        patchTask,

        addTask: () => {
          // Carry over the template and mode — someone making a series of posts
          // wants the same look, not the defaults again.
          const prev = get().tasks.find((t) => t.id === get().activeId);
          const task = makeTask(`任务 ${get().tasks.length + 1}`, prev ?? undefined);
          set((s) => ({ tasks: [...s.tasks, task], activeId: task.id }));
          return task.id;
        },
        removeTask: (id) =>
          set((s) => {
            // Never leave the app with no task; replace the last one instead.
            if (s.tasks.length <= 1) {
              const fresh = makeTask("任务 1", s.tasks[0]);
              return { tasks: [fresh], activeId: fresh.id };
            }
            const idx = s.tasks.findIndex((t) => t.id === id);
            const tasks = s.tasks.filter((t) => t.id !== id);
            const activeId =
              s.activeId === id ? (tasks[Math.max(0, idx - 1)] ?? tasks[0]).id : s.activeId;
            return { tasks, activeId };
          }),
        selectTask: (activeId) => set({ activeId }),
        renameTask: (id, name) =>
          patchTask(id, { name: name.trim() || "未命名", nameIsCustom: true }),

        setStep: (step) => patchActive({ step }),
        setSourceText: (sourceText) =>
          patchActive((t) => ({
            sourceText,
            // Keep the sidebar label in step with the article, but never once
            // the user has named the task themselves.
            ...(t.nameIsCustom ? {} : { name: deriveName(sourceText, t.name) }),
          })),
        setFormat: (format) => patchActive({ format }),
        setPageCount: (pageCount) => patchActive({ pageCount }),
        setOutlineMode: (outlineMode) => patchActive({ outlineMode }),
        setTemplateId: (templateId) => patchActive({ templateId }),
        setHandle: (handle: string) => patchActive({ handle }),

        setPages: (pages) => patchActive({ pages }),
        patchPage: (id, patch) =>
          patchActive((t) => ({
            pages: t.pages.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          })),
        addPageAfter: (id) =>
          patchActive((t) => {
            const i = t.pages.findIndex((p) => p.id === id);
            if (i === -1) return {};
            const next = [...t.pages];
            next.splice(i + 1, 0, makePage("content"));
            return { pages: reseal(next) };
          }),
        removePage: (id) =>
          patchActive((t) =>
            // Never let the deck fall below cover + ending.
            t.pages.length <= 2 ? {} : { pages: reseal(t.pages.filter((p) => p.id !== id)) },
          ),
        movePage: (id, dir) =>
          patchActive((t) => {
            const i = t.pages.findIndex((p) => p.id === id);
            const j = i + dir;
            if (i === -1 || j < 0 || j >= t.pages.length) return {};
            const next = [...t.pages];
            [next[i], next[j]] = [next[j], next[i]];
            return { pages: reseal(next) };
          }),

        selectCover: (selectedCoverId) => patchActive({ selectedCoverId }),
        patchCaption: (patch) =>
          patchActive((t) => (t.caption ? { caption: { ...t.caption, ...patch } } : {})),

        addAsset: (dataUrl, size) => {
          const key = `asset:${nid("a")}`;
          patchActive((t) => ({
            assets: { ...t.assets, [key]: dataUrl },
            ...(size ? { assetMeta: { ...t.assetMeta, [key]: size } } : {}),
          }));
          return key;
        },
        setAssetSize: (key, size) =>
          patchActive((t) => ({ assetMeta: { ...t.assetMeta, [key]: size } })),
        setPreviewZoom: (previewZoom) => set({ previewZoom }),
        resetFlow: () =>
          patchActive((t) => {
            const fresh = makeTask(t.name, t);
            return { ...fresh, id: t.id, name: t.name, createdAt: t.createdAt };
          }),
      };
    },
    {
      name: "xhs-anything",
      version: 1,
      storage: createJSONStorage(() =>
        quotaSafe(typeof window === "undefined" ? memoryStorage() : window.localStorage),
      ),
      // zustand types `migrate` as returning the whole state; the persisted
      // slice is intentionally narrower, so the cast lives here rather than
      // leaking `never` into migrateV0's own return type.
      migrate: (persisted, version) => migrateV0(persisted, version) as never,
      // Screenshots and rendered HTML are large and regenerable; everything else
      // is small text the user would hate to lose on reload.
      partialize: (s) => ({
        activeId: s.activeId,
        previewZoom: s.previewZoom,
        tasks: s.tasks.map((t) => ({
          id: t.id,
          name: t.name,
          nameIsCustom: t.nameIsCustom,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          step: t.step,
          sourceText: t.sourceText,
          format: t.format,
          pageCount: t.pageCount,
          outlineMode: t.outlineMode,
          templateId: t.templateId,
          handle: t.handle,
          pages: t.pages,
          // The user's uploaded screenshots. Unlike covers and rendered HTML
          // these are *not* regenerable — dropping them left `imageAssetIds`
          // pointing at nothing, and the render emitted <img src="asset:xxx">.
          assets: t.assets,
          assetMeta: t.assetMeta,
          selectedCoverId: t.selectedCoverId,
          caption: t.caption,
        })),
      }),
      // A persisted task is a subset of XhsTask; fill the dropped fields back in
      // so every consumer sees a complete task.
      merge: (persisted, current) => {
        const p = persisted as Partial<State> | undefined;
        if (!p?.tasks?.length) return current;
        const tasks = p.tasks.map((t) => ({ ...makeTask(""), ...t }) as XhsTask);
        return {
          ...current,
          ...p,
          tasks,
          activeId: tasks.some((t) => t.id === p.activeId) ? p.activeId! : tasks[0].id,
        };
      },
    },
  ),
);

/**
 * v0 kept a single flow's fields at the top level; v1 moved them into
 * `tasks[]`. Without this, zustand logs "couldn't be migrated since no
 * migrate function was provided" and throws the saved work away — which
 * is exactly what it did to anyone who had used the app before the
 * multi-task change.
 */
export type MigratedState = { tasks: XhsTask[]; activeId: string; previewZoom: number };

export function migrateV0(persisted: unknown, version: number): MigratedState {
  const p = persisted as Record<string, unknown> | undefined;
  if (!p) return persisted as MigratedState;
  if (version >= 1) return p as unknown as MigratedState;
  const legacy = p as Partial<XhsTask> & { previewZoom?: number };
  const task: XhsTask = {
    ...makeTask(deriveName(legacy.sourceText ?? "", "任务 1")),
    // Carry over every v0 field that still exists in v1; anything the old
    // shape lacked keeps the fresh task's default.
    ...(legacy.step ? { step: legacy.step } : {}),
    ...(legacy.sourceText ? { sourceText: legacy.sourceText } : {}),
    ...(legacy.format ? { format: legacy.format } : {}),
    // v0 also stored a `mode`; that feature is gone, so it is dropped here.
    ...(legacy.pageCount ? { pageCount: legacy.pageCount } : {}),
    ...(legacy.templateId ? { templateId: legacy.templateId } : {}),
    ...(Array.isArray(legacy.pages) ? { pages: legacy.pages } : {}),
    ...(legacy.selectedCoverId ? { selectedCoverId: legacy.selectedCoverId } : {}),
    ...(legacy.caption ? { caption: legacy.caption } : {}),
  };
  return {
    tasks: [task],
    activeId: task.id,
    previewZoom: typeof legacy.previewZoom === "number" ? legacy.previewZoom : 0.5,
  };
}

/** Re-apply the cover / content / ending bookends after any reorder. */
function reseal(pages: XhsPage[]): XhsPage[] {
  return pages.map((p, i) => ({
    ...p,
    kind: i === 0 ? "cover" : i === pages.length - 1 ? "ending" : "content",
  }));
}

/** The task the user is looking at. Falls back to the first one. */
export function activeTask(s: State): XhsTask {
  return s.tasks.find((t) => t.id === s.activeId) ?? s.tasks[0];
}

/**
 * Read one field off the active task.
 *
 * Components use this instead of reaching into the store's top level, so
 * switching tasks re-renders them against the new task's state.
 */
export function useTask<T>(selector: (t: XhsTask) => T): T {
  return useXhs((s) => selector(activeTask(s)));
}

/**
 * localStorage that degrades instead of throwing when it runs out of room.
 *
 * Attached screenshots are bounded on upload (see `image.ts`), but a task with
 * several of them can still push the snapshot past the ~5 MB quota. The default
 * behaviour there is a thrown `QuotaExceededError` inside zustand's write,
 * which loses the *entire* snapshot — including the text the user typed, which
 * costs almost nothing to keep.
 *
 * So on a failed write we shed the heaviest, most-replaceable payload (images)
 * and try once more. Text survives; the user is told separately, by the missing
 * image showing up as missing rather than as a broken tag in the output.
 */
export function quotaSafe(backing: StateStorage): StateStorage {
  return {
    getItem: (name) => backing.getItem(name),
    removeItem: (name) => backing.removeItem(name),
    setItem: (name, value) => {
      try {
        backing.setItem(name, value);
        return;
      } catch {
        // fall through to the reduced write
      }
      try {
        const parsed = JSON.parse(value) as {
          state?: { tasks?: Array<{ assets?: Record<string, string> }> };
        };
        for (const t of parsed.state?.tasks ?? []) t.assets = {};
        backing.setItem(name, JSON.stringify(parsed));
      } catch {
        // Out of options. Keeping the previous snapshot beats crashing the app.
      }
    },
  };
}

/** Stand-in so the store can be constructed during SSR and in tests. */
export function memoryStorage(): StateStorage {
  const map = new Map<string, string>();
  return {
    getItem: (n) => map.get(n) ?? null,
    removeItem: (n) => void map.delete(n),
    setItem: (n, v) => void map.set(n, v),
  };
}
