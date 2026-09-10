import { beforeEach, describe, expect, it } from "vitest";
import { footerRule, buildCoverPrompt, buildRenderPrompt } from "@/lib/xhs/prompts";
import { makeTask, useXhs } from "@/lib/xhs/store";
import type { XhsPage } from "@/lib/xhs/types";

/**
 * Nothing used to supply the footer's 作者名, so the agent invented one — six
 * different handles across six runs, three across one batch of covers.
 */

const page: XhsPage = {
  id: "p1",
  kind: "cover",
  title: "标题",
  body: "正文",
  imageAssetIds: [],
  confirmed: true,
};

describe("footerRule", () => {
  it("填了就要求原样使用", () => {
    const r = footerRule("产品复盘日记");
    expect(r).toContain("@产品复盘日记");
    expect(r).toContain("一个字都不要改");
    expect(r).toContain("不许改写");
  });

  it("用户手输的 @ 不会变成 @@", () => {
    expect(footerRule("@wanyi")).toContain("`@wanyi`");
    expect(footerRule("@wanyi")).not.toContain("@@");
    expect(footerRule("@@wanyi")).not.toContain("@@");
  });

  it("前后空格不影响", () => {
    expect(footerRule("  wanyi  ")).toContain("`@wanyi`");
  });

  it("留空时明确禁止编造账号", () => {
    const r = footerRule("");
    expect(r).toContain("不许编");
    expect(r).toContain("**不要编造任何账号名");
    expect(r).not.toContain("@产品");
  });

  it("留空时把页脚改成内容关键词, 而不是占位符", () => {
    const r = footerRule("   ");
    expect(r).toContain("内容关键词");
    expect(r).toContain("#关键词");
    // Placeholders are their own kind of fabrication.
    expect(r).toContain("@你的名字");
    expect(r).toContain("这类占位符");
  });

  it("undefined / null 走留空分支", () => {
    expect(footerRule(undefined)).toContain("不许编");
    expect(footerRule(null)).toContain("不许编");
  });
});

describe("handle 进 prompt", () => {
  const cover = (handle?: string) =>
    buildCoverPrompt({ title: "标题", body: "钩子", direction: "巨字标题", skillBody: "模板", handle });
  const render = (handle?: string) =>
    buildRenderPrompt({ pages: [page], skillBody: "模板", handle });

  it("封面和出成品都带上了署名规则", () => {
    expect(cover("wanyi")).toContain("@wanyi");
    expect(render("wanyi")).toContain("@wanyi");
  });

  it("没填时两个 prompt 都是禁止编造的那一版", () => {
    expect(cover()).toContain("不许编");
    expect(render()).toContain("不许编");
  });
});

describe("handle 存在任务里", () => {
  beforeEach(() => {
    localStorage.clear();
    const t = makeTask("任务 1");
    useXhs.setState({ tasks: [t], activeId: t.id, previewZoom: 0.5 });
  });

  it("默认是空串, 不是某个编出来的名字", () => {
    expect(useXhs.getState().tasks[0].handle).toBe("");
  });

  it("会被持久化, 刷新后还在", async () => {
    useXhs.getState().setHandle("wanyi");
    await Promise.resolve();
    const snap = JSON.parse(localStorage.getItem("xhs-anything") as string);
    expect(snap.state.tasks[0].handle).toBe("wanyi");
  });

  it("新建任务时沿用上一个任务的号 — 同一个人不会每篇换账号", () => {
    useXhs.getState().setHandle("wanyi");
    const id = useXhs.getState().addTask();
    const fresh = useXhs.getState().tasks.find((t) => t.id === id);
    expect(fresh?.handle).toBe("wanyi");
    // But the article itself must not be carried over.
    expect(fresh?.sourceText).toBe("");
  });
});
