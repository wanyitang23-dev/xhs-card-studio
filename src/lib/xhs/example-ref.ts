/**
 * Turning a template's `example.html` into a reference the agent can actually
 * look at.
 *
 * Until now this file was only ever served to the browser — the gallery
 * thumbnail and the preview pane. The prompt carried `SKILL.md`'s prose alone,
 * so the agent had a *description* of the look ("26px 圆角马卡龙小卡",
 * "Playfair Display 斜体序号") but had never seen it. Users pick a template by
 * its picture, so the output kept arriving as a different design that happened
 * to use the same words.
 *
 * The built-in examples run 6–30 KB, which is comfortably affordable. A
 * user-uploaded template has no such guarantee, hence the cap.
 */

/** Roughly 15k tokens — well under any agent's budget, over every built-in. */
export const MAX_EXAMPLE_CHARS = 60_000;

/**
 * Bound an example for inclusion in a prompt.
 *
 * Over the cap, the `<style>` blocks are kept in preference to the markup: they
 * carry the design system (palette, type scale, component classes), which is
 * the part that has to survive. Markup can be re-derived from the rules; a
 * colour ramp cannot.
 */
export function trimExample(html: string, max: number = MAX_EXAMPLE_CHARS): string {
  const src = html.trim();
  if (!src) return "";
  if (src.length <= max) return src;

  const styles = [...src.matchAll(/<style[\s>][\s\S]*?<\/style>/gi)].map((m) => m[0]).join("\n");
  if (styles && styles.length <= max) {
    return `${styles}\n<!-- 示例的 HTML 结构过长, 上面只保留了完整的样式系统 -->`;
  }
  const kept = (styles || src).slice(0, max);
  return `${kept}\n<!-- 示例被截断 -->`;
}

/**
 * The prompt section that ships the example.
 *
 * The instruction has to be explicit about the split between *look* and
 * *content*: the example ships with its own sample copy (a sleep-habits post,
 * in one case), and the pages for this run are already locked by the user.
 */
export function exampleReferenceBlock(html: string | undefined | null): string {
  const trimmed = trimExample(html ?? "");
  if (!trimmed) return "";
  return `
【模板的参考实现 — 成品必须看起来是同一套模板】
下面是这套模板的真实产出。**用户是看着这张图选的模板**, 所以你的成品必须一眼就能认出是同一套视觉。

- **要照搬的**: 配色 (CSS 变量 / 色值) / 字体搭配 / 卡片骨架与内边距 / 组件写法
  (chip、圆角小卡、序号、blob、分隔线、页脚) / 间距节奏 / 圆角与投影的量级。
- **不要照搬的**: 它的文案、它的页数、它举的例子。内容一律以【本次任务】里锁定的为准。
- 本次内容的结构和示例不一样时, **用示例里现成的组件去承载新内容**, 不要另起一套视觉。
- 示例里没有的版式可以自己加, 但必须沿用同一套色板和字体, 不要引入新的主色。

\`\`\`html
${trimmed}
\`\`\`
`;
}
