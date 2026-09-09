import { describe, expect, it } from "vitest";
import { extractJson } from "../extract-json";

describe("extractJson", () => {
  it("parses a bare object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("unwraps a ```json fence", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("unwraps an unlabelled fence", () => {
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("skips a chatty preamble and trailing summary", () => {
    const s = '好的，这是大纲：\n{"pages":[{"title":"封面"}]}\n以上共 1 页。';
    expect(extractJson(s)).toEqual({ pages: [{ title: "封面" }] });
  });

  it("ignores braces inside string values", () => {
    const s = 'note: use {curly} braces\n{"body":"a } here","n":2}';
    expect(extractJson(s)).toEqual({ body: "a } here", n: 2 });
  });

  it("handles escaped quotes inside strings", () => {
    const s = '{"body":"he said \\"hi\\" }","n":1}';
    expect(extractJson(s)).toEqual({ body: 'he said "hi" }', n: 1 });
  });

  it("parses a top-level array", () => {
    expect(extractJson('前言\n[{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("returns null for empty input", () => {
    expect(extractJson("")).toBeNull();
    expect(extractJson("   ")).toBeNull();
  });

  it("returns null when nothing JSON-shaped is present", () => {
    expect(extractJson("生成失败，请重试")).toBeNull();
  });

  it("returns null for an unterminated object", () => {
    expect(extractJson('{"a":1')).toBeNull();
  });
});
