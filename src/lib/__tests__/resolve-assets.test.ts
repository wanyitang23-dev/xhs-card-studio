import { describe, expect, it } from "vitest";
import { resolveAssets } from "@/lib/xhs/assets";
import { buildRenderPrompt, buildCoverPrompt } from "@/lib/xhs/prompts";
import type { XhsPage } from "@/lib/xhs/types";

const page = (over: Partial<XhsPage> = {}): XhsPage => ({
  id: "p1",
  kind: "content",
  title: "标题",
  body: "正文",
  imageAssetIds: [],
  confirmed: true,
  ...over,
});

describe("resolveAssets", () => {
  it("把 token 换成真正的图片数据", () => {
    const { pages, missing } = resolveAssets([page({ imageAssetIds: ["asset:a"] })], {
      "asset:a": "data:image/jpeg;base64,AAA",
    });
    expect(pages[0].imageAssetIds).toEqual(["data:image/jpeg;base64,AAA"]);
    expect(missing).toBe(0);
  });

  it("数据丢失的 token 被丢弃, 不会原样传给 agent", () => {
    const { pages, missing } = resolveAssets([page({ imageAssetIds: ["asset:gone"] })], {});
    expect(pages[0].imageAssetIds).toEqual([]);
    expect(missing).toBe(1);
    // The exact shape of the shipped bug: <img src="asset:amtufp3udd">
    expect(JSON.stringify(pages)).not.toContain("asset:gone");
  });

  it("一页里有的有有的没有时, 只保留能解析的那些", () => {
    const { pages, missing } = resolveAssets(
      [page({ imageAssetIds: ["asset:a", "asset:gone", "asset:b"] })],
      { "asset:a": "data:image/png;base64,A", "asset:b": "data:image/png;base64,B" },
    );
    expect(pages[0].imageAssetIds).toEqual(["data:image/png;base64,A", "data:image/png;base64,B"]);
    expect(missing).toBe(1);
  });

  it("空字符串也算丢失", () => {
    const { missing } = resolveAssets([page({ imageAssetIds: ["asset:a"] })], { "asset:a": "" });
    expect(missing).toBe(1);
  });

  it("没有配图的页原样通过", () => {
    const { pages, missing } = resolveAssets([page()], {});
    expect(pages[0].imageAssetIds).toEqual([]);
    expect(missing).toBe(0);
  });

  it("不改动标题正文等已定稿字段", () => {
    const { pages } = resolveAssets([page({ title: "锁定的标题", body: "锁定的正文" })], {});
    expect(pages[0].title).toBe("锁定的标题");
    expect(pages[0].body).toBe("锁定的正文");
  });
});

describe("卡片版式硬规则", () => {
  const rendered = buildRenderPrompt({ pages: [page()], skillBody: "模板正文" });
  const cover = buildCoverPrompt({
    title: "从 Badcase 里挖出的一次关键迭代",
    body: "不是拍脑袋提需求",
    direction: "巨字标题",
    skillBody: "模板正文",
  });

  it("出成品的 prompt 里禁止用猜出来的绝对坐标摆放文字", () => {
    expect(rendered).toContain("不许用手写坐标摆放");
    expect(rendered).toContain("position:absolute");
    expect(rendered).toContain("margin-top:auto");
  });

  it("封面 prompt 里也有同一条规则", () => {
    expect(cover).toContain("不许用手写坐标摆放");
  });

  it("中文排版规则仍然在位", () => {
    expect(rendered).toContain("字距不得为负");
    expect(cover).toContain("字距不得为负");
  });

  it("要求浅色文字被深色块包住, 而不是压在固定高度的背景上", () => {
    for (const p of [rendered, cover]) {
      expect(p).toContain("浅色文字必须放在深色块「内部」");
      expect(p).toContain("谁决定了文字的颜色, 谁就必须包住这段文字");
    }
  });

  it("装饰层豁免不再把背景色块算进去 — 否则两条规则互相打架", () => {
    // The first version listed 背景色块 as a decoration layer, which is the
    // exemption that let a white heading run off its dark block.
    expect(rendered).not.toContain("不含文字的装饰层** (背景色块");
    expect(rendered).toContain("一块托着白字的深色背景**不是**装饰层");
  });
});
