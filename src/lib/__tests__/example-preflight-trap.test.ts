import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Tailwind's Play CDN injects Preflight at runtime, appended after the
 * document's own stylesheet. Preflight contains
 * `h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}`, which matches at
 * the same specificity as a bare `h2{...}` rule and wins on source order.
 *
 * card-xiaohongshu shipped both for a long time. Its five content cards
 * declared `h2{font-size:64px;font-weight:900}` and rendered at 16px/400 —
 * the same defect that made a generated headline vanish (0110ad2). The two
 * cover cards looked fine only because they carry `class="hero"`, and a class
 * beats an element selector.
 *
 * Generated documents are protected by neutralizeTailwindPreflight(); these
 * example files are served raw by /api/templates/[id]/preview, so they are not.
 */

const SKILLS = path.join(process.cwd(), "src/lib/templates/skills");
const dirs = fs
  .readdirSync(SKILLS)
  .filter((d) => fs.existsSync(path.join(SKILLS, d, "example.html")));

describe("模板示例不能同时踩中 Preflight 陷阱", () => {
  it("至少扫到了全部内置模板", () => {
    expect(dirs.length).toBeGreaterThanOrEqual(5);
  });

  for (const dir of dirs) {
    it(`${dir}`, () => {
      const html = fs.readFileSync(path.join(SKILLS, dir, "example.html"), "utf8");
      const loadsCdn = /cdn\.tailwindcss\.com/.test(html);
      if (!loadsCdn) return; // No Preflight, no trap.

      // Typography set on a bare element selector loses to Preflight.
      const bareHeading = /(^|\})\s*h[1-6]\s*(,[^{]*)?\{[^}]*font-(size|weight)/m.test(html);
      const disablesPreflight = /corePlugins\s*:\s*\{[^}]*preflight\s*:\s*false/.test(html);

      expect(
        !bareHeading || disablesPreflight,
        `${dir} 同时做了两件互斥的事: 加载 Tailwind Play CDN, 又用裸 h1-h6 选择器设置字号/字重。` +
          `Preflight 会把标题压回 16px/400。要么去掉 CDN, 要么关掉 preflight, 要么把排版挂到类选择器上。`,
      ).toBe(true);
    });
  }
});

describe("card-xiaohongshu 的标题排版不再依赖 Preflight", () => {
  const html = fs.readFileSync(path.join(SKILLS, "card-xiaohongshu/example.html"), "utf8");

  it("不再加载 Tailwind CDN — 它一个工具类都没用过", () => {
    expect(html).not.toContain("cdn.tailwindcss.com");
  });

  it("自己声明了 line-height, 不再白蹭 Preflight 的 1.5", () => {
    // Dropping the CDN also drops Preflight's `html{line-height:1.5}`; without
    // this the whole document would reflow to the browser default.
    expect(html).toMatch(/body\s*\{[^}]*line-height\s*:\s*1\.5/);
  });

  it("h2 的字号字重仍然是作者写的那套", () => {
    expect(html).toMatch(/h2\s*\{[^}]*font-size\s*:\s*64px/);
    expect(html).toMatch(/h2\s*\{[^}]*font-weight\s*:\s*900/);
  });
});
