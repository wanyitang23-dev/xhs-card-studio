import { describe, expect, it } from "vitest";
import { cardFitTransform, findCardElement } from "@/lib/xhs/measure-card";

/**
 * The tile used to scale a nominal 1080×1440 viewport. That assumes the
 * document is nothing but the card — which stopped being true once the agent
 * started copying the example's gallery shell around its single cover.
 */

/** happy-dom reports zero-size boxes, so stub the geometry the walk relies on. */
function docWith(html: string, sizes: Record<string, [number, number]>): Document {
  const doc = document.implementation.createHTMLDocument("t");
  doc.body.innerHTML = html;
  const apply = (el: Element) => {
    const key = (el as HTMLElement).className || el.tagName.toLowerCase();
    const [w, h] = sizes[key] ?? [0, 0];
    (el as HTMLElement).getBoundingClientRect = () =>
      ({ width: w, height: h, left: 0, top: 0, right: w, bottom: h, x: 0, y: 0 }) as DOMRect;
    Array.from(el.children).forEach(apply);
  };
  Array.from(doc.body.children).forEach(apply);
  return doc;
}

describe("findCardElement", () => {
  it("裸卡片时就取那张卡, 不取 body", () => {
    const doc = docWith(`<div class="card"><h1 class="t">标题</h1><p class="b">正文</p></div>`, {
      card: [1080, 1440],
      t: [900, 300],
      b: [900, 200],
    });
    expect(findCardElement(doc)?.className).toBe("card");
  });

  it("穿过 .deck 这类单子元素外壳", () => {
    const doc = docWith(
      `<div class="deck"><div class="card"><h1 class="t">标题</h1><p class="b">正文</p></div></div>`,
      { deck: [1080, 1512], card: [1080, 1440], t: [900, 300], b: [900, 200] },
    );
    expect(findCardElement(doc)?.className).toBe("card");
  });

  it("卡片内部有多个子元素时就停在卡片, 不再往下钻", () => {
    const doc = docWith(
      `<div class="deck"><div class="card"><h1 class="t">A</h1><p class="b">B</p></div></div>`,
      { deck: [1080, 1512], card: [1080, 1440], t: [900, 300], b: [900, 200] },
    );
    expect(findCardElement(doc)?.className).toBe("card");
  });

  it("没有尺寸的元素(script 之类)不算兄弟节点", () => {
    const doc = docWith(`<div class="card"><span class="only">x</span></div><script></script>`, {
      card: [1080, 1440],
      only: [100, 40],
      script: [0, 0],
    });
    // Descends past the single sized child, but never returns body.
    expect(findCardElement(doc)?.className).toBe("only");
  });

  it("body 为空时返回 null", () => {
    expect(findCardElement(docWith("", {}))).toBeNull();
  });
});

describe("cardFitTransform", () => {
  const tile = { width: 540, height: 720 };

  it("裸卡片按宽度铺满", () => {
    const f = cardFitTransform({ x: 0, y: 0, width: 1080, height: 1440 }, tile);
    expect(f.scale).toBeCloseTo(0.5);
    expect(f.x).toBeCloseTo(0);
    expect(f.y).toBeCloseTo(0);
  });

  it("外壳带 36px 页面留白时, 把卡片本身居中而不是把外壳居中", () => {
    // body{padding:36px 0} → the card sits 36px down inside a taller document.
    const f = cardFitTransform({ x: 0, y: 36, width: 1080, height: 1440 }, tile);
    expect(f.scale).toBeCloseTo(0.5);
    // The card's own offset is cancelled out, so it still lands flush.
    expect(f.y).toBeCloseTo(-18);
  });

  it("卡片比预期小时会放大到填满, 而不是留一圈空白", () => {
    const f = cardFitTransform({ x: 0, y: 0, width: 750, height: 1000 }, tile);
    expect(f.scale).toBeCloseTo(0.72);
    expect(f.x).toBeCloseTo(0);
  });

  it("比例不同的卡片按较紧的一边收, 并在另一边居中", () => {
    const f = cardFitTransform({ x: 0, y: 0, width: 1080, height: 1080 }, tile);
    expect(f.scale).toBeCloseTo(0.5);
    expect(f.y).toBeCloseTo((720 - 540) / 2);
  });

  it("尺寸非法时 scale 为 0, 调用方据此不渲染", () => {
    expect(cardFitTransform({ x: 0, y: 0, width: 0, height: 0 }, tile).scale).toBe(0);
    expect(cardFitTransform({ x: 0, y: 0, width: 1080, height: 1440 }, { width: 0, height: 0 }).scale).toBe(0);
  });
});
