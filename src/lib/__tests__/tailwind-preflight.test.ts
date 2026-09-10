import { describe, expect, it } from "vitest";
import { extractHtml, neutralizeTailwindPreflight } from "@/lib/extract-html";

/**
 * Measured on a real cover whose headline vanished: the author wrote
 * h1{font-size:150px} and the browser computed 16px, because the Play CDN
 * appends Preflight's `h1,...,h6{font-size:inherit}` after the author's
 * stylesheet and both match at specificity (0,0,1).
 */

const withCdn = (extra = "") => `<!DOCTYPE html><html><head>
<script src="https://cdn.tailwindcss.com"></script>
<style>h1{font-size:150px}</style>${extra}
</head><body><h1>标题</h1></body></html>`;

describe("neutralizeTailwindPreflight", () => {
  it("给加载了 Play CDN 的文档关掉 preflight", () => {
    const out = neutralizeTailwindPreflight(withCdn());
    expect(out).toContain("corePlugins:{preflight:false}");
  });

  it("config 必须排在 CDN script 之后, 否则 Play 读不到", () => {
    const out = neutralizeTailwindPreflight(withCdn());
    expect(out.indexOf("cdn.tailwindcss.com")).toBeLessThan(out.indexOf("preflight:false"));
  });

  it("补回的基础样式必须排在作者样式之前, 保证作者永远赢", () => {
    const out = neutralizeTailwindPreflight(withCdn());
    expect(out.indexOf('data-xhs="base-reset"')).toBeLessThan(out.indexOf("h1{font-size:150px}"));
  });

  it("补回的基础样式不碰标题字号和字重", () => {
    const out = neutralizeTailwindPreflight(withCdn());
    const reset = /<style data-xhs="base-reset">([\s\S]*?)<\/style>/.exec(out)![1];
    expect(reset).not.toContain("font-size:inherit");
    expect(reset).not.toContain("font-weight");
    // But it does keep the normalisation that documents actually rely on.
    expect(reset).toContain("box-sizing:border-box");
    expect(reset).toContain("h1,h2,h3,h4,h5,h6,p,figure,blockquote,dl,dd,pre{margin:0}");
  });

  it("没有加载 Tailwind 的文档原样返回", () => {
    const plain = `<!DOCTYPE html><html><head><style>h1{font-size:150px}</style></head><body><h1>x</h1></body></html>`;
    expect(neutralizeTailwindPreflight(plain)).toBe(plain);
  });

  it("重复处理不会叠加第二份基础样式", () => {
    const once = neutralizeTailwindPreflight(withCdn());
    const twice = neutralizeTailwindPreflight(once);
    expect(twice).toBe(once);
    expect(twice.match(/data-xhs="base-reset"/g)).toHaveLength(1);
  });

  it("没有 <head> 时也不会丢掉基础样式", () => {
    const noHead = `<script src="https://cdn.tailwindcss.com"></script><h1>x</h1>`;
    expect(neutralizeTailwindPreflight(noHead)).toContain('data-xhs="base-reset"');
  });

  it("不改动作者自己写的任何一条样式", () => {
    const out = neutralizeTailwindPreflight(withCdn());
    expect(out).toContain("h1{font-size:150px}");
  });
});

describe("extractHtml 串起来", () => {
  it("抽取文档时顺带处理掉 preflight", () => {
    const out = extractHtml("这是解说\n" + withCdn());
    expect(out).toContain("preflight:false");
    expect(out).toContain("h1{font-size:150px}");
    expect(out.startsWith("<!DOCTYPE")).toBe(true);
  });

  it("负字距钳制仍然生效, 两个兜底不互相干扰", () => {
    const doc = `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script>
<style>h1{font-size:150px;letter-spacing:-.04em}</style></head><body><h1>标题</h1></body></html>`;
    const out = extractHtml(doc);
    expect(out).toContain("letter-spacing:0");
    expect(out).toContain("preflight:false");
  });
});
