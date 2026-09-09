import { describe, expect, it } from "vitest";
import { normalizeCaption } from "@/app/api/caption/route";

const pages = [{ title: "广告系统 · 排序三部曲" }, { title: "召回" }];

describe("normalizeCaption", () => {
  it("keeps a well-formed caption", () => {
    const c = normalizeCaption({ title: "3 分钟看懂广告排序", body: "正文", tags: ["广告", "算法"] }, pages);
    expect(c).toEqual({ title: "3 分钟看懂广告排序", body: "正文", tags: ["广告", "算法"] });
  });

  it("strips a leading # the model added anyway", () => {
    expect(normalizeCaption({ title: "t", body: "b", tags: ["#广告", "##算法"] }, pages)?.tags)
      .toEqual(["广告", "算法"]);
  });

  it("drops duplicate and empty tags", () => {
    expect(normalizeCaption({ title: "t", body: "b", tags: ["广告", "广告", "  ", "#广告", "算法"] }, pages)?.tags)
      .toEqual(["广告", "算法"]);
  });

  it("caps the tag count", () => {
    const many = Array.from({ length: 20 }, (_, i) => `t${i}`);
    expect(normalizeCaption({ title: "t", body: "b", tags: many }, pages)?.tags).toHaveLength(10);
  });

  it("falls back to the cover card's title when none is returned", () => {
    expect(normalizeCaption({ body: "b", tags: [] }, pages)?.title).toBe("广告系统 · 排序三部曲");
  });

  it("survives non-string junk in every field", () => {
    const c = normalizeCaption({ title: 42, body: null, tags: [1, {}, "真标签"] } as never, pages);
    expect(c).toEqual({ title: "广告系统 · 排序三部曲", body: "", tags: ["真标签"] });
  });

  it("returns null when nothing usable came back and there is no fallback", () => {
    expect(normalizeCaption(null, [])).toBeNull();
    expect(normalizeCaption({ title: "", body: "", tags: [] }, [])).toBeNull();
  });
});
