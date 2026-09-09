"use client";

import { useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { streamSse } from "./sse-client";
import { makePage, useXhs } from "./store";
import type { Caption, PageKind } from "./types";
import { coverLabel } from "./cover-directions";

/**
 * Drives the three agent-backed steps. Each returns when its stream ends;
 * `cancel()` aborts whatever is in flight.
 *
 * Agent / model / binary-override selection still lives in the original store
 * (shared with the top bar), so this hook reads it from there rather than
 * duplicating that state.
 */
export function useFlow() {
  const abortRef = useRef<AbortController | null>(null);
  const captionAbortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    captionAbortRef.current?.abort();
    captionAbortRef.current = null;
  }, []);

  /** Agent config from the shared top-bar store, plus a guard for "none picked". */
  const agentArgs = useCallback(() => {
    const s = useStore.getState();
    const agent = s.selectedAgent;
    if (!agent) throw new Error("请先在顶部选择一个 agent");
    const model = s.agentModels[agent];
    const binOverride = s.agentBinOverrides[agent]?.trim() || undefined;
    return {
      agent,
      ...(model && model !== "default" ? { model } : {}),
      ...(binOverride ? { binOverride } : {}),
    };
  }, []);

  const fresh = useCallback(() => {
    cancel();
    const ctl = new AbortController();
    abortRef.current = ctl;
    return ctl;
  }, [cancel]);

  /** ② Ask the agent to split the source into a page list. */
  const runOutline = useCallback(async () => {
    const x = useXhs.getState();
    const ctl = fresh();
    x.clearLog();
    x.setOutlineStatus("running", undefined);
    try {
      const args = agentArgs();
      let got = false;
      await streamSse(
        "/api/outline",
        {
          ...args,
          templateId: x.templateId,
          content: x.sourceText,
          format: x.format,
          mode: x.mode,
          pageCount: x.pageCount,
        },
        {
          onOutline: (raw) => {
            const list = raw as Array<{ kind: PageKind; title: string; body: string }>;
            const cur = useXhs.getState();
            cur.setPages(list.map((p) => makePage(p.kind, p.title, p.body)));
            // Record what was asked for so step ② can flag a count the agent
            // did not honour, rather than silently reshaping the outline.
            cur.setRequestedPages(typeof cur.pageCount === "number" ? cur.pageCount : null);
            got = true;
          },
          onMeta: (k, v) => useXhs.getState().pushLog("meta", `${k} = ${String(v)}`),
          onError: (m) => useXhs.getState().setOutlineStatus("error", m),
        },
        ctl.signal,
      );
      const cur = useXhs.getState();
      if (got) {
        cur.setOutlineStatus("done");
        cur.setStep("outline");
      } else if (cur.outlineStatus !== "error") {
        cur.setOutlineStatus("error", "agent 没有返回可用的分页大纲，请重试。");
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        useXhs.getState().setOutlineStatus("idle");
        return;
      }
      useXhs.getState().setOutlineStatus("error", (err as Error)?.message ?? String(err));
    }
  }, [agentArgs, fresh]);

  /**
   * ③ Generate every cover candidate at once.
   *
   * Concurrent rather than sequential: three covers back-to-back would take
   * three times as long for no benefit, and each spawns its own agent process
   * anyway. One shared AbortController cancels all of them together.
   */
  const runCovers = useCallback(async (directions: string[]) => {
    const x = useXhs.getState();
    const cover = x.pages[0];
    if (!cover) throw new Error("还没有分页，请先生成大纲");
    const ctl = fresh();
    const args = agentArgs();

    x.setCovers(
      directions.map((d) => ({ id: d, label: coverLabel(d), html: "", status: "running" as const })),
    );
    x.selectCover(undefined);

    await Promise.all(
      directions.map(async (direction) => {
        try {
          await streamSse(
            "/api/cover",
            {
              ...args,
              templateId: x.templateId,
              title: cover.title,
              body: cover.body,
              direction,
            },
            {
              onDelta: (t) =>
                useXhs.setState((s) => ({
                  covers: s.covers.map((c) =>
                    c.id === direction ? { ...c, html: c.html + t } : c,
                  ),
                })),
              // A file-write rescue replaces the accumulated text rather than
              // appending to it — same contract as the main pipeline.
              onHtml: (t) => useXhs.getState().patchCover(direction, { html: t }),
              onError: (m) =>
                useXhs.getState().patchCover(direction, { status: "error", error: m }),
            },
            ctl.signal,
          );
          const c = useXhs.getState().covers.find((v) => v.id === direction);
          if (c?.status === "running") {
            useXhs.getState().patchCover(direction, {
              status: c.html.trim() ? "done" : "error",
              error: c.html.trim() ? undefined : "agent 没有返回内容",
            });
          }
        } catch (err) {
          if ((err as Error)?.name === "AbortError") return;
          useXhs.getState().patchCover(direction, {
            status: "error",
            error: (err as Error)?.message ?? String(err),
          });
        }
      }),
    );
  }, [agentArgs, fresh]);

  /** ④ Render the confirmed outline into the finished page. */
  const runRender = useCallback(async () => {
    const x = useXhs.getState();
    const ctl = fresh();
    x.setFinalHtml("");
    x.setRenderStatus("running", undefined);
    try {
      const cover = x.covers.find((c) => c.id === x.selectedCoverId);
      await streamSse(
        "/api/render",
        {
          ...agentArgs(),
          templateId: x.templateId,
          pages: x.pages,
          mode: x.mode,
          assets: x.assets,
          ...(cover?.html ? { coverHtml: cover.html } : {}),
        },
        {
          onDelta: (t) => useXhs.getState().appendFinalHtml(t),
          onHtml: (t) => useXhs.getState().setFinalHtml(t),
          onMeta: (k, v) => useXhs.getState().pushLog("meta", `${k} = ${String(v)}`),
          onError: (m) => useXhs.getState().setRenderStatus("error", m),
        },
        ctl.signal,
      );
      const cur = useXhs.getState();
      if (cur.renderStatus !== "error") cur.setRenderStatus("done");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        useXhs.getState().setRenderStatus("idle");
        return;
      }
      useXhs.getState().setRenderStatus("error", (err as Error)?.message ?? String(err));
    }
  }, [agentArgs, fresh]);

  /** ④-b Write the caption that goes beside the images. */
  const runCaption = useCallback(async () => {
    const x = useXhs.getState();
    if (!x.pages.length) return;
    // Deliberately not sharing the render's AbortController: the caption is a
    // separate, cheap call and cancelling the render should not kill it.
    const ctl = new AbortController();
    captionAbortRef.current?.abort();
    captionAbortRef.current = ctl;
    x.setCaptionStatus("running", undefined);
    try {
      await streamSse(
        "/api/caption",
        { ...agentArgs(), pages: x.pages, mode: x.mode },
        {
          onCaption: (c) => useXhs.getState().setCaption(c as Caption),
          onError: (m) => useXhs.getState().setCaptionStatus("error", m),
        },
        ctl.signal,
      );
      const cur = useXhs.getState();
      if (cur.captionStatus !== "error") {
        cur.setCaptionStatus(cur.caption ? "done" : "error", cur.caption ? undefined : "agent 没有返回配文");
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        useXhs.getState().setCaptionStatus("idle");
        return;
      }
      useXhs.getState().setCaptionStatus("error", (err as Error)?.message ?? String(err));
    }
  }, [agentArgs]);

  return { runOutline, runCovers, runRender, runCaption, cancel };
}
