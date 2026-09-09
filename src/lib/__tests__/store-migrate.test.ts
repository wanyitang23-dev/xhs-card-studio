import { describe, expect, it } from "vitest";
import { migrateV0 } from "@/lib/xhs/store";

/** Exactly what v0's partialize wrote to localStorage. */
const v0 = {
  step: "outline",
  sourceText: "# 广告排序三部曲\n召回、粗排、精排",
  format: "markdown",
  pageCount: 6,
  templateId: "deck-xhs-white",
  previewZoom: 0.75,
  pages: [
    { id: "p1", kind: "cover", title: "封面", body: "", imageAssetIds: [], confirmed: true },
    { id: "p2", kind: "ending", title: "结尾", body: "", imageAssetIds: [], confirmed: true },
  ],
  selectedCoverId: "big-type",
};

type Migrated = ReturnType<typeof migrateV0>;

describe("migrateV0", () => {
  it("wraps the old single flow into one task instead of discarding it", () => {
    const out = migrateV0(v0, 0) as Migrated;
    expect(out.tasks).toHaveLength(1);
    const t = out.tasks[0];
    expect(t.sourceText).toBe(v0.sourceText);
    expect(t.pages).toHaveLength(2);
    expect(t.templateId).toBe("deck-xhs-white");
    expect(t.pageCount).toBe(6);
    expect(t.step).toBe("outline");
    expect(t.selectedCoverId).toBe("big-type");
  });

  it("names the recovered task after the article", () => {
    expect((migrateV0(v0, 0) as Migrated).tasks[0].name).toBe("广告排序三部曲");
  });

  it("makes the recovered task active", () => {
    const out = migrateV0(v0, 0) as Migrated;
    expect(out.activeId).toBe(out.tasks[0].id);
  });

  it("keeps the saved zoom, and defaults it when absent", () => {
    expect((migrateV0(v0, 0) as Migrated).previewZoom).toBe(0.75);
    const { previewZoom: _drop, ...noZoom } = v0;
    expect((migrateV0(noZoom, 0) as Migrated).previewZoom).toBe(0.5);
  });

  it("fills defaults for fields v0 never stored", () => {
    const t = (migrateV0(v0, 0) as Migrated).tasks[0];
    expect(t.finalHtml).toBe("");
    expect(t.covers).toEqual([]);
    expect(t.assets).toEqual({});
    expect(t.renderStatus).toBe("idle");
  });

  it("survives a half-empty v0 blob", () => {
    const out = migrateV0({ templateId: "card-xiaohongshu" }, 0) as Migrated;
    expect(out.tasks).toHaveLength(1);
    expect(out.tasks[0].templateId).toBe("card-xiaohongshu");
    expect(out.tasks[0].sourceText).toBe("");
    expect(out.tasks[0].name).toBe("任务 1");
  });

  it("passes v1 state through untouched", () => {
    const v1 = { tasks: [{ id: "t1" }], activeId: "t1", previewZoom: 0.35 };
    expect(migrateV0(v1, 1)).toEqual(v1);
  });
});
