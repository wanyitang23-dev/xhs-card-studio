import { describe, expect, it } from "vitest";
import { clampNegativeLetterSpacing, extractHtml } from "@/lib/extract-html";

describe("clampNegativeLetterSpacing", () => {
  it("neutralises the exact value observed breaking a real card", () => {
    expect(clampNegativeLetterSpacing("letter-spacing:-.04em")).toBe("letter-spacing:0");
  });

  it("handles every unit and spacing style a model might emit", () => {
    const cases = [
      "letter-spacing:-0.045em",
      "letter-spacing: -.03em",
      "letter-spacing:  -2px",
      "letter-spacing:-1.5rem",
      "letter-spacing: - .02em",
      "LETTER-SPACING:-.04EM",
    ];
    for (const c of cases) {
      expect(clampNegativeLetterSpacing(c)).toBe("letter-spacing:0");
    }
  });

  it("leaves positive and zero tracking untouched", () => {
    expect(clampNegativeLetterSpacing("letter-spacing:.18em")).toBe("letter-spacing:.18em");
    expect(clampNegativeLetterSpacing("letter-spacing:0")).toBe("letter-spacing:0");
    expect(clampNegativeLetterSpacing("letter-spacing:2px")).toBe("letter-spacing:2px");
  });

  it("does not touch other negative properties", () => {
    const s = "margin-left:-24px;word-spacing:-.02em;letter-spacing:-.04em";
    expect(clampNegativeLetterSpacing(s)).toBe(
      "margin-left:-24px;word-spacing:-.02em;letter-spacing:0",
    );
  });

  it("clamps every occurrence in a document", () => {
    const css = ".a{letter-spacing:-.045em}.b{letter-spacing:-.04em}.c{letter-spacing:.14em}";
    expect(clampNegativeLetterSpacing(css)).toBe(
      ".a{letter-spacing:0}.b{letter-spacing:0}.c{letter-spacing:.14em}",
    );
  });

  it("is applied by extractHtml, so preview and export both get it", () => {
    const doc = "<!DOCTYPE html><html><head><style>h1{letter-spacing:-.04em}</style></head><body></body></html>";
    expect(extractHtml(doc)).toContain("letter-spacing:0");
    expect(extractHtml(doc)).not.toContain("-.04em");
  });
});
