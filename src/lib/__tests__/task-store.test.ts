import { beforeEach, describe, expect, it } from "vitest";
import { activeTask, deriveName, makeTask, useXhs } from "@/lib/xhs/store";

const reset = () => {
  const t = makeTask("任务 1");
  useXhs.setState({ tasks: [t], activeId: t.id, previewZoom: 0.5 });
};

beforeEach(reset);
const s = () => useXhs.getState();

describe("task management", () => {
  it("adds a task and makes it active", () => {
    const id = s().addTask();
    expect(s().tasks).toHaveLength(2);
    expect(s().activeId).toBe(id);
  });

  it("carries the template over to a new task", () => {
    s().setTemplateId("deck-xhs-white");
    s().addTask();
    expect(activeTask(s()).templateId).toBe("deck-xhs-white");
    // …but not the article itself
    expect(activeTask(s()).sourceText).toBe("");
  });

  it("selects a neighbour when the active task is removed", () => {
    const a = s().activeId;
    const b = s().addTask();
    s().selectTask(a);
    s().removeTask(a);
    expect(s().tasks).toHaveLength(1);
    expect(s().activeId).toBe(b);
  });

  it("keeps a non-active task's selection when another is removed", () => {
    const a = s().activeId;
    s().addTask();
    const c = s().addTask();
    s().removeTask(a);
    expect(s().activeId).toBe(c);
  });

  it("never leaves the app with zero tasks", () => {
    s().removeTask(s().activeId);
    expect(s().tasks).toHaveLength(1);
    expect(activeTask(s())).toBeTruthy();
  });
});

describe("per-task isolation", () => {
  it("keeps each task's flow state separate", () => {
    s().setSourceText("第一篇");
    const a = s().activeId;
    s().addTask();
    s().setSourceText("第二篇");
    expect(s().tasks.find((t) => t.id === a)!.sourceText).toBe("第一篇");
    expect(activeTask(s()).sourceText).toBe("第二篇");
  });

  it("patchTask writes to the named task even when another is active", () => {
    const a = s().activeId;
    s().addTask();
    // Simulates a stream landing after the user switched tasks.
    s().patchTask(a, { renderStatus: "done", finalHtml: "<html>A</html>" });
    expect(s().tasks.find((t) => t.id === a)!.finalHtml).toBe("<html>A</html>");
    expect(activeTask(s()).finalHtml).toBe("");
  });

  it("edits pages on the active task only", () => {
    s().setPages([
      { id: "p1", kind: "cover", title: "封面", body: "", imageAssetIds: [], confirmed: false },
      { id: "p2", kind: "ending", title: "结尾", body: "", imageAssetIds: [], confirmed: false },
    ]);
    const a = s().activeId;
    s().addTask();
    expect(activeTask(s()).pages).toHaveLength(0);
    expect(s().tasks.find((t) => t.id === a)!.pages).toHaveLength(2);
  });

  it("resetFlow clears one task without touching the others", () => {
    s().setSourceText("保留我");
    const a = s().activeId;
    s().addTask();
    s().setSourceText("清掉我");
    s().resetFlow();
    expect(activeTask(s()).sourceText).toBe("");
    expect(s().tasks.find((t) => t.id === a)!.sourceText).toBe("保留我");
  });
});

describe("deriveName", () => {
  it("uses the first meaningful line and strips markdown heading marks", () => {
    expect(deriveName("# 我的三个写作习惯\n正文", "任务 1")).toBe("我的三个写作习惯");
    expect(deriveName("\n\n  正文开头  \n", "任务 1")).toBe("正文开头");
  });

  it("truncates a long line", () => {
    expect(deriveName("一".repeat(40), "任务 1")).toBe("一".repeat(18) + "…");
  });

  it("falls back when there is nothing to name it after", () => {
    expect(deriveName("   \n \n", "任务 3")).toBe("任务 3");
  });

  it("renames the task as the article is pasted", () => {
    s().setSourceText("# 广告排序三部曲");
    expect(activeTask(s()).name).toBe("广告排序三部曲");
  });

  it("stops auto-renaming once the user names it by hand", () => {
    s().renameTask(s().activeId, "我自己起的名");
    s().setSourceText("# 一个完全不同的标题");
    expect(activeTask(s()).name).toBe("我自己起的名");
  });
});
