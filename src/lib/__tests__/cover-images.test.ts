import { describe, expect, it } from "vitest";
import { resolveIds } from "@/lib/xhs/assets";
import { buildCoverPrompt, buildRenderPrompt } from "@/lib/xhs/prompts";
import type { XhsPage } from "@/lib/xhs/types";

/**
 * A screenshot attached to page 1 showed in the outline and then never
 * appeared: `/api/cover` had no field for images at all, so the cover step
 * received title, body, direction and handle and nothing else.
 */

const DATA = "data:image/jpeg;base64,AAAA";

const page = (over: Partial<XhsPage> = {}): XhsPage => ({
  id: "p1",
  kind: "cover",
  title: "精排：广告的最后一轮判卷",
  body: "召回找广告",
  imageAssetIds: [],
  confirmed: true,
  ...over,
});

describe("resolveIds", () => {
  it("把 token 换成图片数据", () => {
    expect(resolveIds(["asset:a"], { "asset:a": DATA })).toEqual({ images: [DATA], missing: 0 });
  });

  it("解析不到的 token 被丢弃并计数", () => {
    expect(resolveIds(["asset:gone"], {})).toEqual({ images: [], missing: 1 });
  });

  it("没有配图时返回空", () => {
    expect(resolveIds(undefined, {})).toEqual({ images: [], missing: 0 });
    expect(resolveIds([], {})).toEqual({ images: [], missing: 0 });
  });
});

describe("封面 prompt 带上配图", () => {
  const withImg = buildCoverPrompt({
    title: "标题",
    body: "钩子",
    direction: "巨字标题",
    skillBody: "模板",
    images: [DATA],
  });

  it("图片数据真的进了 prompt", () => {
    expect(withImg).toContain(DATA);
    expect(withImg).toContain("必须真的出现在卡片里");
  });

  it("要求原样使用 src, 不许换成占位图或背景图", () => {
    expect(withImg).toContain("不要改成占位图");
    expect(withImg).toContain("不要换成 CSS 背景");
  });

  it("要求给配图真实版面, 而不是缩成小图标", () => {
    expect(withImg).toContain("不要缩成角落里的小图标");
    expect(withImg).toContain("图片区域和文字区域不要互相压盖");
  });

  it("没有配图时不会多出一段空指令", () => {
    const bare = buildCoverPrompt({
      title: "标题",
      body: "钩子",
      direction: "巨字标题",
      skillBody: "模板",
    });
    expect(bare).not.toContain("必须真的出现在卡片里");
  });
});

describe("出成品 prompt 不再自相矛盾", () => {
  const cover = "<!DOCTYPE html><html><body><div class='card'>封面</div></body></html>";

  it("封面已定稿且第 1 页有配图时, 明确写出例外", () => {
    const p = buildRenderPrompt({
      pages: [page({ imageAssetIds: [DATA] }), page({ id: "p2", kind: "content" })],
      skillBody: "模板",
      coverHtml: cover,
    });
    expect(p).toContain("第 1 页列出的配图必须出现在这张卡上");
    expect(p).toContain("沿用设计不等于丢掉用户的图");
  });

  it("第 1 页没有配图时不加这段例外", () => {
    const p = buildRenderPrompt({ pages: [page()], skillBody: "模板", coverHtml: cover });
    expect(p).toContain("封面已定稿");
    expect(p).not.toContain("沿用设计不等于丢掉用户的图");
  });

  it("没有定稿封面时也不加", () => {
    const p = buildRenderPrompt({ pages: [page({ imageAssetIds: [DATA] })], skillBody: "模板" });
    expect(p).not.toContain("沿用设计不等于丢掉用户的图");
  });
});
