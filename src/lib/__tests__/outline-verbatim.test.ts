import { describe, expect, it } from "vitest";
import { buildOutlinePrompt } from "@/lib/xhs/prompts";
import { estimateVerbatimPages, MAX_PAGES, VERBATIM_PAGE_CHARS } from "@/lib/xhs/types";

/**
 * A second paging mode: split the user's text, do not rewrite it. The default
 * mode condenses, which is right for a draft and wrong for copy the user
 * already wrote deliberately.
 *
 * The two modes differ in more than tone. With the words fixed, the agent
 * cannot make a page fit by writing less, so the character budget becomes a
 * hard cut-point rule, and an exact page count becomes unsatisfiable.
 */

const build = (mode: "condense" | "verbatim", chars = 2600, pageCount: "auto" | number = "auto") =>
  buildOutlinePrompt({
    content: "字".repeat(chars),
    format: "纯文本",
    skillBody: "模板说明",
    pageCount,
    mode,
  });

describe("原文模式", () => {
  const v = build("verbatim");

  it("禁止一切改写, 不只是'尽量保留'", () => {
    expect(v).toContain("一个字都不许改");
    expect(v).toContain("不许概括");
    expect(v).toContain("不许把两个不相邻的句子拼到一起");
  });

  it("断页位置有明确规则, 不是随便断", () => {
    expect(v).toContain(`每页 ${VERBATIM_PAGE_CHARS} 字以内`);
    expect(v).toContain("不要在句子中间断");
  });

  it("要求拼回去等于原文 — 这是'没漏内容'的可检验说法", () => {
    expect(v).toContain("应该还原出原文");
  });

  it("标题只能摘原话, 挑不出就留空", () => {
    expect(v).toContain("只能从这一页的正文里摘一个片段");
    expect(v).toContain("title 留空");
  });

  it("结尾不编行动号召", () => {
    expect(v).toContain("不要额外编一句行动号召");
  });

  it("不再要求精简 — 那是另一个模式的工作", () => {
    expect(v).not.toContain("提炼不等于丢信息");
    expect(v).not.toContain("120-220 字");
  });
});

describe("固定张数和'一字不改'互相矛盾", () => {
  /**
   * The only lever for hitting a count is writing more or less, and verbatim
   * mode removes it. Half-honouring the count would mean dropping text, so the
   * count is dropped instead — and the prompt says so rather than leaving the
   * agent to pick a side.
   */
  it("原文模式下忽略界面设的张数, 并说明原因", () => {
    const v = build("verbatim", 2600, 6);
    expect(v).toContain("忽略它");
    expect(v).not.toContain("总页数必须正好是 6 页");
  });

  it("精简模式下固定张数照常生效", () => {
    expect(build("condense", 2600, 6)).toContain("总页数必须正好是 6 页");
  });

  it("装不下时不许删内容", () => {
    expect(build("verbatim")).toContain("不要删内容");
  });
});

describe("默认不变", () => {
  it("不传 mode 就是精简提炼 — 老调用方行为不变", () => {
    const plain = buildOutlinePrompt({
      content: "字".repeat(2600),
      format: "纯文本",
      skillBody: "模板说明",
      pageCount: "auto",
    });
    expect(plain).toBe(build("condense"));
    expect(plain).toContain("120-220 字");
  });
});

describe("能不能装得下是算术, 不是判断题", () => {
  it("页数估算含封面和结尾", () => {
    expect(estimateVerbatimPages(VERBATIM_PAGE_CHARS * 5)).toBe(7);
  });

  it("空内容也给得出最小页数", () => {
    expect(estimateVerbatimPages(0)).toBe(2);
  });

  it("超长原文会算出超过上限的页数, 界面据此提前警告", () => {
    expect(estimateVerbatimPages(VERBATIM_PAGE_CHARS * (MAX_PAGES + 5))).toBeGreaterThan(MAX_PAGES);
  });

  it("提示里的页数和估算一致", () => {
    expect(build("verbatim", 3500)).toContain(`${estimateVerbatimPages(3500)} 页左右`);
  });
});
