import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { exampleReferenceBlock } from "@/lib/xhs/example-ref";

/**
 * A finished deck came back with 「白底杂志风 · 收尾」 printed in its footer —
 * the template's own name, copied verbatim out of
 * deck-xhs-white/example.html. Once example.html started reaching the agent,
 * every literal string in it became something the model might reproduce, and
 * footer/label text reads like template furniture rather than sample copy.
 */

const SKILLS = path.join(process.cwd(), "src/lib/templates/skills");

/** Visible text of the document, with script and style contents removed. */
function visibleText(html: string): string {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
}

function templateNames(skillMd: string): string[] {
  const out: string[] = [];
  for (const key of ["zh_name", "en_name"]) {
    const m = new RegExp(`${key}:\\s*"([^"]+)"`).exec(skillMd);
    if (m) {
      out.push(m[1]);
      // "白底杂志风 Deck" also leaks as the bare "白底杂志风".
      const bare = m[1].replace(/\s*Deck\s*$/i, "").trim();
      if (bare.length >= 3 && bare !== m[1]) out.push(bare);
    }
  }
  return out;
}

const dirs = fs
  .readdirSync(SKILLS)
  .filter((d) => fs.existsSync(path.join(SKILLS, d, "example.html")));

describe("内置模板的示例不能自报家门", () => {
  it("至少扫到了全部内置模板", () => {
    expect(dirs.length).toBeGreaterThanOrEqual(5);
  });

  for (const dir of dirs) {
    it(`${dir} 的示例正文里没有自己的模板名`, () => {
      const skill = fs.readFileSync(path.join(SKILLS, dir, "SKILL.md"), "utf8");
      const html = fs.readFileSync(path.join(SKILLS, dir, "example.html"), "utf8");
      const text = visibleText(html);
      for (const name of templateNames(skill)) {
        // The agent reproduces what it sees; a name it can see is a name it can
        // print onto the user's own post.
        expect(text, `${dir} 的示例里出现了模板名「${name}」`).not.toContain(name);
      }
    });
  }
});

describe("参考块把装置文字也说清楚了", () => {
  const block = exampleReferenceBlock("<div>x</div>");

  it("点名页眉页脚标签这类文字同样是样例", () => {
    expect(block).toContain("包括页眉页脚、标签、栏目名");
    expect(block).toContain("不是它们写了什么");
  });

  it("明确禁止在成品里出现模板名", () => {
    expect(block).toContain("绝对不要出现模板的名字");
  });
});
