import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * All five bundled examples centred their cards with `align-items:center` (or,
 * for deck-xhs-post, `justify-content:center`). That is fine until the window
 * is narrower than the card, at which point the overflow splits across both
 * sides and the left half cannot be scrolled to.
 *
 * `margin-inline:auto` centres when the card fits and collapses to 0 when it
 * does not, which leaves the card left-aligned and entirely reachable.
 * Measured in Chrome at 700px: leftmost card edge 0 for all five. At 1400px
 * they are still centred (153px, or 288px for the narrower deck-xhs-post card).
 *
 * The examples are what an agent copies, so the pattern has to be right here —
 * extract-html's fit guard is the backstop for when it is not.
 */

const skills = path.join(process.cwd(), "src/lib/templates/skills");
const names = fs.readdirSync(skills).filter((d) => fs.existsSync(path.join(skills, d, "example.html")));

describe.each(names)("%s", (name) => {
  const css = (() => {
    const html = fs.readFileSync(path.join(skills, name, "example.html"), "utf8");
    return html.slice(html.indexOf("<style"), html.lastIndexOf("</style>"));
  })();

  /**
   * Only the rule that lays out the card stack matters — centring *inside* a
   * card is ordinary and must not trip this. `.deck` has to match as a whole
   * class token, or `.deck-header` (a flex row within a card) counts as a deck.
   */
  const isStack = /(^|[\s,>])\.(deck|cards)(?![\w-])|^\s*\.tpl-[\w-]+\s*$/;
  const deckRules = css.split("}").filter((r) => isStack.test(r.split("{")[0] ?? ""));

  it("卡片栈不用 flex 居中 — 窄窗口下左半边会够不着", () => {
    for (const rule of deckRules) {
      expect(rule).not.toMatch(/align-items:\s*center/);
      expect(rule).not.toMatch(/justify-content:\s*center/);
    }
  });

  it("改用 auto 外边距居中", () => {
    expect(css).toMatch(/margin-inline:\s*auto/);
  });
});
