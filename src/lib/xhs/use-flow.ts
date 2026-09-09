"use client";

import { useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { streamSse } from "./sse-client";
import { makePage, useXhs } from "./store";
import type { PageKind } from "./types";
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

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
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
        },
        {
          onOutline: (raw) => {
            const list = raw as Array<{ kind: PageKind; title: string; body: string }>;
            useXhs.getState().setPages(list.map((p) => makePage(p.kind, p.title, p.body)));
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

  return { runOutline, runCovers, runRender, cancel };
}
