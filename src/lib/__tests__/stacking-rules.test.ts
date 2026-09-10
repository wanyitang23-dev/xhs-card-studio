import { describe, expect, it } from "vitest";
import { buildCoverPrompt, buildRenderPrompt } from "@/lib/xhs/prompts";
import type { XhsPage } from "@/lib/xhs/types";

/**
 * A ledge card pulled onto a dark/light boundary with margin-top:-100px laid
 * out correctly and was then painted over by the slab above it. Measured: the
 * ledge occupied 537-679 while the slab ended at 637, and hit-testing at the
 * ledge's own centre returned the slab — a positioned sibling paints after a
 * static one, so 100px of the card was buried and only 42px showed.
 */

const page: XhsPage = {
  id: "p1",
  kind: "cover",
  title: "精排：广告的最后一轮判卷",
  body: "召回找广告，粗排快速淘汰",
  imageAssetIds: [],
  confirmed: true,
};

const prompts = {
  cover: buildCoverPrompt({
    title: page.title,
    body: page.body,
    direction: "色块分割",
    skillBody: "模板",
  }),
  render: buildRenderPrompt({ pages: [page], skillBody: "模板" }),
};

describe("重叠层级规则", () => {
  for (const [name, p] of Object.entries(prompts)) {
    it(`${name} prompt 要求负边距上提的块显式声明层级`, () => {
      expect(p).toContain("重叠硬规则");
      expect(p).toContain("position:relative");
      expect(p).toContain("z-index");
    });

    it(`${name} prompt 解释了为什么静态块会输给定位过的兄弟`, () => {
      expect(p).toContain("比普通静态块后画");
    });

    it(`${name} prompt 提醒 position:relative 的色块会盖住后面的内容`, () => {
      expect(p).toContain("会盖住后面所有没定位的兄弟内容");
    });
  }

  it("和「上深下浅用两个 flex 子项」那条规则并存, 没有互相矛盾", () => {
    // The stacking rule exists precisely because that rule pushes toward flow
    // plus negative margins; both must be present.
    expect(prompts.cover).toContain("让深色区是一个 flex 子项");
    expect(prompts.cover).toContain("重叠硬规则");
  });

  it("规则里带着实测数字, 不是空泛建议", () => {
    expect(prompts.cover).toContain("537-679");
    expect(prompts.cover).toContain("只露出底下 42px");
  });

  // The first version of the stacking rule produced a worse defect than the
  // one it fixed: told to raise content with position:relative, the model
  // wrote a blanket `.slab > *`, which also caught the two absolutely
  // positioned blobs and dropped them into flow. 460px + 380px of decoration
  // entered the layout, the dark slab grew from ~870px to 1708px inside a
  // 1440px card, and the entire light half fell off the bottom.
  for (const [name, p] of Object.entries(prompts)) {
    it(`${name} prompt 禁止用 .父容器 > * 一刀切地抬升内容`, () => {
      expect(p).toContain("不许用");
      expect(p).toContain("这种一刀切的写法去抬升内容");
    });

    it(`${name} prompt 说明一刀切会把装饰层拽回布局`, () => {
      expect(p).toContain("装饰球于是掉回正常流里占掉大片高度");
      expect(p).toContain("1708px");
    });

    it(`${name} prompt 给出了两种正确写法`, () => {
      expect(p).toContain("点名要抬升的元素");
      expect(p).toContain(".slab > .blob{ position:absolute }");
    });
  }
});
