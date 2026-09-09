import { describe, expect, it } from "vitest";
import { extractHtml, previewHtml } from "@/lib/extract-html";

const doc = (marker: string, css = "") =>
  `<!DOCTYPE html><html><head><style>.${marker}{${css || "color:#111"}}</style></head><body><h1>${marker}</h1></body></html>`;

/** CSS text visible in the body is the exact symptom the glue bug produced. */
const cssLeaksIntoBody = (html: string): boolean => {
  const body = html.slice(html.indexOf("<body>"));
  return /<style/i.test(body);
};

describe("extractHtml · 多份文档", () => {
  it("两份文档相连时只取后一份，不再粘成一份", () => {
    const out = extractHtml(doc("first") + "\n\n" + doc("second"));
    expect((out.match(/<!DOCTYPE/gi) || []).length).toBe(1);
    expect((out.match(/<style/gi) || []).length).toBe(1);
    expect(out).toContain("second");
    expect(out).not.toContain("first");
  });

  it("中间夹着解说也不会把两份粘起来", () => {
    const out = extractHtml(doc("draft") + "\n等等，我重写一版：\n" + doc("final"));
    expect(cssLeaksIntoBody(out)).toBe(false);
    expect(out).toContain("final");
    expect(out).not.toContain("等等");
  });

  it("文档之间夹着裸 CSS 时，裸 CSS 不会被带进正文", () => {
    // The actual shape behind the reported bug: a first document, then a bare
    // CSS snippet with no <style> wrapper, then the real document. Splicing
    // first-doctype..last-</html> pulled that snippet into the body, where the
    // browser has nowhere to put it but on the page as text.
    const bare = ".card{--paper:rgba(231,225,214,1);font-weight:900;line-height:1.2}";
    const out = extractHtml(doc("draft") + "\n" + bare + "\n" + doc("final"));
    expect(out).not.toContain("rgba(231,225,214,1)");
    expect(out).toContain("<h1>final</h1>");
  });

  it("三份文档取最后一份", () => {
    const out = extractHtml([doc("a"), doc("b"), doc("c")].join("\n"));
    expect(out).toContain("<h1>c</h1>");
    expect((out.match(/<!DOCTYPE/gi) || []).length).toBe(1);
  });

  it("最后一份还没写完时，退回到已经完成的那一份", () => {
    const out = extractHtml(doc("done") + "\n<!DOCTYPE html><html><head><style>.half{");
    expect(out).toContain("<h1>done</h1>");
    expect(out.endsWith("</html>")).toBe(true);
  });

  it("流式过程中只有一份未完成的文档时，原样返回已到达的部分", () => {
    const partial = "<!DOCTYPE html><html><head><style>.a{color:red}</style></head><body><h1>写到一半";
    expect(extractHtml(partial)).toBe(partial);
  });
});

describe("extractHtml · 围栏", () => {
  it("正文里含 ``` 时不再截断文档", () => {
    const inner = `<!DOCTYPE html><html><head><style>.a{color:#111}</style></head><body><p>用 \`\`\` 包代码</p><h1>标题</h1></body></html>`;
    const out = extractHtml("```html\n" + inner + "\n```");
    expect(out).toBe(inner);
    expect(out.endsWith("</html>")).toBe(true);
  });

  it("正常带围栏的文档照常剥离", () => {
    expect(extractHtml("好的：\n```html\n" + doc("x") + "\n```")).toBe(doc("x"));
  });

  it("无文档标签的片段仍走围栏剥离", () => {
    expect(extractHtml("```html\n<div>片段</div>\n```")).toBe("<div>片段</div>");
  });
});

describe("extractHtml · 既有行为不变", () => {
  it("前面有解说时从文档开头取", () => {
    expect(extractHtml("我来生成：\n" + doc("y"))).toBe(doc("y"));
  });

  it("没有 doctype 但有 <html> 也能取到", () => {
    const h = "<html><head></head><body><h1>无 doctype</h1></body></html>";
    expect(extractHtml("前言\n" + h)).toBe(h);
  });

  it("纯文本被包进可读的兜底页", () => {
    const out = extractHtml("生成失败，请重试");
    expect(out).toContain("<pre");
    expect(out).toContain("生成失败，请重试");
  });

  it("负字距仍然被钳到 0", () => {
    expect(extractHtml(doc("z", "letter-spacing:-.04em"))).toContain("letter-spacing:0");
  });

  it("previewHtml 给未闭合的流式内容补上收尾", () => {
    const out = previewHtml("<!DOCTYPE html><html><body><h1>半截");
    expect(out.endsWith("</body>\n</html>")).toBe(true);
  });
});
