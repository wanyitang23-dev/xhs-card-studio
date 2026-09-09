import { beforeEach, describe, expect, it } from "vitest";
import { makeTask, useXhs } from "@/lib/xhs/store";

/**
 * The end-to-end shape of the bug the user hit: attach a screenshot, reload,
 * generate — and the card came out with `<img src="asset:amtufp3udd">`.
 *
 * `pages[].imageAssetIds` was persisted while `assets` was not, so after a
 * reload every token pointed at nothing.
 */

const KEY = "xhs-anything";

beforeEach(() => {
  localStorage.clear();
  const t = makeTask("任务 1");
  useXhs.setState({ tasks: [t], activeId: t.id, previewZoom: 0.5 });
});

/** What zustand actually wrote to storage. */
function persisted() {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as { state: { tasks: Array<Record<string, unknown>> } }) : null;
}

describe("配图跨刷新存活", () => {
  it("assets 和引用它的 token 一起被写进 localStorage", async () => {
    const s = useXhs.getState();
    const key = s.addAsset("data:image/jpeg;base64,AAAA");
    const pageId = useXhs.getState().tasks[0].pages[0]?.id;
    if (pageId) useXhs.getState().patchPage(pageId, { imageAssetIds: [key] });

    // zustand writes synchronously on each set(); give the microtask queue a turn.
    await Promise.resolve();

    const snap = persisted();
    expect(snap).not.toBeNull();
    const task = snap!.state.tasks[0];
    expect(task.assets).toMatchObject({ [key]: "data:image/jpeg;base64,AAAA" });
  });

  it("token 和图片数据不会一个存一个丢", async () => {
    const s = useXhs.getState();
    const key = s.addAsset("data:image/png;base64,BBBB");
    await Promise.resolve();

    const task = persisted()!.state.tasks[0];
    const assets = task.assets as Record<string, string>;
    const pages = task.pages as Array<{ imageAssetIds: string[] }>;
    // Every token that survived the write must still resolve.
    for (const p of pages) {
      for (const id of p.imageAssetIds ?? []) expect(assets[id]).toBeTruthy();
    }
    expect(assets[key]).toBe("data:image/png;base64,BBBB");
  });
});
