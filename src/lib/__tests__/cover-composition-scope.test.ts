import { describe, expect, it } from "vitest";
import { buildRenderPrompt } from "@/lib/xhs/prompts";
import { COVER_DIRECTIONS } from "@/lib/xhs/cover-directions";
import type { XhsPage } from "@/lib/xhs/types";

/**
 * A deck built on deck-xhs-white with the 色块分割 cover came back with the dark
 * slab on *every* page — all four cards carried `.slab`, against a SKILL.md that
 * specifies white content cards with macaron tiles and reserves the full dark
 * card for the ending page alone.
 *
 * The cause was one line of the render prompt: "后续内容页的视觉风格必须和封面保持
 * 同一套系统". It means the design system — palette, type, components — but a
 * model reads "同一套" as the layout too, and the only concrete instance of that
 * system in front of it is a single cover card dominated by a colour block. The
 * cover directions are composition devices by design (see cover-directions.ts:
 * "These steer *composition* only"), chosen for one card, so the render step has
 * to say which half of the cover travels and which half does not.
 *
 * The scoping is asserted in two places on purpose. The rule belongs with the
 * task rules, and it is restated beside the pasted cover HTML because that
 * markup is the most concrete and the last visual reference in the prompt — a
 * rule far from it loses to the thing being looked at.
 */

const pages: XhsPage[] = [
  { id: "p1", kind: "cover", title: "不止会用 AI", body: "还得有自己的观点", imageAssetIds: [], confirmed: true },
  { id: "p2", kind: "content", title: "工具会被抹平", body: "判断不会", imageAssetIds: [], confirmed: true },
  { id: "p3", kind: "ending", title: "观点才是护城河", body: "关注我", imageAssetIds: [], confirmed: true },
];

const coverHtml = `<div class="card"><div class="slab"><h1>不止会用 AI</h1></div></div>`;

const withCover = buildRenderPrompt({ pages, skillBody: "模板", coverHtml });
const withoutCover = buildRenderPrompt({ pages, skillBody: "模板" });

describe("封面构图不许扩散到内容页", () => {
  it("把「设计系统」和「版式」明确分开", () => {
    expect(withCover).toContain("同一套「设计系统」, 不是同一个「版式」");
  });

  it("列出要继承的东西 — 色值 / 字体 / 字号层级 / 组件", () => {
    expect(withCover).toContain("色板和具体色值");
    expect(withCover).toContain("字号层级");
    expect(withCover).toContain("组件写法");
  });

  it("点名不许复制的是构图本身, 并举出具体手法", () => {
    expect(withCover).toContain("不要复制到每一页的: 封面的构图本身");
    expect(withCover).toContain("大色块分割");
    expect(withCover).toContain("压在色块边界上");
  });

  it("把内容页指回模板自己的内容页版式", () => {
    // Otherwise "don't copy the cover" leaves no answer for what to do instead.
    expect(withCover).toContain("模板说明和参考实现里内容页本来的版式");
  });

  it("深色整卡这类重手法留给模板指定的那一页", () => {
    expect(withCover).toContain("只用在模板本来就这么规定的那一页");
  });

  it("保留了「为什么」 — 否则这条规则只是一句禁令", () => {
    expect(withCover).toContain("单独");
    expect(withCover).toContain("同一张图重复");
  });

  it("在封面 HTML 紧邻处重申一次作用范围", () => {
    const marker = "这张卡的构图只属于第 1 页";
    expect(withCover).toContain(marker);
    // Beside the markup, not merely somewhere in the prompt.
    expect(withCover.indexOf(marker)).toBeLessThan(withCover.indexOf(coverHtml));
    expect(withCover.indexOf(coverHtml) - withCover.indexOf(marker)).toBeLessThan(200);
  });

  it("没有定稿封面时不会冒出一个不存在的封面来说事", () => {
    expect(withoutCover).not.toContain("这张卡的构图只属于第 1 页");
    // The system-vs-layout rule is about the deck itself, so it still applies.
    expect(withoutCover).toContain("同一套「设计系统」, 不是同一个「版式」");
  });

  it("三个封面方向都只讲构图, 不指定配色 — 这正是它们不该扩散的前提", () => {
    /**
     * The premise of the rule above: a direction is a composition device, so
     * the palette it happens to render in is the skill's, not the direction's,
     * and there is nothing palette-shaped to "inherit from the cover" beyond
     * what the template already said.
     *
     * Only palette-prescribing words count. 色块 (split-block's own device) and
     * 字体 (big-type leaning on the typeface's presence) are compositional and
     * must not trip this.
     */
    for (const d of Object.values(COVER_DIRECTIONS)) {
      expect(d.text).not.toMatch(/配色|色板|色值|#[0-9a-fA-F]{3,6}\b/);
    }
  });
});
