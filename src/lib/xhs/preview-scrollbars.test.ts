import { describe, expect, it } from "vitest";
import {
  hidePreviewScrollbars,
  PREVIEW_SCROLLBAR_STYLE_ID,
} from "./preview-scrollbars";

describe("成品预览滚动条", () => {
  it("隐藏根滚动条但不禁用滚动", () => {
    const doc = document.implementation.createHTMLDocument("preview");

    hidePreviewScrollbars(doc);

    const style = doc.getElementById(PREVIEW_SCROLLBAR_STYLE_ID);
    expect(style?.textContent).toContain("scrollbar-width:none");
    expect(style?.textContent).toContain("::-webkit-scrollbar");
    expect(style?.textContent).not.toContain("overflow:hidden");
  });

  it("重复触发 iframe load 不会重复注入", () => {
    const doc = document.implementation.createHTMLDocument("preview");

    hidePreviewScrollbars(doc);
    hidePreviewScrollbars(doc);

    expect(doc.querySelectorAll(`#${PREVIEW_SCROLLBAR_STYLE_ID}`)).toHaveLength(1);
  });
});
