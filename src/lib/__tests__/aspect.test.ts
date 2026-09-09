import { describe, expect, it } from "vitest";
import { aspectBadge, DEFAULT_VIEWPORT, parsePageCount, parseViewport } from "@/lib/xhs/aspect";

describe("parseViewport", () => {
  it("reads an explicit W×H pair", () => {
    expect(parseViewport("1080×1440 (3:4)")).toEqual({ width: 1080, height: 1440 });
    expect(parseViewport("810×1080 ×9")).toEqual({ width: 810, height: 1080 });
    expect(parseViewport("1080x1080 ×3")).toEqual({ width: 1080, height: 1080 });
  });

  it("prefers the explicit pair over a ratio in the same string", () => {
    expect(parseViewport("1920×1080 (16:9)")).toEqual({ width: 1920, height: 1080 });
  });

  it("anchors a bare ratio to the default width", () => {
    expect(parseViewport("16:9")).toEqual({ width: 1080, height: 608 });
    expect(parseViewport("3:4")).toEqual({ width: 1080, height: 1440 });
  });

  it("takes the first ratio when several are offered", () => {
    expect(parseViewport("16:9 / 3:4")).toEqual({ width: 1080, height: 608 });
  });

  it("falls back to the Xiaohongshu default for junk or empty input", () => {
    expect(parseViewport("")).toEqual(DEFAULT_VIEWPORT);
    expect(parseViewport(undefined)).toEqual(DEFAULT_VIEWPORT);
    expect(parseViewport("竖版")).toEqual(DEFAULT_VIEWPORT);
  });

  it("rejects absurd dimensions rather than sizing an iframe to them", () => {
    expect(parseViewport("9999×9999")).toEqual(DEFAULT_VIEWPORT);
  });
});

describe("aspectBadge", () => {
  it("shows the written ratio", () => {
    expect(aspectBadge("1080×1440 (3:4)")).toBe("3:4");
    expect(aspectBadge("16:9")).toBe("16:9");
  });

  it("reduces a W×H pair to its ratio", () => {
    expect(aspectBadge("810×1080 ×9")).toBe("3:4");
    expect(aspectBadge("1080×1080 ×3")).toBe("1:1");
  });

  it("defaults to 3:4 when nothing is written", () => {
    expect(aspectBadge("")).toBe("3:4");
    expect(aspectBadge(undefined)).toBe("3:4");
  });
});

describe("parsePageCount", () => {
  it("reads a standalone ×N", () => {
    expect(parsePageCount("810×1080 ×9")).toBe(9);
    expect(parsePageCount("1080×1080 ×3")).toBe(3);
  });

  it("does not mistake a dimension for a page count", () => {
    expect(parsePageCount("1080×1440 (3:4)")).toBeNull();
    expect(parsePageCount("16:9")).toBeNull();
  });
});
