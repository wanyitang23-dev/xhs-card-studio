import { describe, expect, it } from "vitest";
import { mergeCoverRun } from "@/lib/xhs/cover-directions";

type C = { id: string; html: string; status: string };
const pending = (id: string): C => ({ id, html: "", status: "running" });
const done = (id: string, html: string): C => ({ id, html, status: "done" });

const all: C[] = [
  done("big-type", "<A>"),
  done("badge-stack", "<B>"),
  done("split-block", "<C>"),
];

describe("mergeCoverRun", () => {
  it("resets only the requested tile and keeps the others intact", () => {
    const next = mergeCoverRun(all, ["badge-stack"], pending);
    expect(next.map((c) => c.html)).toEqual(["<A>", "", "<C>"]);
    expect(next.map((c) => c.status)).toEqual(["done", "running", "done"]);
  });

  it("resets everything when all directions are requested", () => {
    const next = mergeCoverRun(all, ["big-type", "badge-stack", "split-block"], pending);
    expect(next.every((c) => c.status === "running" && c.html === "")).toBe(true);
  });

  it("creates tiles that do not exist yet (first run)", () => {
    const next = mergeCoverRun([], ["big-type", "badge-stack", "split-block"], pending);
    expect(next.map((c) => c.id)).toEqual(["big-type", "badge-stack", "split-block"]);
  });

  it("keeps a stable order regardless of the existing array's order", () => {
    const shuffled = [done("split-block", "<C>"), done("big-type", "<A>")];
    const next = mergeCoverRun(shuffled, ["badge-stack"], pending);
    expect(next.map((c) => c.id)).toEqual(["big-type", "badge-stack", "split-block"]);
  });

  it("does not invent tiles for directions nobody asked for", () => {
    const next = mergeCoverRun([done("big-type", "<A>")], ["big-type"], pending);
    expect(next.map((c) => c.id)).toEqual(["big-type"]);
  });

  it("ignores an unknown direction rather than adding a bogus tile", () => {
    const next = mergeCoverRun(all, ["not-a-direction"], pending);
    expect(next.map((c) => c.html)).toEqual(["<A>", "<B>", "<C>"]);
  });
});
