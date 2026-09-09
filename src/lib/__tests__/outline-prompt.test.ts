import { describe, expect, it } from "vitest";
import { buildOutlinePrompt } from "@/lib/xhs/prompts";

const base = {
  content: "# 4 张图讲清楚 AI 知识库\n同一个模型，为什么有人用得准？",
  format: "markdown",
  skillBody: "【模板: 测试】",
};

describe("buildOutlinePrompt · page count", () => {
  it("tells the agent to obey a count written in the copy itself", () => {
    const p = buildOutlinePrompt({ ...base, pageCount: "auto" });
    expect(p).toContain("如果【用户内容】里写了张数, 就用那个数");
  });

  it("tells the agent not to pad short content", () => {
    const p = buildOutlinePrompt({ ...base, pageCount: "auto" });
    expect(p).toContain("内容短就少分页, 不要硬凑");
    expect(p).toContain("短文案做成 3-5 页很正常");
  });

  it("no longer pushes one-point-per-page in auto mode", () => {
    const p = buildOutlinePrompt({ ...base, pageCount: "auto" });
    // The rule that turned a 200-char post into 7 pages.
    expect(p).not.toContain("一页只承载一个核心观点");
    expect(p).not.toContain("宁可多分几页");
  });

  it("states an exact target when the user fixed a count", () => {
    const p = buildOutlinePrompt({ ...base, pageCount: 4 });
    expect(p).toContain("总页数必须正好是 4 页, 含封面和结尾");
    expect(p).toContain("`pages` 数组的长度必须等于 4");
    // the auto-only guidance must not leak in
    expect(p).not.toContain("页数由你判断");
  });

  it("counts cover and ending toward the total in both branches", () => {
    for (const pageCount of ["auto", 6] as const) {
      expect(buildOutlinePrompt({ ...base, pageCount })).toContain("封面和结尾都算在总页数里");
    }
  });

});
