import { describe, expect, it } from "vitest";
import { exampleReferenceBlock, trimExample, MAX_EXAMPLE_CHARS } from "@/lib/xhs/example-ref";
import { buildCoverPrompt, buildRenderPrompt } from "@/lib/xhs/prompts";
import type { XhsPage } from "@/lib/xhs/types";

/**
 * The template's `example.html` used to reach the browser only — the gallery
 * and the preview pane. Users picked a look they were never going to get,
 * because the agent saw `SKILL.md`'s prose alone.
 */

const page: XhsPage = {
  id: "p1",
  kind: "cover",
  title: "标题",
  body: "正文",
  imageAssetIds: [],
  confirmed: true,
};

const EXAMPLE = `<!DOCTYPE html><html><head><style>.macaron{border-radius:26px;background:#ffd8c2}</style></head><body><div class="card macaron">示例文案：睡前刷手机</div></body></html>`;

describe("trimExample", () => {
  it("在上限内的示例原样保留", () => {
    expect(trimExample(EXAMPLE)).toBe(EXAMPLE);
  });

  it("五个内置模板都在上限内", () => {
    // The largest built-in is ~30 KB; the cap exists for user uploads.
    expect(MAX_EXAMPLE_CHARS).toBeGreaterThan(30_000);
  });

  it("超长时保留完整样式系统, 丢掉冗长的结构", () => {
    const huge = `<style>.a{color:red}</style><body>${"<div>填充</div>".repeat(20000)}</body>`;
    expect(huge.length).toBeGreaterThan(MAX_EXAMPLE_CHARS);
    const out = trimExample(huge);
    expect(out).toContain(".a{color:red}");
    expect(out).toContain("只保留了完整的样式系统");
    expect(out.length).toBeLessThan(MAX_EXAMPLE_CHARS);
  });

  it("连样式本身都超长时硬截断而不是整块丢弃", () => {
    const out = trimExample(`<style>${"a".repeat(200_000)}</style>`, 1000);
    expect(out.length).toBeLessThanOrEqual(1000 + 32);
    expect(out).toContain("示例被截断");
  });

  it("空示例产出空串, 不往 prompt 里塞空壳", () => {
    expect(trimExample("")).toBe("");
    expect(trimExample("   ")).toBe("");
    expect(exampleReferenceBlock(undefined)).toBe("");
    expect(exampleReferenceBlock("")).toBe("");
  });
});

describe("example 进 prompt", () => {
  const cover = buildCoverPrompt({
    title: "标题",
    body: "副标题",
    direction: "巨字标题",
    skillBody: "模板正文",
    exampleHtml: EXAMPLE,
  });
  const render = buildRenderPrompt({
    pages: [page],
    skillBody: "模板正文",
    exampleHtml: EXAMPLE,
  });

  it("封面 prompt 里带上了示例的真实 CSS", () => {
    expect(cover).toContain(".macaron{border-radius:26px");
    expect(cover).toContain("成品必须看起来是同一套模板");
  });

  it("出成品 prompt 里也带上了", () => {
    expect(render).toContain(".macaron{border-radius:26px");
  });

  it("明确区分「照搬视觉」和「不要照搬文案」", () => {
    for (const p of [cover, render]) {
      expect(p).toContain("要照搬的");
      expect(p).toContain("不要照搬的");
      expect(p).toContain("它的文案、它的页数");
    }
  });

  it("没有示例的模板不会多出一段空指令", () => {
    const bare = buildCoverPrompt({
      title: "标题",
      body: "",
      direction: "巨字标题",
      skillBody: "模板正文",
    });
    expect(bare).not.toContain("成品必须看起来是同一套模板");
  });
});
