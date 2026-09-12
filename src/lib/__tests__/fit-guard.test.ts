import { describe, expect, it } from "vitest";
import { extractHtml, previewHtml } from "@/lib/extract-html";

/**
 * Opening an exported 1080px deck in a window narrower than that sliced the
 * first ~190px off every card, with no way to scroll to it: the templates stack
 * cards with `align-items:center`, and a centred flex item wider than its
 * container overflows on both sides — the left half landing before the scroll
 * origin, which is unreachable.
 *
 * Measured on the reported file at a 700px viewport: leftmost card edge -197px,
 * scrollWidth 883 of 1080. After the guard: 0 and 1080. At 1400px the layout is
 * byte-identical, because the rule only binds when the content is already wider
 * than the viewport.
 */

/** A card deck: the fixed width is what makes the overflow possible. */
const doc = (head = "<style>.card{width:1080px}</style>", body = "<div>x</div>") =>
  `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;

describe("窄窗口下卡片左边不会被切掉", () => {
  it("每份完整文档都会拿到这条兜底", () => {
    expect(extractHtml(doc())).toContain('data-xhs="fit"');
    expect(extractHtml(doc())).toContain("min-width:max-content");
  });

  it("不依赖 Tailwind — 没加载 CDN 的文档同样有", () => {
    const html = extractHtml(doc("<style>.card{width:1080px;background:#fff}</style>"));
    expect(html).toContain('data-xhs="fit"');
    expect(html).not.toContain('data-xhs="base-reset"');
  });

  it("排在作者样式之前, 作者自己写的 min-width 仍然赢", () => {
    const html = extractHtml(doc("<style>.card{width:1080px}body{min-width:0}</style>"));
    expect(html.indexOf('data-xhs="fit"')).toBeLessThan(html.indexOf("min-width:0"));
  });

  it("重复处理不会插两遍", () => {
    const once = extractHtml(doc());
    const twice = extractHtml(once);
    expect(twice.match(/data-xhs="fit"/g)).toHaveLength(1);
  });

  it("流式预览路径也有", () => {
    expect(previewHtml(doc())).toContain('data-xhs="fit"');
  });

  it("没有 head 的文档也不会漏掉", () => {
    const html = extractHtml("<html><body><div style=\"width:1080px\">x</div></body></html>");
    expect(html).toContain('data-xhs="fit"');
  });

  /** A fragment is not a document; wrapping it is a different concern. */
  it("片段不处理", () => {
    expect(extractHtml("<div>只是一个片段</div>")).not.toContain('data-xhs="fit"');
  });

  /**
   * Scoped on purpose: a document with no large fixed dimension cannot overflow
   * a narrow window, and injecting into it would change extractHtml's output
   * for every caller that only wants the document pulled out.
   */
  it("没有大尺寸的文档不注入", () => {
    expect(extractHtml("<!DOCTYPE html><html><head></head><body>ok</body></html>")).not.toContain(
      'data-xhs="fit"',
    );
  });
});
