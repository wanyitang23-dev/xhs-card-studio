import { describe, expect, it } from "vitest";
import { inlineAssets } from "@/lib/xhs/inline-assets";
import { previewHtml } from "@/lib/extract-html";
import { buildCoverPrompt, buildRenderPrompt } from "@/lib/xhs/prompts";
import type { XhsPage } from "@/lib/xhs/types";

/**
 * A cover came back truncated mid-base64 — the agent had been handed the whole
 * image as a data URL in the prompt and asked to copy it back out. Bytes now
 * stay out of the conversation entirely.
 */

const DATA = "data:image/jpeg;base64,/9j/4AAQSkZJRg";
const assets = { "asset:pic1": DATA };

describe("inlineAssets", () => {
  it("把 token 换成真实图片数据", () => {
    expect(inlineAssets(`<img src="asset:pic1">`, assets)).toBe(`<img src="${DATA}">`);
  });

  it("同一个 token 出现多次时全部替换", () => {
    const out = inlineAssets(`<img src="asset:pic1"><img src="asset:pic1">`, assets);
    expect(out.match(/data:image/g)).toHaveLength(2);
    expect(out).not.toContain("asset:pic1");
  });

  it("解析不到的 token 换成可见的占位图, 不留裸 token", () => {
    const out = inlineAssets(`<img src="asset:gone">`, assets);
    expect(out).not.toContain("asset:gone");
    expect(out).toContain("data:image/svg+xml");
    expect(decodeURIComponent(out)).toContain("图片已丢失");
  });

  it("没有 token 的文档原样返回", () => {
    const html = `<div class="card">没有图</div>`;
    expect(inlineAssets(html, assets)).toBe(html);
  });

  it("流式未完成的片段也能替换 — 没有可解析的 DOM 也不影响", () => {
    expect(inlineAssets(`<div><img src="asset:pic1"`, assets)).toContain(DATA);
  });

  it("连续调用结果稳定 (正则 lastIndex 不会串状态)", () => {
    const html = `<img src="asset:pic1">`;
    expect(inlineAssets(html, assets)).toBe(inlineAssets(html, assets));
  });

  it("assets 为空时不抛异常", () => {
    expect(() => inlineAssets(`<img src="asset:pic1">`, undefined)).not.toThrow();
  });
});

describe("previewHtml 串起来", () => {
  it("预览里拿到的是真实图片", () => {
    const doc = `<!DOCTYPE html><html><body><img src="asset:pic1"></body></html>`;
    expect(previewHtml(doc, assets)).toContain(DATA);
  });

  it("不传 assets 时退化成占位图, 而不是漏出 token", () => {
    const doc = `<!DOCTYPE html><html><body><img src="asset:pic1"></body></html>`;
    expect(previewHtml(doc)).not.toContain("asset:pic1");
  });
});

describe("prompt 里只出现短标记, 绝不出现图片字节", () => {
  const page = (ids: string[]): XhsPage => ({
    id: "p1",
    kind: "cover",
    title: "标题",
    body: "正文",
    imageAssetIds: ids,
    confirmed: true,
  });

  it("出成品 prompt 带 token 而非 base64", () => {
    const p = buildRenderPrompt({ pages: [page(["asset:pic1"])], skillBody: "模板" });
    expect(p).toContain("asset:pic1");
    expect(p).not.toContain("base64,/9j");
    expect(p).toContain("不要自己写 base64");
  });

  it("封面 prompt 带 token 而非 base64", () => {
    const p = buildCoverPrompt({
      title: "标题",
      body: "钩子",
      direction: "巨字标题",
      skillBody: "模板",
      images: ["asset:pic1"],
    });
    expect(p).toContain("asset:pic1");
    expect(p).not.toContain("base64,/9j");
  });

  it("封面 prompt 说明了为什么不许自己抄字节", () => {
    const p = buildCoverPrompt({
      title: "标题",
      body: "钩子",
      direction: "巨字标题",
      skillBody: "模板",
      images: ["asset:pic1"],
    });
    expect(p).toContain("你抄不完");
    expect(p).toContain("输出就被截断");
  });

  it("带一张图的 prompt 只多出几百字符, 而不是几十万", () => {
    const bare = buildRenderPrompt({ pages: [page([])], skillBody: "模板" });
    const withImg = buildRenderPrompt({
      pages: [page(["asset:pic1"])],
      skillBody: "模板",
      imageMeta: { "asset:pic1": { width: 1170, height: 2532 } },
    });
    // The old design put the whole data URL here — hundreds of thousands of
    // characters. The bound is loose enough for the token line plus the ratio
    // rule, and tight enough that inlined bytes could never fit under it.
    expect(withImg.length - bare.length).toBeLessThan(600);
  });
});
