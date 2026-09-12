"use client";

import { useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { streamSse } from "./sse-client";
import { activeTask, makePage, useXhs, type XhsTask } from "./store";
import type { Caption, PageKind } from "./types";
import { coverLabel, mergeCoverRun } from "./cover-directions";

/**
 * Drives the agent-backed steps.
 *
 * Every run captures the task id it started on and writes back through
 * `patchTask(id, …)`. That is what makes several articles safe to run at once:
 * the user can switch tasks mid-render and the output still lands on the task
 * that asked for it.
 *
 * Abort controllers are keyed by `${taskId}:${kind}` for the same reason —
 * cancelling one task must not stop another.
 */
export function useFlow() {
  const aborts = useRef<Map<string, AbortController>>(new Map());

  const abortKey = (taskId: string, kind: string) => `${taskId}:${kind}`;

  const start = useCallback((taskId: string, kind: string) => {
    const key = abortKey(taskId, kind);
    aborts.current.get(key)?.abort();
    const ctl = new AbortController();
    aborts.current.set(key, ctl);
    return ctl;
  }, []);

  const finish = useCallback((taskId: string, kind: string, ctl: AbortController) => {
    const key = abortKey(taskId, kind);
    if (aborts.current.get(key) === ctl) aborts.current.delete(key);
  }, []);

  /**
   * True while `ctl` is still the controller registered for this slot — i.e.
   * this run has *not* been superseded by a newer one.
   *
   * A superseded run must write nothing when its abort lands. Without this, the
   * losing run's `catch` fired after the winner had already set the tile to
   * "running" and stamped "已取消" over it, which wedged the tile: the winner's
   * own completion check (`if status === "running"`) then no longer matched, so
   * the tile stayed cancelled while its agent was still streaming. That is the
   * three-blank-cards-all-labelled-已取消 state.
   */
  const isCurrent = useCallback(
    (taskId: string, kind: string, ctl: AbortController) =>
      aborts.current.get(abortKey(taskId, kind)) === ctl,
    [],
  );

  /**
   * Stop everything in flight for one task.
   *
   * The entry is left in the map on purpose — `finish` removes it in the run's
   * own `finally`. Deleting it here would make `isCurrent` false for a run the
   * user deliberately cancelled, so the tile would never say so.
   */
  const cancel = useCallback((taskId?: string) => {
    const id = taskId ?? useXhs.getState().activeId;
    for (const [key, ctl] of aborts.current) {
      if (key.startsWith(`${id}:`)) ctl.abort();
    }
  }, []);

  /** Agent config from the shared top-bar store, plus a guard for "none picked". */
  const agentArgs = useCallback(() => {
    const s = useStore.getState();
    const agent = s.selectedAgent;
    if (!agent) throw new Error("请先在右上角选择一个 agent");
    const model = s.agentModels[agent];
    const binOverride = s.agentBinOverrides[agent]?.trim() || undefined;
    return {
      agent,
      ...(model && model !== "default" ? { model } : {}),
      ...(binOverride ? { binOverride } : {}),
    };
  }, []);

  /** Snapshot of the task a run targets, plus a bound patcher. */
  const target = useCallback(() => {
    const s = useXhs.getState();
    const task = activeTask(s);
    const patch = (p: Partial<XhsTask> | ((t: XhsTask) => Partial<XhsTask>)) =>
      useXhs.getState().patchTask(task.id, p);
    const read = () => useXhs.getState().tasks.find((t) => t.id === task.id);
    return { task, patch, read };
  }, []);

  /** ② Ask the agent to split the source into a page list. */
  const runOutline = useCallback(async () => {
    const { task, patch, read } = target();
    const ctl = start(task.id, "outline");
    patch({ log: [], outlineStatus: "running", outlineError: undefined });
    try {
      let got = false;
      await streamSse(
        "/api/outline",
        {
          ...agentArgs(),
          templateId: task.templateId,
          content: task.sourceText,
          format: task.format,
          pageCount: task.pageCount,
          outlineMode: task.outlineMode,
        },
        {
          onOutline: (raw) => {
            const list = raw as Array<{ kind: PageKind; title: string; body: string }>;
            patch({
              pages: list.map((p) => makePage(p.kind, p.title, p.body)),
              // Record what was asked for so step ② can flag a count the agent
              // did not honour, rather than silently reshaping the outline.
              requestedPages:
                typeof task.pageCount === "number" ? task.pageCount : null,
            });
            got = true;
          },
          onError: (m) => patch({ outlineStatus: "error", outlineError: m }),
        },
        ctl.signal,
      );
      const cur = read();
      if (got) patch({ outlineStatus: "done", step: "outline" });
      else if (cur?.outlineStatus !== "error") {
        patch({ outlineStatus: "error", outlineError: "agent 没有返回可用的分页大纲，请重试。" });
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        if (isCurrent(task.id, "outline", ctl)) patch({ outlineStatus: "idle" });
      }
      else patch({ outlineStatus: "error", outlineError: (err as Error)?.message ?? String(err) });
    } finally {
      finish(task.id, "outline", ctl);
    }
  }, [agentArgs, finish, isCurrent, start, target]);

  /**
   * ③ Generate cover candidates.
   *
   * Takes whichever directions the caller wants, so the UI can redo one tile
   * without discarding the other two. Each direction gets its own controller:
   * cancelling one must not kill the siblings, and they run concurrently
   * because three sequential runs would take three times as long.
   */
  const runCovers = useCallback(
    async (directions: string[]) => {
      const { task, patch, read } = target();
      const cover = task.pages[0];
      if (!cover) throw new Error("还没有分页，请先生成大纲");
      const args = agentArgs();

      // Reset only the tiles being regenerated; keep every other tile's html.
      patch((t) => ({
        covers: mergeCoverRun(t.covers, directions, (id) => ({
          id,
          label: coverLabel(id),
          html: "",
          status: "running" as const,
        })),
        // Only drop the selection if the selected tile is one being replaced.
        ...(t.selectedCoverId && directions.includes(t.selectedCoverId)
          ? { selectedCoverId: undefined }
          : {}),
      }));

      const patchCover = (id: string, p: Partial<import("./types").CoverCandidate>) =>
        patch((t) => ({ covers: t.covers.map((c) => (c.id === id ? { ...c, ...p } : c)) }));

      await Promise.all(
        directions.map(async (direction) => {
          const ctl = start(task.id, `cover:${direction}`);
          try {
            await streamSse(
              "/api/cover",
              {
                ...args,
                templateId: task.templateId,
                title: cover.title,
                body: cover.body,
                direction,
                handle: task.handle,
                // The cover page can carry an attachment too; step 3 used to
                // drop it because the endpoint had no field for it.
                //
                // Only the ids travel. The bytes are substituted in the browser
                // after generation, so uploading them here would be ~300 KB per
                // request, three times over, for data the server never reads.
                imageAssetIds: (cover.imageAssetIds ?? []).filter((id) => !!task.assets[id]),
                imageMeta: task.assetMeta,
              },
              {
                onDelta: (t) =>
                  patch((cur) => ({
                    covers: cur.covers.map((c) =>
                      c.id === direction ? { ...c, html: c.html + t } : c,
                    ),
                  })),
                // A file-write rescue replaces the accumulated text rather than
                // appending to it — same contract as the main pipeline.
                onHtml: (t) => patchCover(direction, { html: t }),
                onError: (m) => patchCover(direction, { status: "error", error: m }),
              },
              ctl.signal,
            );
            const c = read()?.covers.find((v) => v.id === direction);
            if (c?.status === "running") {
              patchCover(direction, {
                status: c.html.trim() ? "done" : "error",
                error: c.html.trim() ? undefined : "agent 没有返回内容",
              });
            }
          } catch (err) {
            if ((err as Error)?.name === "AbortError") {
              // Superseded by a newer run for this same tile — that run owns
              // the tile's state now, so say nothing.
              if (isCurrent(task.id, `cover:${direction}`, ctl)) {
                patchCover(direction, { status: "error", error: "已取消" });
              }
              return;
            }
            patchCover(direction, {
              status: "error",
              error: (err as Error)?.message ?? String(err),
            });
          } finally {
            finish(task.id, `cover:${direction}`, ctl);
          }
        }),
      );
    },
    [agentArgs, finish, isCurrent, start, target],
  );

  /** Stop one cover mid-flight, leaving the others running. */
  const cancelCover = useCallback((direction: string) => {
    const id = useXhs.getState().activeId;
    // Abort only; `finish` clears the entry. See `cancel` for why.
    aborts.current.get(`${id}:cover:${direction}`)?.abort();
  }, []);

  /** ④ Render the confirmed outline into the finished page. */
  const runRender = useCallback(async () => {
    const { task, patch, read } = target();
    const ctl = start(task.id, "render");
    patch({ finalHtml: "", renderStatus: "running", renderError: undefined });
    try {
      const cover = task.covers.find((c) => c.id === task.selectedCoverId);
      await streamSse(
        "/api/render",
        {
          ...agentArgs(),
          templateId: task.templateId,
          // Same as the cover step: ids only, bytes stay in the browser.
          pages: task.pages.map((p) => ({
            ...p,
            imageAssetIds: (p.imageAssetIds ?? []).filter((id) => !!task.assets[id]),
          })),
          handle: task.handle,
          imageMeta: task.assetMeta,
          ...(cover?.html ? { coverHtml: cover.html } : {}),
        },
        {
          onDelta: (t) => patch((cur) => ({ finalHtml: cur.finalHtml + t })),
          onHtml: (t) => patch({ finalHtml: t }),
          onError: (m) => patch({ renderStatus: "error", renderError: m }),
        },
        ctl.signal,
      );
      if (read()?.renderStatus !== "error") patch({ renderStatus: "done" });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        if (isCurrent(task.id, "render", ctl)) patch({ renderStatus: "idle" });
      }
      else patch({ renderStatus: "error", renderError: (err as Error)?.message ?? String(err) });
    } finally {
      finish(task.id, "render", ctl);
    }
  }, [agentArgs, finish, isCurrent, start, target]);

  /** ④-b Write the caption that goes beside the images. */
  const runCaption = useCallback(async () => {
    const { task, patch, read } = target();
    if (!task.pages.length) return;
    const ctl = start(task.id, "caption");
    patch({ captionStatus: "running", captionError: undefined });
    try {
      await streamSse(
        "/api/caption",
        { ...agentArgs(), pages: task.pages },
        {
          onCaption: (c) => patch({ caption: c as Caption }),
          onError: (m) => patch({ captionStatus: "error", captionError: m }),
        },
        ctl.signal,
      );
      const cur = read();
      if (cur?.captionStatus !== "error") {
        patch({
          captionStatus: cur?.caption ? "done" : "error",
          captionError: cur?.caption ? undefined : "agent 没有返回配文",
        });
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        if (isCurrent(task.id, "caption", ctl)) patch({ captionStatus: "idle" });
      }
      else patch({ captionStatus: "error", captionError: (err as Error)?.message ?? String(err) });
    } finally {
      finish(task.id, "caption", ctl);
    }
  }, [agentArgs, finish, isCurrent, start, target]);

  return { runOutline, runCovers, runRender, runCaption, cancelCover, cancel };
}
