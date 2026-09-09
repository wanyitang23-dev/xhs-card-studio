/**
 * Prompt builders for the four-step flow.
 *
 * Shape mirrors `templates/shared.ts`: a hard-rules block the model must obey,
 * then the skill's own style body, then the user's material. What changes per
 * step is the *product* being asked for — a JSON outline, one cover, or the
 * finished multi-card page.
 */

import { SHARED_DESIGN_DIRECTIVES } from "@/lib/templates/shared";
import type { ContentMode, XhsPage } from "./types";
import { MAX_PAGES, RECOMMENDED_MAX_PAGES } from "./types";

const MODE_RULES: Record<ContentMode, string> = {
  verbatim: `【表达方式: 保留原文】
- 尽量沿用用户原文的句子和措辞, 不要改写成你自己的腔调。
- 必须覆盖原文的每一个要点, 一个都不能丢。宁可多分几页, 也不要合并压缩。
- 只允许做这些加工: 删掉纯过渡的废话、把长句拆短、给段落起一个短标题。`,
  condensed: `【表达方式: 可视化精简】
- 把原文提炼成适合卡片阅读的短句, 一页一个核心观点。
- 每页正文控制在 60 字以内, 能用短语就不用整句。
- 数字、对比、步骤优先做成可视化结构 (大数字 / 左右对比 / 编号步骤), 不要堆成一段话。
- 提炼不等于丢信息: 原文的每个要点仍要有对应的页, 只是表达更短。`,
};

/** Step ② — ask for a page-by-page plan as JSON, not HTML. */
export function buildOutlinePrompt(args: {
  content: string;
  format: string;
  mode: ContentMode;
  skillBody: string;
}): string {
  return `你正在把一篇内容拆解成**小红书图文卡片的分页大纲**。这一步**只输出 JSON**, 不要输出 HTML。

【硬性规则】
1. 只输出一个 JSON 对象。第一个字符是 \`{\`, 最后一个字符是 \`}\`。
2. 不要 markdown 围栏, 不要任何解释性文字。
3. **禁止使用 Write / Edit / Bash 等文件工具**, 直接把 JSON 写在回复正文里。
4. 不要捏造原文里没有的数据、案例或数字。

【JSON 结构】
{
  "pages": [
    { "kind": "cover",   "title": "封面主标题", "body": "副标题或钩子, 可为空" },
    { "kind": "content", "title": "这一页的小标题", "body": "这一页的正文" },
    { "kind": "ending",  "title": "结尾页标题", "body": "行动号召" }
  ]
}

【分页规则】
- 第一页必须是 \`cover\`, 最后一页必须是 \`ending\`, 中间全是 \`content\`。
- 页数由内容的信息量决定, **不是固定值**。一页只承载一个核心观点。
- 总页数不得超过 ${MAX_PAGES} 页 (小红书单帖上限); 通常 ${RECOMMENDED_MAX_PAGES} 页以内阅读体验最好。
  如果内容多到装不下, 优先合并最次要的要点, 而不是删掉它们。
- title 是卡片上的大字, 要短 (建议 12 字以内); body 是正文。

${MODE_RULES[args.mode]}

【这套卡片将使用的视觉模板 — 仅供你判断分页粒度, 这一步不要写任何 HTML】
${args.skillBody.trim()}

【输入格式】: ${args.format}
【用户内容】:
${args.content}
`;
}

/** Step ③ — one cover candidate. Same skill, a nudged visual direction. */
export function buildCoverPrompt(args: {
  title: string;
  body: string;
  direction: string;
  skillBody: string;
}): string {
  return `${SHARED_DESIGN_DIRECTIVES}
${args.skillBody.trim()}

【本次任务: 只做封面这一张卡】
- 只输出**一张** \`1080×1440\` 的封面卡片, 不要输出后续内容页。
- 页面里只有这一张卡, 居中显示, 不要导航、不要页码。

【这一版的视觉方向】
${args.direction}

【封面文案 — 原样使用, 不要改写】
主标题: ${args.title}
${args.body ? `副标题 / 钩子: ${args.body}` : "（无副标题）"}
`;
}

/** Step ④ — the finished multi-card page, built from the confirmed outline. */
export function buildRenderPrompt(args: {
  pages: XhsPage[];
  mode: ContentMode;
  skillBody: string;
  coverHtml?: string;
}): string {
  const pageBlocks = args.pages
    .map((p, i) => {
      const imgs = p.imageAssetIds.length
        ? `\n  配图 (必须原样嵌入这一页, 用 <img src="…"> , 不要改成占位图):\n${p.imageAssetIds
            .map((a) => `  - ${a}`)
            .join("\n")}`
        : "";
      return `第 ${i + 1} 页 [${p.kind}]\n  标题: ${p.title}\n  正文: ${p.body || "（无）"}${imgs}`;
    })
    .join("\n\n");

  const coverBlock = args.coverHtml
    ? `\n【封面已定稿 — 第 1 页必须完全沿用下面这张卡的设计 (配色 / 字体 / 版式), 只把它原样搬进最终页面】
${args.coverHtml}
`
    : "";

  return `${SHARED_DESIGN_DIRECTIVES}
${args.skillBody.trim()}

【本次任务: 按已确认的分页出成品】
- 分页已经由用户逐页确认过。**页数、每页的标题和正文都已锁定, 一个字都不许改, 不许合并、不许拆分、不许增删页。**
- 你的工作只是把每一页**做好看**: 挑版式、配色、字号层级、图文排布。
- 后续内容页的视觉风格必须和封面保持同一套系统。

${MODE_RULES[args.mode]}

${coverBlock}
【已确认的分页 — 共 ${args.pages.length} 页】
${pageBlocks}
`;
}

/**
 * Step ①-b (optional) — read a page the user likes and write the style rules
 * that would reproduce it.
 *
 * This is the inverse of every other prompt here: instead of rules → page, it
 * asks for page → rules. It exists so a user who cannot write a SKILL.md can
 * still contribute a template by uploading an example they like.
 */
export function buildDerivePrompt(args: { html: string }): string {
  return `你要阅读一份 HTML 页面, 然后**反推出它的设计规格**, 写成一份给 AI 用的模板说明。

【硬性规则】
1. 只输出模板说明的正文, 不要 markdown 围栏, 不要"以下是…"之类的开场白。
2. **禁止使用 Write / Edit / Bash 等文件工具**, 直接写在回复正文里。
3. 用中文写, 用【小节标题】+ 短横线列表的格式。
4. 描述**可复用的规格**, 不要描述这份页面的具体内容。
   例: 写"卡片圆角 32px, 卡间距 24px", 不要写"第三张卡讲的是 prompt 技巧"。

【必须覆盖的内容】
- 【配色】底色、卡片背景 (含渐变的角度和起止色)、文字色、强调色, 都给出具体的十六进制色值。
- 【字体】中英文字体族、标题字号字重、正文字号字重、行高。
- 【尺寸】卡片宽高、圆角、内边距、卡片之间的间距。
- 【版式】每张卡上的元素有哪些 (页码 / 标签 / 大号编号 / 标题 / 正文 / 水印), 分别放在什么位置。
- 【留给内容决定的部分】明确写出哪些东西**不**固定 —— 比如卡片数量、每张卡的具体布局, 由内容长度决定。

【要分析的 HTML】
${args.html}
`;
}
