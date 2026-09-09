import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xhs-skills-"));
  process.env.XHS_ANYTHING_USER_SKILLS_DIR = tmp;
});

afterEach(() => {
  delete process.env.XHS_ANYTHING_USER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function mods() {
  const local = await import("../local-install");
  const registry = await import("../registry");
  const loader = await import("@/lib/templates/loader");
  loader.invalidateSkillsCache();
  return { ...local, ...registry, ...loader };
}

const input = {
  name: "我的粉色卡片",
  skillBody: "【模板: 粉色卡片】\n- 底色 #ffeef2, 圆角 40px",
  exampleHtml: "<!DOCTYPE html><html><body>hi</body></html>",
};

describe("installLocalTemplate", () => {
  it("writes SKILL.md + example.html + manifest to disk", async () => {
    const { installLocalTemplate } = await mods();
    const res = installLocalTemplate(input);
    expect(fs.existsSync(path.join(res.dir, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(res.dir, "example.html"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, res.packageId, "package.json"))).toBe(true);
  });

  it("surfaces the uploaded template through the shared registry", async () => {
    const { installLocalTemplate, listSkills, loadSkill } = await mods();
    const res = installLocalTemplate(input);
    const ids = listSkills().map((s) => s.id);
    expect(ids).toContain(res.skillId);

    const loaded = loadSkill(res.skillId);
    expect(loaded).not.toBeNull();
    expect(loaded?.zhName).toBe("我的粉色卡片");
    expect(loaded?.body).toContain("#ffeef2");
    expect(loaded?.exampleHtml).toContain("hi");
  });

  it("falls back to a synthetic slug for a CJK-only name", async () => {
    const { slugify } = await mods();
    expect(slugify("小红书")).toMatch(/^custom-[a-z0-9]+$/);
    expect(slugify("My Pink Cards")).toBe("my-pink-cards");
  });

  it("replaces in place when the same name is uploaded twice", async () => {
    const { installLocalTemplate, listSkills, loadSkill } = await mods();
    const first = installLocalTemplate({ ...input, name: "pink", skillBody: "v1 rules" });
    const second = installLocalTemplate({ ...input, name: "pink", skillBody: "v2 rules" });
    expect(second.skillId).toBe(first.skillId);
    const { invalidateSkillsCache } = await mods();
    invalidateSkillsCache();
    expect(listSkills().filter((s) => s.id === first.skillId)).toHaveLength(1);
    expect(loadSkill(first.skillId)?.body).toContain("v2 rules");
  });

  it("escapes quotes in the display name so frontmatter stays parseable", async () => {
    const { installLocalTemplate, loadSkill } = await mods();
    const res = installLocalTemplate({ ...input, name: 'say "hi" now' });
    expect(loadSkill(res.skillId)?.zhName).toBe('say "hi" now');
  });

  it("rejects empty required fields", async () => {
    const { installLocalTemplate, LocalInstallError } = await mods();
    expect(() => installLocalTemplate({ ...input, name: "  " })).toThrow(LocalInstallError);
    expect(() => installLocalTemplate({ ...input, skillBody: "" })).toThrow(LocalInstallError);
    expect(() => installLocalTemplate({ ...input, exampleHtml: "" })).toThrow(LocalInstallError);
  });

  it("uninstalls cleanly", async () => {
    const { installLocalTemplate, uninstallLocalTemplate, listSkills, invalidateSkillsCache } = await mods();
    const res = installLocalTemplate({ ...input, name: "temp-one" });
    uninstallLocalTemplate("temp-one");
    invalidateSkillsCache();
    expect(listSkills().map((s) => s.id)).not.toContain(res.skillId);
  });
});
