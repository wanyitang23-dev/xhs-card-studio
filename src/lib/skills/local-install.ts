import fs from "node:fs";
import path from "node:path";
import { makeSkillId, packageId, userSkillsDir } from "./paths";

/**
 * Write a user-uploaded template to the same on-disk layout the GitHub
 * marketplace installer uses, so `loader.ts` picks it up with no extra wiring:
 *
 *   ~/.html-anything/skills/local__<slug>/
 *     package.json
 *     skills/<slug>/
 *       SKILL.md
 *       example.html
 *
 * Locally uploaded packages use the reserved owner `local`, which cannot
 * collide with a GitHub install because `local` is not a valid repo pair here —
 * every GitHub package id is `<owner>__<repo>` with a real repo on the right.
 */

export const LOCAL_OWNER = "local";

export class LocalInstallError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Filesystem-safe, collision-resistant id derived from a display name. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  // CJK names slugify to nothing; fall back to a timestamp so the upload still
  // lands somewhere addressable rather than being rejected.
  return base || `custom-${Date.now().toString(36)}`;
}

/** Reject anything that could escape the skills directory. */
function assertSafeSlug(slug: string): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new LocalInstallError("bad_slug", `unsafe template id: ${slug}`);
  }
}

export type LocalTemplateInput = {
  /** Display name shown in the picker. */
  name: string;
  /** The SKILL.md body — the style rules, without frontmatter. */
  skillBody: string;
  /** The reference page the rules were derived from. Shown as the preview. */
  exampleHtml: string;
  emoji?: string;
  description?: string;
};

function buildSkillMd(slug: string, input: LocalTemplateInput): string {
  const esc = (s: string) => s.replace(/"/g, '\\"').replace(/[\r\n]+/g, " ").trim();
  return `---
name: ${slug}
zh_name: "${esc(input.name)}"
en_name: "${esc(input.name)}"
emoji: "${input.emoji || "🎨"}"
description: "${esc(input.description || "用户上传的自定义模板")}"
category: card
scenario: creator
aspect_hint: "1080×1440 (3:4)"
tags: ["xhs", "小红书", "自定义"]
---

${input.skillBody.trim()}
`;
}

export type LocalInstallResult = {
  /** Namespaced id as seen by the rest of the app. */
  skillId: string;
  packageId: string;
  dir: string;
};

/**
 * Write (or overwrite) one local template. Re-uploading the same name replaces
 * the previous version in place, which is what "我改一下再传一次" should do.
 */
export function installLocalTemplate(input: LocalTemplateInput): LocalInstallResult {
  if (!input.name?.trim()) throw new LocalInstallError("missing_name", "模板名称不能为空");
  if (!input.skillBody?.trim()) throw new LocalInstallError("missing_body", "模板规则不能为空");
  if (!input.exampleHtml?.trim()) throw new LocalInstallError("missing_html", "参考 HTML 不能为空");

  const slug = slugify(input.name);
  assertSafeSlug(slug);
  const pkgId = packageId(LOCAL_OWNER, slug);
  const pkgDir = path.join(userSkillsDir(), pkgId);
  const skillDir = path.join(pkgDir, "skills", slug);

  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), buildSkillMd(slug, input), "utf8");
  fs.writeFileSync(path.join(skillDir, "example.html"), input.exampleHtml, "utf8");
  fs.writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        id: pkgId,
        source: { type: "local", owner: LOCAL_OWNER, repo: slug, ref: "upload" },
        installedAt: new Date().toISOString(),
        skills: [slug],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  return { skillId: makeSkillId(pkgId, slug), packageId: pkgId, dir: skillDir };
}

/** Remove a locally uploaded template. No-op if it isn't there. */
export function uninstallLocalTemplate(slug: string): void {
  assertSafeSlug(slug);
  const pkgDir = path.join(userSkillsDir(), packageId(LOCAL_OWNER, slug));
  fs.rmSync(pkgDir, { recursive: true, force: true });
}
