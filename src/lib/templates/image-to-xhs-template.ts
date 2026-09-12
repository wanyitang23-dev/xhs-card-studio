import fs from "node:fs";
import path from "node:path";

const SKILL_PATH = path.join(
  process.cwd(),
  "src/lib/templates/image-to-xhs-template/SKILL.md",
);

/** Trusted workflow instructions shared by both stages of image template import. */
export function loadImageToXhsTemplateSkill(): string {
  return fs.readFileSync(SKILL_PATH, "utf8");
}
