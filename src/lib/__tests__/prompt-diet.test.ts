import { describe, expect, it } from "vitest";
import { buildCoverPrompt, buildRenderPrompt, buildOutlinePrompt } from "@/lib/xhs/prompts";
import type { XhsPage } from "@/lib/xhs/types";

/**
 * Guards for the prompt trim.
 *
 * Two halves: the sentences the extraction pipeline depends on must never be
 * lost, and the instructions that contradicted their own prompt must never
 * come back.
 */

const page = (i: number): XhsPage => ({
  id: "p" + i,
  kind: i === 1 ? "cover" : "content",
  title: "精排：广告的最后一轮判卷",
  body: "召回找广告",
  imageAssetIds: [],
  confirmed: true,
});

const cover = buildCoverPrompt({
  title: "标题",
  body: "钩子",
  direction: "巨字标题",
  skillBody: "模板",
});
const render = buildRenderPrompt({ pages: [page(1), page(2)], skillBody: "模板" });
const outline = buildOutlinePrompt({
  content: "文章",
  format: "markdown",
  pageCount: "auto",
  skillBody: "模板",
});

/** These are a contract with extractHtml, not style advice. */
const CONTRACT = [
  "禁止使用 Write / Edit / MultiEdit / Bash / Create / 任何文件系统工具",
  "直接把完整的 HTML 文档作为助手回复的正文流式输出",
  "`<!DOCTYPE html>` 开头",
  "不要用 markdown 代码围栏包裹",
  "第一个字符必须是",
];

describe("不能丢的东西还在", () => {
  for (const line of CONTRACT) {
    it(`封面与成品都保留: ${line.slice(0, 24)}…`, () => {
      expect(cover).toContain(line);
      expect(render).toContain(line);
    });
  }

  it("排版三条硬规则仍然在位", () => {
    for (const p of [cover, render]) {
      expect(p).toContain("中文排版硬规则");
      expect(p).toContain("卡片版式硬规则");
      expect(p).toContain("配色硬规则");
      expect(p).toContain("重叠硬规则");
    }
  });

  it("成品仍然锁死文字, 并保留可视化排版的指引", () => {
    expect(render).toContain("一个字都不许改");
    expect(render).toContain("数字、对比、步骤优先做成可视化结构");
    expect(render).toContain("文字本身依然一个字都不许改");
  });
});

describe("砍掉的矛盾不许回来", () => {
  it("封面和成品不再出现「由你决定出几张」这类指令", () => {
    // The cover is exactly one card and the render's pages are locked, so a
    // section telling the model to choose the count contradicts its own prompt.
    for (const p of [cover, render]) {
      expect(p).not.toContain("内容驱动数量");
      expect(p).not.toContain("完全由【用户内容】的实际长度和信息结构决定");
    }
  });

  it("「宁可多页」不再出现在任何 prompt 里", () => {
    // Removed from the paging rule after a 200-character post came back as
    // seven pages; it survived inside the shared directives until now.
    for (const p of [cover, render, outline]) {
      expect(p).not.toContain("宁可多页");
    }
  });

  it("成品不再要求「把原文提炼成短句」", () => {
    expect(render).not.toContain("把原文提炼成适合卡片阅读的短句");
    expect(render).not.toContain("每页正文控制在 60 字以内");
  });

  it("拆页那一步仍然保留提炼要求 — 那才是它的本职", () => {
    // The wording moved when the flat 60-character cap became a budget derived
    // from the source length (see outline-body-length.test.ts). The requirement
    // this guards is unchanged: the outline step condenses, and says by how
    // much. Only the sentence carrying it is different.
    expect(outline).toContain("提炼不等于丢信息");
    expect(outline).toMatch(/每页正文 \*\*\d+-\d+ 字\*\*/);
  });

  it("重复的规则只留一处", () => {
    // "no ch for width" and the CJK spacing rule each used to appear twice.
    const count = (s: string, sub: string) => s.split(sub).length - 1;
    expect(count(cover, "不要用 `ch` 单位限制中文宽度")).toBe(1);
    expect(count(cover, "中英文之间留半角空格")).toBe(1);
  });

  it("静态导出图用不上的条目已移除", () => {
    // Entrance animations can be captured mid-transition by the PNG export, and
    // a focus state has nothing to focus in an exported image.
    for (const p of [cover, render]) {
      expect(p).not.toContain("入场 fade-in");
      expect(p).not.toContain("重要交互有 focus 态");
    }
  });
});
