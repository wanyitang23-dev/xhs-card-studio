import { describe, expect, it } from "vitest";
import { buildOutlinePrompt, buildRenderPrompt } from "@/lib/xhs/prompts";
import type { XhsPage } from "@/lib/xhs/types";

/**
 * A 2,600-character study note came back as nine one-line bullets: the formula
 * `A = R - V = 8 - 5 = 3` became "用 advantage 调整概率", and every first-person
 * aside was paraphrased into generic summary.
 *
 * The cause was a single flat rule — "每页正文控制在 60 字以内" — which is right
 * for a short post and wrong for a long one. The budget is now derived from the
 * source length in code, and four kinds of material are quoted rather than
 * restated.
 */

const outline = (content: string) =>
  buildOutlinePrompt({
    content,
    format: "纯文本",
    skillBody: "模板说明",
    pageCount: "auto",
  });

const short = outline("短".repeat(200));
const medium = outline("中".repeat(800));
const long = outline("长".repeat(2600));

describe("正文字数按原文长度分档", () => {
  it("短文案仍然是短句", () => {
    expect(short).toContain("40-80 字");
    expect(short).toContain("能用短语就不用整句");
    expect(short).not.toContain("120-220 字");
  });

  it("中等长度拿到中间档", () => {
    expect(medium).toContain("60-120 字");
    expect(medium).not.toContain("40-80 字");
    expect(medium).not.toContain("120-220 字");
  });

  it("长文拿到最宽的一档, 并且说明 120 是下限", () => {
    expect(long).toContain("120-220 字");
    expect(long).toContain("120 字是下限, 不是上限");
    expect(long).not.toContain("40-80 字");
  });

  it("字数写的是实际字符数, 不是模型自己估的", () => {
    expect(long).toContain("约 2600 字");
  });

  it("那条一刀切的 60 字上限已经不存在了", () => {
    for (const p of [short, medium, long]) {
      expect(p).not.toContain("每页正文控制在 60 字以内");
    }
  });

  it("字数下限不适用于封面和结尾", () => {
    expect(long).toContain("只约束 `content` 页");
    expect(long).toContain("不受字数下限约束");
  });

  /** 120-220 characters has to survive being laid out, not just requested. */
  it("上限留在一张 1080x1440 卡装得下的范围内", () => {
    const cap = Number(/(\d+)-(\d+) 字\*\*/.exec(long)?.[2]);
    expect(cap).toBe(220);
    expect(cap).toBeLessThan(390);
  });
});

describe("保留原文自己的句子", () => {
  it("点名四类必须原样保留的材料", () => {
    expect(long).toContain("公式、算式、推导");
    expect(long).toContain("连中间步骤一起留");
    expect(long).toContain("第一人称心得");
    expect(long).toContain("英文术语");
  });

  it("给了一条可执行的自检, 而不只是'写详细一点'", () => {
    expect(long).toContain("一样的信息");
    expect(long).toContain("而不是只知道");
  });

  /**
   * The layout instruction was moved to the render step, where the layout is
   * actually chosen. Left in the outline it read as permission to reduce a
   * derivation to one big number.
   */
  it("可视化结构那条已经从分页移到出稿", () => {
    expect(long).not.toContain("优先做成可视化结构");
    const page: XhsPage = {
      id: "p1",
      kind: "cover",
      title: "标题",
      body: "正文",
      imageAssetIds: [],
      confirmed: true,
    };
    expect(
      buildRenderPrompt({ pages: [page], skillBody: "模板说明" }),
    ).toContain("优先做成可视化结构");
  });
});

describe("多行正文", () => {
  it("分页这一步说明换行要写成 JSON 转义", () => {
    expect(long).toContain("JSON 转义");
  });

  it("出稿时多行正文的后续行会缩进, 不会看起来像新字段", () => {
    const page: XhsPage = {
      id: "p1",
      kind: "content",
      title: "PPO",
      body: "第一段\n第二段",
      imageAssetIds: [],
      confirmed: true,
    };
    const prompt = buildRenderPrompt({ pages: [page], skillBody: "模板说明" });
    expect(prompt).toContain("  正文: 第一段\n    第二段");
  });
});
