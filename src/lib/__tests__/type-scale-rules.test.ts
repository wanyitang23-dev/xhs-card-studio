import { describe, expect, it } from "vitest";
import { buildCoverPrompt, buildRenderPrompt } from "@/lib/xhs/prompts";
import type { XhsPage } from "@/lib/xhs/types";

/**
 * The headline came back at body-text size on all three covers of one batch.
 * The prompt had two places telling the agent to shrink type when it did not
 * fit, both with no floor and both offering "reduce the font size" ahead of
 * "wrap the line" — which for a Chinese headline is exactly backwards.
 */

const page: XhsPage = {
  id: "p1",
  kind: "cover",
  title: "精排：广告的最后一轮判卷",
  body: "一条广告要过三关",
  imageAssetIds: [],
  confirmed: true,
};

const cover = buildCoverPrompt({
  title: page.title,
  body: page.body,
  direction: "巨字标题",
  skillBody: "模板",
});
const render = buildRenderPrompt({ pages: [page], skillBody: "模板" });

describe("字号规则", () => {
  it("放不下时优先换行, 而不是先缩字号", () => {
    for (const p of [cover, render]) {
      expect(p).toContain("放不下的第一手段是换行, 不是缩字号");
    }
  });

  it("不再规定标题字号下限 — 那条是误诊的产物", () => {
    // It was added believing the prompt had told the model to shrink type. The
    // headline was never small; Tailwind Preflight was overriding it, and
    // neutralizeTailwindPreflight fixes that in code. A speculative floor with
    // no evidence behind it is prompt weight for nothing.
    for (const p of [cover, render]) {
      expect(p).not.toContain("标题有字号下限");
      expect(p).not.toContain("≥86px");
    }
  });

  it("腾空间时主标题不在可压缩之列", () => {
    for (const p of [cover, render]) {
      expect(p).toContain("主标题不在可压缩之列");
    }
  });

  it("不再无条件地说「减字号或减内边距」", () => {
    // The old wording invited shrinking the headline along with everything else.
    for (const p of [cover, render]) {
      expect(p).not.toContain("内容偏多时**减字号或减内边距**");
    }
  });

  it("换行仍然是被允许的排版手段, 没有被前面的规则禁掉", () => {
    // An earlier rule bans mid-sentence <br>; these two must not contradict.
    expect(cover).toContain("中文标题折成两三行是正常排版");
    expect(cover).toContain("让浏览器自己断行");
  });
});
