import { describe, expect, it } from "vitest";
import { buildCoverPrompt, buildRenderPrompt } from "@/lib/xhs/prompts";
import { extractHtml } from "@/lib/extract-html";
import type { XhsPage } from "@/lib/xhs/types";

/**
 * A portrait screenshot came back as a thin horizontal strip. The prompt had
 * said "the real size is unknown, so pin a height and use object-fit:cover" —
 * and `cover` discards whatever does not fit. The size was never unknown: it is
 * read at upload and was simply thrown away.
 */

const page = (ids: string[]): XhsPage => ({
  id: "p1",
  kind: "cover",
  title: "标题",
  body: "正文",
  imageAssetIds: ids,
  confirmed: true,
});

const portrait = { "asset:pic1": { width: 1170, height: 2532 } };
const landscape = { "asset:pic1": { width: 1600, height: 900 } };
const square = { "asset:pic1": { width: 800, height: 800 } };

const cover = (meta?: Record<string, { width: number; height: number }>) =>
  buildCoverPrompt({
    title: "标题",
    body: "钩子",
    direction: "巨字标题",
    skillBody: "模板",
    images: ["asset:pic1"],
    imageMeta: meta,
  });

describe("prompt 里给出真实尺寸", () => {
  it("竖图标注为竖图并带上宽高比", () => {
    const p = cover(portrait);
    expect(p).toContain("1170×2532");
    expect(p).toContain("竖图");
    expect(p).toContain("0.46");
  });

  it("横图和方图各自标对", () => {
    expect(cover(landscape)).toContain("横图");
    expect(cover(square)).toContain("方图");
  });

  it("出成品那一步也带上尺寸", () => {
    const p = buildRenderPrompt({
      pages: [page(["asset:pic1"])],
      skillBody: "模板",
      imageMeta: portrait,
    });
    expect(p).toContain("1170×2532");
    expect(p).toContain("竖图");
  });

  it("没有尺寸记录时只写标记, 不瞎标一个比例", () => {
    const p = cover(undefined);
    const line = p.split("\n").find((l) => l.includes("asset:pic1"))!;
    expect(line.trim()).toBe("- asset:pic1");
  });

  it("没有尺寸记录时规则不会指向一个不存在的比例", () => {
    const p = cover(undefined);
    expect(p).not.toContain("按下面给出的真实宽高比");
    expect(p).toContain("这张图的尺寸没有记录");
    // The important half survives either way.
    expect(p).toContain("不要写死高度再用");
  });
});

describe("不再教它裁切", () => {
  it("旧的「固定高度 + cover」写法已从 prompt 中移除", () => {
    for (const p of [cover(portrait), buildRenderPrompt({ pages: [page(["asset:pic1"])], skillBody: "模板", imageMeta: portrait })]) {
      expect(p).not.toContain("图片的实际长宽未知");
      expect(p).not.toContain("固定高度 + `object-fit:cover`");
    }
  });

  it("改为要求按真实比例留版面", () => {
    const p = cover(portrait);
    expect(p).toContain("按下面给出的真实宽高比留版面");
    expect(p).toContain("aspect-ratio");
    expect(p).toContain("不要写死一个高度再用");
  });

  it("仍允许有意为之的满幅裁切", () => {
    expect(cover(portrait)).toContain("确实想做满幅裁切时才用");
  });

  it("没有配图的 prompt 不会多出这段", () => {
    const bare = buildRenderPrompt({ pages: [page([])], skillBody: "模板" });
    expect(bare).not.toContain("按下面给出的真实宽高比留版面");
  });
});

describe("安全默认: 不拉伸、不裁切", () => {
  const doc = `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script>
<style>.shot img{width:100%;height:300px}</style></head><body><img class="shot"></body></html>`;

  it("基础层把 object-fit 默认成 contain", () => {
    expect(extractHtml(doc)).toContain("object-fit:contain");
  });

  it("默认排在作者样式之前, 作者仍然赢", () => {
    const out = extractHtml(doc);
    expect(out.indexOf("object-fit:contain")).toBeLessThan(out.indexOf(".shot img"));
  });

  it("作者明确要 cover 时不被覆盖 — 这是默认值不是强制", () => {
    const deliberate = doc.replace("height:300px", "height:300px;object-fit:cover");
    const out = extractHtml(deliberate);
    expect(out).toContain("object-fit:cover");
    expect(out.indexOf("object-fit:contain")).toBeLessThan(out.indexOf("object-fit:cover"));
  });
});
