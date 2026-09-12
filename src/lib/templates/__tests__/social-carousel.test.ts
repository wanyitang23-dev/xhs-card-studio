import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The carousel was the only bundled template whose example never stated a real
 * card size: it was a landscape "stage" with three 330px tiles, so what the
 * picker showed and what the tool produces (1080x1440 stacked vertically) were
 * two different things. It was also the only warm-palette dark template —
 * salmon `#f49255` on a green-black — which read as vintage rather than tech.
 *
 * Both are easy to undo by accident, and the SKILL.md palette is the one the
 * agent copies, so it has to keep matching the example the user picked from.
 */

const dir = path.join(process.cwd(), "src/lib/templates/skills/social-carousel");
const example = fs.readFileSync(path.join(dir, "example.html"), "utf8");
const skill = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");

/** Cyan -> blue -> violet, the progression both files describe. */
const ACCENTS = ["#22d3ee", "#4d7cff", "#a78bfa"];

describe("social-carousel 示例就是工具的产出形态", () => {
  it("卡片写死 1080x1440, 不是缩略图", () => {
    expect(example).toMatch(/width:\s*1080px/);
    expect(example).toMatch(/height:\s*1440px/);
  });

  it("三张卡, 纵向堆叠", () => {
    expect(example.match(/class="card c\d"/g)).toHaveLength(3);
    expect(example).toMatch(/flex-direction:\s*column/);
  });

  it("没有那张宽屏陈列台", () => {
    expect(example).not.toContain('class="stage"');
    expect(example).not.toMatch(/clamp\(\s*\d+px,\s*\d+vw/);
  });
});

describe("科技黑配色", () => {
  it("SKILL 里点名的强调色, 示例里真的用了", () => {
    for (const hex of ACCENTS) {
      expect(skill.toLowerCase()).toContain(hex);
      expect(example.toLowerCase()).toContain(hex);
    }
  });

  it("暖色调没有回来", () => {
    for (const warm of ["#f49255", "#c95a30", "#f4ede0"]) {
      expect(example.toLowerCase()).not.toContain(warm);
    }
  });

  it("卡片底是冷黑", () => {
    expect(example).toContain("#0a0e14");
  });

  /**
   * The first tech version shipped only --text and a 0.52-alpha --mute, so body
   * copy had no token. A generated deck invented a third value (0.8 alpha) and
   * put two brightnesses of body text on one card — measured at 16.6 and 10.8
   * against the same background. Both pass WCAG; side by side the dimmer one
   * reads as broken. The fix is a named body tier, so give it one.
   */
  it("文字有独立的正文档位, 不是只有'白'和'灰'", () => {
    for (const hex of ["#e8eef6", "#d6dfea", "#94a0b2"]) {
      expect(example.toLowerCase()).toContain(hex);
      expect(skill.toLowerCase()).toContain(hex);
    }
  });

  it("文字颜色是实色, 不用 rgba 透明度 — 透明度会被叠加", () => {
    const css = example.slice(example.indexOf("<style"), example.indexOf("</style>"));
    // `border-color:` contains "color:", so anchor on the property boundary.
    const textAlpha = css.match(/(?:^|[;{\s])color:\s*rgba\([^)]*0\.\d+\s*\)/g) ?? [];
    expect(textAlpha).toEqual([]);
  });

  it("SKILL 禁止拿 --mute 写正文", () => {
    expect(skill).toContain("不许拿它写正文");
    expect(skill).toContain("只能有一档亮度");
  });

  it("中文正文 500 字重 — 400 在近黑底上笔画发虚", () => {
    expect(skill).toContain("font-weight:500");
    expect(example).toMatch(/\.sub\s*\{[^}]*font-weight:\s*500/);
  });
});

describe("不重蹈 card-xiaohongshu 的覆辙", () => {
  /**
   * Preflight crushed that template's bare `h2 { font-size }` to 16px on five
   * of seven cards. This file sets type on a bare h2 too, so it must not load
   * the Play CDN. (example-preflight-trap.test.ts guards this across all
   * templates; kept here as the local statement of why.)
   */
  it("不加载 Tailwind CDN", () => {
    expect(example).not.toContain("cdn.tailwindcss.com");
  });

  it("自己声明 line-height, 不指望框架给", () => {
    expect(example).toMatch(/body\s*\{[^}]*line-height:\s*1\.5/);
  });

  it("声明 box-sizing, 否则 padding 会把 1080 撑宽、比例变成 0.755", () => {
    expect(example).toMatch(/\*\s*\{\s*box-sizing:\s*border-box/);
  });
});
