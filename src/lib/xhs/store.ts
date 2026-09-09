"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ContentMode, CoverCandidate, PageCountSetting, PageKind, XhsPage } from "./types";

/** Which of the four steps the user is on. */
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

type State = {
  step: Step;
  // ① source
  sourceText: string;
  format: string;
  mode: ContentMode;
  pageCount: PageCountSetting;
  templateId: string;
  // ② outline
  pages: XhsPage[];
  outlineStatus: FlowStatus;
  outlineError?: string;
  /** Exact page count asked for on the run that produced `pages`, if any. */
  requestedPages: number | null;
  // ③ cover
  covers: CoverCandidate[];
  selectedCoverId?: string;
  // ④ render
  finalHtml: string;
  renderStatus: FlowStatus;
  renderError?: string;
  /** `asset:<id>` → data URL, for screenshots attached to individual pages. */
  assets: Record<string, string>;
  /** Rolling progress log shown under the active step. */
  log: Array<{ ts: number; kind: string; text: string }>;

  setStep: (s: Step) => void;
  setSourceText: (t: string) => void;
  setFormat: (f: string) => void;
  setMode: (m: ContentMode) => void;
  setPageCount: (n: PageCountSetting) => void;
  setTemplateId: (id: string) => void;

  setPages: (p: XhsPage[]) => void;
  patchPage: (id: string, patch: Partial<XhsPage>) => void;
  addPageAfter: (id: string) => void;
  removePage: (id: string) => void;
  movePage: (id: string, dir: -1 | 1) => void;
  setOutlineStatus: (s: FlowStatus, err?: string) => void;
  setRequestedPages: (n: number | null) => void;

  setCovers: (c: CoverCandidate[]) => void;
  patchCover: (id: string, patch: Partial<CoverCandidate>) => void;
  selectCover: (id?: string) => void;

  setFinalHtml: (h: string) => void;
  appendFinalHtml: (chunk: string) => void;
  setRenderStatus: (s: FlowStatus, err?: string) => void;

  addAsset: (dataUrl: string) => string;
  pushLog: (kind: string, text: string) => void;
  clearLog: () => void;
  resetFlow: () => void;
};

const initial = {
  step: "source" as Step,
  sourceText: "",
  format: "text",
  mode: "condensed" as ContentMode,
  pageCount: "auto" as PageCountSetting,
  templateId: "card-xiaohongshu",
  pages: [] as XhsPage[],
  outlineStatus: "idle" as FlowStatus,
  requestedPages: null as number | null,
  covers: [] as CoverCandidate[],
  finalHtml: "",
  renderStatus: "idle" as FlowStatus,
  assets: {} as Record<string, string>,
  log: [] as Array<{ ts: number; kind: string; text: string }>,
};

export const useXhs = create<State>()(
  persist(
    (set, get) => ({
      ...initial,

      setStep: (step) => set({ step }),
      setSourceText: (sourceText) => set({ sourceText }),
      setFormat: (format) => set({ format }),
      setMode: (mode) => set({ mode }),
      setPageCount: (pageCount) => set({ pageCount }),
      setTemplateId: (templateId) => set({ templateId }),

      setPages: (pages) => set({ pages }),
      patchPage: (id, patch) =>
        set((s) => ({ pages: s.pages.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      addPageAfter: (id) =>
        set((s) => {
          const i = s.pages.findIndex((p) => p.id === id);
          if (i === -1) return s;
          const next = [...s.pages];
          next.splice(i + 1, 0, makePage("content"));
          return { pages: reseal(next) };
        }),
      removePage: (id) =>
        set((s) => {
          // Never let the deck fall below cover + ending.
          if (s.pages.length <= 2) return s;
          return { pages: reseal(s.pages.filter((p) => p.id !== id)) };
        }),
      movePage: (id, dir) =>
        set((s) => {
          const i = s.pages.findIndex((p) => p.id === id);
          const j = i + dir;
          if (i === -1 || j < 0 || j >= s.pages.length) return s;
          const next = [...s.pages];
          [next[i], next[j]] = [next[j], next[i]];
          return { pages: reseal(next) };
        }),
      setOutlineStatus: (outlineStatus, outlineError) => set({ outlineStatus, outlineError }),
      setRequestedPages: (requestedPages) => set({ requestedPages }),

      setCovers: (covers) => set({ covers }),
      patchCover: (id, patch) =>
        set((s) => ({ covers: s.covers.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      selectCover: (selectedCoverId) => set({ selectedCoverId }),

      setFinalHtml: (finalHtml) => set({ finalHtml }),
      appendFinalHtml: (chunk) => set((s) => ({ finalHtml: s.finalHtml + chunk })),
      setRenderStatus: (renderStatus, renderError) => set({ renderStatus, renderError }),

      addAsset: (dataUrl) => {
        const id = nid("a");
        set((s) => ({ assets: { ...s.assets, [`asset:${id}`]: dataUrl } }));
        return `asset:${id}`;
      },
      pushLog: (kind, text) =>
        set((s) => ({ log: [...s.log.slice(-200), { ts: Date.now(), kind, text }] })),
      clearLog: () => set({ log: [] }),
      resetFlow: () =>
        set({ ...initial, templateId: get().templateId, mode: get().mode, pageCount: get().pageCount }),
    }),
    {
      name: "xhs-anything",
      // Screenshots are data URLs and blow past the localStorage quota fast.
      // Everything else is small text the user would hate to lose on reload.
      partialize: (s) => ({
        step: s.step,
        sourceText: s.sourceText,
        format: s.format,
        mode: s.mode,
        pageCount: s.pageCount,
        templateId: s.templateId,
        pages: s.pages,
        selectedCoverId: s.selectedCoverId,
      }),
    },
  ),
);

/** Re-apply the cover / content / ending bookends after any reorder. */
function reseal(pages: XhsPage[]): XhsPage[] {
  return pages.map((p, i) => ({
    ...p,
    kind: i === 0 ? "cover" : i === pages.length - 1 ? "ending" : "content",
  }));
}
