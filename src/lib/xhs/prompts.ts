/**
 * Prompt builders for the four-step flow.
 *
 * Shape mirrors `templates/shared.ts`: a hard-rules block the model must obey,
 * then the skill's own style body, then the user's material. What changes per
 * step is the *product* being asked for — a JSON outline, one cover, or the
 * finished multi-card page.
 */

import { exampleReferenceBlock } from "./example-ref";
import type { OutlineMode, PageCountSetting, XhsPage } from "./types";
import {
  estimateVerbatimPages,
  MAX_PAGES,
  MIN_PAGES,
  RECOMMENDED_MAX_PAGES,
  VERBATIM_PAGE_CHARS,
} from "./types";

/**
 * The design directives for a fixed-size card, trimmed from the inherited
 * `SHARED_DESIGN_DIRECTIVES`.
 *
 * The inherited block was written for "turn a document into a deck", where the
 * model decides how many slides to produce. Both card prompts are the opposite
 * case — the cover is exactly one card, and the render's pages are already
 * locked word for word — so its longest section told the model to do something
 * the surrounding prompt forbids. It also carried "宁可多页也不要把多个独立
 * 要点硬塞进一页", the exact wording removed from the paging rule after a
 * 200-character post came back as seven pages.
 *
 * What is kept verbatim is everything the extraction pipeline depends on:
 * no file tools, stream the document as the reply body, open with
 * `<!DOCTYPE html>`, close with `</html>`, no markdown fences. Those are a
 * contract with `extractHtml`, not style advice.
 *
 * `shared.ts` itself is left alone — `/api/convert` still imports it.
 */
const XHS_CARD_DIRECTIVES = `
你是世界级的视觉设计师 + 资深前端工程师。请输出一份**自包含的单文件 HTML**，要求：

【硬性技术要求】
- **禁止使用 Write / Edit / MultiEdit / Bash / Create / 任何文件系统工具**。不要把 HTML 写到任何 \`.html\` 文件里。前端直接捕获你的 stdout 文本, 文件落盘由前端负责。
- 直接把完整的 HTML 文档作为助手回复的正文流式输出。不要先说"我来生成"、"已输出至 …"之类的话。
- 文档以 \`<!DOCTYPE html>\` 开头, 末尾以 \`</html>\` 结束。
- 在 \`<head>\` 中通过 CDN 引入 Tailwind v3 Play (https://cdn.tailwindcss.com) 与所需的 Google Fonts。
- 不要引用任何外部图片 URL（除非你能保证 URL 长期有效；优先使用 CSS / SVG 内联绘制）。
- 必要的脚本（图表、动画）通过 jsdelivr CDN 引入；保持单文件可双击打开即用。
- 输出**纯 HTML**, 不要用 markdown 代码围栏包裹, 不要任何解释性文字。第一个字符必须是 \`<\`。

【设计准则 — 世界级标准】
- 排版: 中文优先 \`Noto Sans SC\` / \`Noto Serif SC\`, 英文 \`Inter\` / \`Manrope\` / \`SF Pro\` 风格。
- 色彩: 使用 1 个主色 + 2 个中性色 + 至多 1 个强调色; 大胆留白; 不使用纯黑纯白 (#000/#fff), 改用 \`#0a0a0a\` / \`#fafafa\`。
- 网格: 8 px 基线; 标题与正文有清晰的层级。
- 微观细节: 圆角统一 (rounded-xl/2xl), 投影柔和 (shadow-sm/lg), 边框 1px \`#e5e7eb\` / \`#262626\`。

【内容真实性】
- **必须使用用户提供的真实数据**, 不要编造、不要 lorem ipsum、不要 "Your text here"。

`;

/**
 * Hard typography rules for Chinese cards, prepended to every prompt that
 * produces HTML.
 *
 * These exist because the inherited design directives are Latin-typography
 * advice, and a model applying them to CJK produces two specific, repeatable
 * defects:
 *
 *   - `letter-spacing: -.04em` on a 96px heading. Negative tracking is a
 *     display-type technique for Latin; CJK glyphs already fill their em box,
 *     so it makes them physically collide.
 *   - `max-width: 26ch`. The `ch` unit is the width of "0" — a half-width
 *     glyph — so 26ch is about 13 Chinese characters, and a 24-character
 *     sentence wraps in the middle.
 *
 * Both were observed in real output, so the rules name the exact CSS rather
 * than giving general advice.
 */
const CJK_TYPOGRAPHY_RULES = `【中文排版硬规则 — 优先级高于任何模板里的写法】
- **字距不得为负。** \`letter-spacing\` 只能是 \`0\` 或正值。中文是全角字, 负字距会让字直接叠在一起。
  想让标题紧凑就压 \`line-height\`, 不要动字距。
- **不要用 \`ch\` 单位限制中文宽度。** \`ch\` 是半角数字「0」的宽度, \`26ch\` 只有 13 个汉字宽, 会导致句子中途断行。
  要限宽就用 \`px\` / \`em\` / 百分比, 或者干脆不限宽让它填满容器。
- **行高留够。** 中文字面比拉丁字母高: 正文 \`line-height\` ≥ 1.5, 大标题 ≥ 1.15。
  标题用 1.0 左右会让上下两行的字咬在一起。
- **让浏览器自己断行。** 除非你要刻意分句 (比如标题分成三行), 否则不要在句子中间插 \`<br>\`。
  给容器加 \`word-break: normal; line-break: strict;\`, 让标点禁则生效 (行首不出现 。，、？！」)。
- **字号必须验算。** 写下一个字号前, 先估算「这行有几个字 × 字号」会不会超出卡片宽度 (减去左右内边距)。
  **放不下的第一手段是换行, 不是缩字号。** 中文标题折成两三行是正常排版, 缩成小字则是设计失败。
  两者都不够时才适度减字号, 并且不要靠负字距硬塞。
- 中英文混排时中英文之间留半角空格。

`;

/**
 * Hard layout rules for a fixed-size card, prepended to every prompt that
 * produces HTML.
 *
 * Measured from a real 10-card render: 6 cards had colliding text, 8 collisions
 * in total. Every one had the same cause — the model laid the card out as a
 * stack of `position:absolute` blocks at hand-guessed offsets (81 absolute
 * blocks, 53 hardcoded `top:` values in one file). A heading that wraps to one
 * more line than the model predicted then runs straight through whatever sits
 * below it, because nothing is in flow to be pushed down. Four of the eight
 * collisions were content landing on the `absolute bottom` footer.
 *
 * Fonts had loaded correctly in that render, so this is not a fallback-metrics
 * problem — it is that guessed coordinates cannot survive real text.
 *
 * The contrast half of the block came from the next render. The layout rule had
 * worked — content was in flow, and the model had even labelled its own
 * decoration layer — but a *background* was still absolutely positioned at a
 * guessed `height:668px` while the white heading it was meant to sit on ran to
 * 714px. 46px of near-white type ended up on the light paper at a contrast
 * ratio of about 1.03:1. The original rule had listed 背景色块 as a legitimate
 * decoration layer, which is exactly the exemption that let this through, so
 * the two rules are now written to agree: what matters is not whether an
 * element contains text, but whether any text's legibility depends on it.
 */
const CARD_LAYOUT_RULES = `【卡片版式硬规则 — 优先级高于任何模板里的写法】
- **卡片内容必须走正常文档流, 不许用手写坐标摆放。**
  卡片外壳: \`position:relative; width:<W>px; height:<H>px; overflow:hidden\`。
  内容区: \`display:flex; flex-direction:column\` + \`padding\`, 让每一块自然把下一块往下推。
- **\`position:absolute\` 只能用在纯装饰层** (圆环 / 噪点 / 渐变光斑 / 贴纸 / 细线)。
  判断标准不是「这个元素里有没有字」, 而是「有没有文字的可读性依赖它的位置或尺寸」 —
  一块托着白字的深色背景**不是**装饰层, 见下面的配色规则。
  任何带文字的块都**不许**写 \`top:1018px\` 这种猜出来的坐标 — 标题只要比你预估多折一行,
  就会直接压在下一块上。这是实际输出里出现最多的缺陷, 不是理论风险。
- **页脚 (@账号 / 日期 / 页码) 也放进同一个 flex 流**, 用 \`margin-top:auto\` 顶到底部。
  写成 \`position:absolute; bottom:64px\` 会被上面的正文盖住。
- 正文区用 \`flex:1; min-height:0\`; 内容偏多时减**正文**字号或减内边距, 不要靠上移坐标去挤。
  **主标题不在可压缩之列** —— 要腾空间就压正文、减装饰、去掉可有可无的标签行。
- 不要用 \`<br>\` 拼行数来对齐坐标; 让文字自己折行, 版式要能容纳多折一行的情况。
- 自检: 输出前想一遍「如果这个标题折成 N+1 行, 下面那块会不会被压到」。会, 就说明你用错了绝对定位。

【配色硬规则 — 可读性不许依赖猜出来的尺寸】
- **浅色文字必须放在深色块「内部」, 由文字把块撑开。**
  写法: 深色块就是文字的父容器 (\`background:<深色>; padding:…\`), 文字在它里面走正常流。
- **禁止**「绝对定位一个固定高度的深色背景 + 文字另外走流」这种组合。
  背景色块虽然不含文字, 但白字能不能看见取决于它的高度 — 这不算装饰层, 不适用上面那条豁免。
  标题多折一行就会掉到浅色区上, 白字压白底, 等于看不见。
- 判据一句话: **谁决定了文字的颜色, 谁就必须包住这段文字。**
- 想要「上深下浅」的分割版式: 让深色区是一个 flex 子项, 高度由它内部的内容撑出来,
  浅色区是下一个 flex 子项。不要用固定 px 高度去切分卡片。
- 同理: 深色文字压在浅色图片/浅色块上时, 也要保证那块背景一定覆盖到文字底部。

【重叠硬规则 — 想压在上面就必须显式声明层级】
- **用负边距把一个块提上去压在前一个块上时, 它必须写 \`position:relative\` 和更大的 \`z-index\`。**
  否则它会被压在下面。原因是绘制顺序: 同一层叠上下文里, **定位元素(哪怕只写了
  \`position:relative\` 没写 z-index)比普通静态块后画**, 所以静态元素一定输给定位过的兄弟。
- 位置算对了不等于画得出来: 浮层的几何完全正确, 却整块被前面那个定位过的色块盖住,
  只露出边界以下的一小条。
- 一句话: **位置对了不等于看得见。** 只要两个块在视觉上重叠, 就必须明确谁在上面, 不能靠默认。
- 反过来: 深色块自己写了 \`position:relative\` 时, 别忘了它会盖住后面所有没定位的兄弟内容。
- **不许用 \`.父容器 > *\` 这种一刀切的写法去抬升内容。** 它会把你特意用
  \`position:absolute\` 抽出布局的装饰层一起罩进去, 装饰球于是掉回正常流里占掉大片高度。
  两条选择器优先级都是 (0,1,0), 写在后面的赢 —— 你自己写的 \`.blob{position:absolute}\` 会输,
  几百 px 的光斑掉回布局, 能把深色块撑到超出整张卡片, 下半张卡全被顶出去。
  **正确写法: 点名要抬升的元素** (\`.slab > .topbar, .slab > h1 { position:relative; z-index:2 }\`),
  或者在后面补一条更具体的 \`.slab > .blob{ position:absolute }\` 把装饰层救回来。

`;

/**
 * How much room one card's body gets.
 *
 * There used to be a single flat cap: 60 characters per page. That number is
 * right for a 200-character post, and wrong for everything longer. Applied to a
 * 2,600-character study note it turns every page into a bullet — the
 * derivation, the numbers and the author's own voice all get summarised away,
 * and the finished deck reads like the *outline of* the article rather than the
 * article. That is the defect this tiering fixes.
 *
 * The budget is derived from the source in code rather than described to the
 * model, because it is the one quantity here that is knowable exactly.
 *
 * The top of the range (220) is comfortably inside what a 1080x1440 card holds:
 * at the body sizes these templates set, the text area takes roughly 390
 * characters before anything overflows.
 */
function bodyLengthRule(contentChars: number): string {
  if (contentChars < 400) {
    return `- 原文很短 (约 ${contentChars} 字), 每页正文 **40-80 字**, 能用短语就不用整句。`;
  }
  if (contentChars < 1200) {
    return `- 原文中等长度 (约 ${contentChars} 字), 每页正文 **60-120 字**。`;
  }
  return `- 原文较长 (约 ${contentChars} 字), 每页正文 **120-220 字**。
  **120 字是下限, 不是上限**: 写不到 120 字, 说明你在写目录, 不是在写卡片。
  正文可以分成 2-4 小段 (段间用 \\n 换行), 例如「引子 + 公式/例子 + 结论」。`;
}

/**
 * Keep the author's own sentences.
 *
 * An earlier version of this file had a second mode that reproduced the
 * article's sentences wholesale, and it was dropped for a good reason: a card
 * is display type, and pasting whole paragraphs into one fights the format.
 * But dropping it entirely went too far the other way — with nothing asking for
 * the source's own words, every page came back paraphrased into generic
 * summary, which is exactly how a formula, a number or a first-person aside
 * disappears.
 *
 * So it returns scoped: not "reproduce the article", but "these four kinds of
 * material are quoted, not restated". Everything else is still condensed.
 */
const KEEP_SOURCE_WORDS = `【尽量用原文自己的句子】
- 原文里已经说得好的句子**直接搬过来**, 不要改写成你自己的话。以下四类一律原样保留:
  1. **公式、算式、推导** — 连中间步骤一起留 (例 \`A = R − V = 8 − 5 = 3\`), 不要只留结论。
  2. **具体数字、专有名词、英文术语** (chosen / rejected / on-policy 这类保持原文, 不要翻译)。
  3. **作者的第一人称心得** ("我以前一直以为…"), 这是这篇内容的味道, 概括掉就没了。
  4. **原文自己提的问题句** ("那 DPO 在干嘛?"), 它天然适合做卡片标题或一页的开头。
- 改写只做两件事: 删掉过渡废话, 把长句断成适合卡片阅读的短行。
- **自检**: 只看这一页的读者, 应该拿到和读原文那一段**一样的信息**,
  而不是只知道"这段在讲什么"。如果你写出来的是后者, 把这一页重写。`;

/**
 * Verbatim paging.
 *
 * The user asked for a mode that only decides where the page breaks go. That
 * makes the constraint set different, not just softer: with the words fixed,
 * the agent can no longer make a page fit by writing less, so the budget below
 * is a hard ceiling on where it may cut rather than a target length, and a
 * fixed page count becomes unsatisfiable (see buildOutlinePrompt).
 *
 * The one place some authoring is unavoidable is the card title, since most
 * prose has no headings. It is held to a fragment that appears in that page's
 * own text, so nothing on the card is a sentence the user did not write.
 */
function verbatimVoice(contentChars: number): string {
  const pages = estimateVerbatimPages(contentChars);
  return `【表达方式 — 原文模式: 你只负责分页, 不负责改写】
- **body 必须是原文里连续的一段, 一个字都不许改。** 不许概括、不许换词、不许调整语序、
  不许补充连接词、不许把两个不相邻的句子拼到一起。
- 允许你做的只有三件事: ① 决定在哪里断页 ② 删掉纯过渡性的空行 ③ 保留原文的换行。
- **每页 ${VERBATIM_PAGE_CHARS} 字以内** —— 这是一张卡装得下的量, 不是建议。
  超过就必须断页, 优先在**段落**边界断, 段落太长就在**句号**处断, 不要在句子中间断。
- 页与页之间不许有遗漏: 把所有 body 首尾相接拼起来, 应该还原出原文。
- **title 只能从这一页的正文里摘一个片段** (12 字以内, 原话, 不要新写一句话)。
  这一页里实在挑不出合适的短句时, title 留空, 也不要自己造一句。
- 结尾页用原文本来的结尾, **不要额外编一句行动号召**。
- 参考: 这篇原文约 ${contentChars} 字, 按上面的规则大概会分成 ${pages} 页左右。`;
}

/**
 * How the cards should read.
 *
 * The old "数字、对比、步骤优先做成可视化结构" line used to live here. It was
 * moved out, not deleted: it is a layout instruction, and it already appears in
 * `buildRenderPrompt` where the layout is actually decided. At outline time it
 * did damage — it reads as permission to reduce a derivation to one big number.
 */
function cardVoice(contentChars: number): string {
  return `【表达方式】
${bodyLengthRule(contentChars)}
- 提炼不等于丢信息: 原文的每个要点仍要有对应的页, 只是表达更紧凑。
- 上面的字数只约束 \`content\` 页。\`cover\` 的 body 是一行钩子 (20 字内, 可以为空),
  \`ending\` 的 body 是行动号召, 这两页都不受字数下限约束。

${KEEP_SOURCE_WORDS}`;
}


/**
 * Paging guidance when the user has not fixed a count.
 *
 * The first version of this said "页数由内容的信息量决定" plus "一页只承载一个核心
 * 观点", which reads to a model as *split every beat*. A 200-character post whose
 * own headline promised "4 张图" came back as 7 pages. So the auto branch now
 * leads with the two things that were missing: obey a count the copy states
 * about itself, and leave short content short.
 */
const AUTO_PAGE_RULE = `- 页数由你判断, 但必须先看这两条:
  1. **如果【用户内容】里写了张数, 就用那个数。** 例如标题是「4 张图讲清楚…」「三个习惯」,
     那么总页数就是 4 / 3, 不要多也不要少 — 作者已经对读者承诺了这个数字。
  2. **内容短就少分页, 不要硬凑。** 一句话能讲完的不要拆成两页; 联系紧密的两个点合成一页。
     ${RECOMMENDED_MAX_PAGES} 页是上限参考, 不是目标 — 短文案做成 3-5 页很正常。
- 只有当一页确实塞不下时才新开一页, 而不是每有一个句号就翻一页。`;

/**
 * Paging guidance in verbatim mode.
 *
 * Deliberately silent about a target count: the count is whatever the text
 * divides into, and saying anything else would compete with "keep every word".
 */
const VERBATIM_PAGE_RULE = `- **页数由原文长度决定**, 不要为了凑一个数字去合并或拆分。
  界面上设置的固定张数在原文模式下不适用, 忽略它。
- 内容真的超过 ${MAX_PAGES} 页装不下时: **不要删内容**, 就输出 ${MAX_PAGES} 页,
  由用户自己决定是删原文还是换成精简模式。`;

/** Paging guidance when the user has fixed an exact count in the UI. */
function exactPageRule(n: number): string {
  return `- **总页数必须正好是 ${n} 页, 含封面和结尾。** 这是用户在界面上指定的, 不是建议值。
  - 内容多于 ${n} 页装得下的量时: 合并相近的要点, 不要删掉任何要点。
  - 内容不足 ${n} 页时: 把某个要点展开成一页, 或补一页承上启下的过渡, 但**不要编造原文没有的信息**。
- 数一遍再输出: \`pages\` 数组的长度必须等于 ${n}。`;
}

/**
 * What goes in the footer's author slot.
 *
 * Every template's `SKILL.md` asks for 作者名 / 水印 there, and the layout rules
 * ask for a footer, but nothing supplied a name — so the agent filled the slot
 * from imagination. Across six runs it produced six different handles, and
 * within a single batch of three covers it produced three. For a real account
 * that is worse than an empty slot: the watermark is supposed to be a fixed
 * identity.
 *
 * Declining to enter one is a real choice, not a gap to be filled. So the empty
 * branch redirects the slot to a topic keyword drawn from the user's own
 * content — the footer still has something to sit in, and nothing claims to be
 * an account that does not exist.
 */
export function footerRule(handle: string | undefined | null): string {
  const h = (handle ?? "").trim().replace(/^@+/, "");
  if (h) {
    return `【页脚署名 — 原样使用, 不许改写】
- 每张卡的页脚水印一律写 \`@${h}\`, 一个字都不要改, 不要加后缀、不要意译、不要每页换一个。
- 这是用户的真实账号名, 和标题正文一样属于锁定内容。`;
  }
  return `【页脚署名 — 用户没有提供账号, 不许编】
- **不要编造任何账号名 / 昵称 / 作者名**, 也不要写 \`@你的名字\`、\`@某某\` 这类占位符。
- 页脚那个位置改放**内容关键词**: 从用户内容里取 1-3 个主题词, 写成 \`#关键词\` 的形式
  (例如 \`#产品复盘\` \`#Agent\`), 不要加 \`@\`。
- 关键词必须来自用户内容里真实出现过的主题, 不要另行发挥。
- 如果版式上这个位置放关键词很别扭, 就让它留空, 也好过写一个假账号。`;
}

/** Step ② — ask for a page-by-page plan as JSON, not HTML. */
export function buildOutlinePrompt(args: {
  content: string;
  format: string;
  skillBody: string;
  pageCount: PageCountSetting;
  /** Defaults to "condense" — the behaviour every caller had before the split. */
  mode?: OutlineMode;
}): string {
  const verbatim = args.mode === "verbatim";
  // A fixed count and "change nothing" cannot both hold: the only lever for
  // hitting a count is writing more or less. The count is dropped rather than
  // half-honoured, and the UI says so before the run starts.
  const pageRule = verbatim
    ? VERBATIM_PAGE_RULE
    : args.pageCount === "auto"
      ? AUTO_PAGE_RULE
      : exactPageRule(args.pageCount);
  return `你正在把一篇内容拆解成**小红书图文卡片的分页大纲**。这一步**只输出 JSON**, 不要输出 HTML。

【硬性规则】
1. 只输出一个 JSON 对象。第一个字符是 \`{\`, 最后一个字符是 \`}\`。
2. 不要 markdown 围栏, 不要任何解释性文字。
3. **禁止使用 Write / Edit / Bash 等文件工具**, 直接把 JSON 写在回复正文里。
4. 不要捏造原文里没有的数据、案例或数字。
5. \`body\` 里需要换行时, 写成 JSON 转义 \`\\n\`, 不要写真实换行符 — 否则 JSON 解析会失败。

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
- **封面和结尾都算在总页数里。**
${pageRule}
- 总页数不得低于 ${MIN_PAGES} 页, 不得超过 ${MAX_PAGES} 页 (小红书单帖上限)。
  如果内容多到装不下, 优先合并最次要的要点, 而不是删掉它们。
- title 是卡片上的大字, 要短 (建议 12 字以内); body 是这一页的正文, 长度见下面【表达方式】。

${verbatim ? verbatimVoice(args.content.length) : cardVoice(args.content.length)}

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
  /** The template's own `example.html` — what the user saw when they picked it. */
  exampleHtml?: string;
  /** The account name for the footer watermark; empty means "do not invent one". */
  handle?: string;
  /**
   * Screenshots the user attached to the cover page, already resolved to data
   * URLs. The cover step used to ignore these entirely — the endpoint had no
   * field for them — so a picture attached in step 2 silently never appeared.
   */
  images?: string[];
  /** Real pixel sizes for those images, so the ratio is stated, not guessed. */
  imageMeta?: ImageMeta;
}): string {
  return `${XHS_CARD_DIRECTIVES}
${CJK_TYPOGRAPHY_RULES}
${CARD_LAYOUT_RULES}
${args.skillBody.trim()}
${exampleReferenceBlock(args.exampleHtml)}

【本次任务: 只做封面这一张卡】
- 只输出**一张** \`1080×1440\` 的封面卡片, 不要输出后续内容页。
- **整个文档就是这张卡, 卡片必须正好占满视口。**
  \`body{margin:0;padding:0}\`, 卡片 \`width:1080px;height:1440px\`, 外面不要页面留白、
  不要 \`.deck\` 之类的陈列容器、不要为了"居中展示"再包一层。
  这张卡会被直接导出成图片, 任何多出来的外壳都会变成图片边上的空白。
- 不要导航、不要页码。

【这一版的视觉方向】
${args.direction}

${footerRule(args.handle)}
${coverImageBlock(args.images, args.imageMeta)}
【封面文案 — 原样使用, 不要改写】
主标题: ${args.title}
${args.body ? `副标题 / 钩子: ${args.body}` : "（无副标题）"}
`;
}

/**
 * How to reserve space for a picture whose real size is now stated.
 *
 * The previous wording — "the size is unknown, so pin a height and use
 * `object-fit:cover`" — guaranteed a crop: `cover` fills the box and discards
 * whatever does not fit. A portrait screenshot in a 928x300 box loses most of
 * itself. The size is no longer unknown, so the box can simply match it.
 */
const IMAGE_RATIO_RULE = `- **按下面给出的真实宽高比留版面**: 用 \`aspect-ratio: 宽 / 高\` 或按比例算出的
  宽高, 让容器和图片同比例。**不要写死一个高度再用 \`object-fit:cover\` 去填满** ——
  \`cover\` 会把超出容器的部分裁掉, 竖图塞进横条里就只剩中间一条。
- 确实想做满幅裁切时才用 \`cover\`, 并且要清楚那是有意为之, 而不是因为不知道比例。
`;

/**
 * The same rule when no size is on record.
 *
 * Pointing at "the ratio given below" when nothing is given would be a dangling
 * reference, so the fallback asks for a container that follows the image
 * instead of one that constrains it.
 */
const IMAGE_RATIO_RULE_UNKNOWN = `- 这张图的尺寸没有记录。**不要写死高度再用 \`object-fit:cover\`** —— 那会把图裁掉。
  给容器定宽度、让高度跟着图片走 (\`height:auto\`), 或者用 \`object-fit:contain\` 完整显示。
`;

/** Whichever form of the rule the available metadata supports. */
function imageRatioRule(tokens: string[], meta: ImageMeta | undefined): string {
  return tokens.some((t) => meta?.[t]?.width && meta?.[t]?.height)
    ? IMAGE_RATIO_RULE
    : IMAGE_RATIO_RULE_UNKNOWN;
}

/** `asset:<id>` → the picture's real pixel size, for prompts that place images. */
export type ImageMeta = Record<string, { width: number; height: number }>;

/**
 * One line describing an attached picture.
 *
 * The size is the whole point. Without it the model is placing a picture it
 * cannot see, and the only safe-looking move is to pin a box and crop to fill
 * — which is exactly how a 1170x2532 screenshot came back as a thin strip.
 */
function imageLine(token: string, meta: ImageMeta | undefined): string {
  const size = meta?.[token];
  if (!size?.width || !size?.height) return `  - ${token}`;
  const { width, height } = size;
  const r = width / height;
  const shape = r > 1.15 ? "横图" : r < 0.87 ? "竖图" : "方图";
  return `  - ${token} — ${width}×${height} (${shape}, 宽高比 ${r.toFixed(2)})`;
}

/**
 * The cover's attached pictures.
 *
 * Step 2 lets a screenshot be attached to any page, the cover included, but
 * `/api/cover` had no field to carry one — so the picture showed in the outline
 * and then quietly failed to reach the agent. It is the user's own material;
 * an attached image should be visible in the thing it was attached to.
 */
function coverImageBlock(images: string[] | undefined, meta?: ImageMeta): string {
  if (!images?.length) return "";
  return `
【这一页的配图 — 必须真的出现在卡片里】
- 下面 ${images.length} 张图是用户为封面上传的。用 \`<img src="asset:xxx">\` 嵌进卡片,
  \`src\` **就写这个短标记本身**, 工具会在你输出之后把真实图片替换进去。
- **绝对不要自己写 \`data:image/...;base64,\` 这类内容**, 也不要编造图片 URL 或占位图。
  图片数据有几十万个字符, 你抄不完, 抄到一半输出就被截断、整张卡片作废。
- 配图是内容的一部分, 不是装饰: 给它安排真实的版面位置 (整幅、半幅、圆角卡片里都可以),
  不要缩成角落里的小图标。图片区域和文字区域不要互相压盖。
${imageRatioRule(images, meta)}${images.map((t) => imageLine(t, meta)).join("\n")}
`;
}

/** Step ④ — the finished multi-card page, built from the confirmed outline. */
export function buildRenderPrompt(args: {
  pages: XhsPage[];
  skillBody: string;
  coverHtml?: string;
  /** The template's own `example.html` — what the user saw when they picked it. */
  exampleHtml?: string;
  /** The account name for the footer watermark; empty means "do not invent one". */
  handle?: string;
  /** Real pixel sizes for attached images, so the ratio is stated, not guessed. */
  imageMeta?: ImageMeta;
}): string {
  const pageBlocks = args.pages
    .map((p, i) => {
      // Tokens, never bytes: a data URL here would have to be copied back out
      // of the model verbatim, and a few hundred thousand characters of base64
      // truncates the answer long before the document closes.
      const imgs = p.imageAssetIds.length
        ? `\n  配图 (必须嵌入这一页, 写成 <img src="asset:xxx">, src 就用下面的短标记本身,
    工具会在生成后替换成真实图片; 不要自己写 base64、不要改成占位图):\n${p.imageAssetIds
            .map((a) => imageLine(a, args.imageMeta))
            .join("\n")}`
        : "";
      // A body can now span several lines. Indent the continuation lines so the
      // page block stays one visually distinct unit instead of the second line
      // looking like a new top-level field.
      const body = (p.body || "（无）").replace(/\n/g, "\n    ");
      return `第 ${i + 1} 页 [${p.kind}]\n  标题: ${p.title}\n  正文: ${body}${imgs}`;
    })
    .join("\n\n");

  // The cover is locked, but page 1 can still carry an attachment that the
  // locked cover never had — the cover step and the outline are separate. Left
  // unsaid, "reproduce this card exactly" and "embed this image" contradict
  // each other and the image is what gets dropped.
  const coverHasImages = (args.pages[0]?.imageAssetIds?.length ?? 0) > 0;
  const coverBlock = args.coverHtml
    ? `\n【封面已定稿 — 第 1 页必须完全沿用下面这张卡的设计 (配色 / 字体 / 版式), 只把它原样搬进最终页面】${
        coverHasImages
          ? `
**例外: 第 1 页列出的配图必须出现在这张卡上。** 如果定稿的封面里还没有它, 就在保持
原有配色、字体、字号层级不变的前提下, 给它腾出版面位置 —— 沿用设计不等于丢掉用户的图。`
          : ""
      }
${args.coverHtml}
`
    : "";

  return `${XHS_CARD_DIRECTIVES}
${CJK_TYPOGRAPHY_RULES}
${CARD_LAYOUT_RULES}
${args.skillBody.trim()}
${exampleReferenceBlock(args.exampleHtml)}

【本次任务: 按已确认的分页出成品】
- 分页已经由用户逐页确认过。**页数、每页的标题和正文都已锁定, 一个字都不许改, 不许合并、不许拆分、不许增删页。**
- 你的工作只是把每一页**做好看**: 挑版式、配色、字号层级、图文排布。
- 数字、对比、步骤优先做成可视化结构 (大数字 / 左右对比 / 编号步骤), 不要堆成一段话 ——
  但这是**排版手段**, 文字本身依然一个字都不许改。
- 后续内容页的视觉风格必须和封面保持同一套系统。

${footerRule(args.handle)}
${
    args.pages.some((p) => p.imageAssetIds.length)
      ? `\n【配图的版面】\n${imageRatioRule(
          args.pages.flatMap((p) => p.imageAssetIds),
          args.imageMeta,
        )}`
      : ""
  }
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

/**
 * Step ④-b — the post copy that goes in the caption box when the images are
 * uploaded.
 *
 * Separate from the render because it is a different artifact: the cards are
 * the pictures, this is the text beside them. Asked for as JSON so the UI can
 * offer per-field copy buttons rather than one blob.
 */
export function buildCaptionPrompt(args: { pages: XhsPage[] }): string {
  const outline = args.pages
    .map((p, i) => `第 ${i + 1} 页 [${p.kind}] ${p.title}${p.body ? ` — ${p.body}` : ""}`)
    .join("\n");

  return `你要为一组已经做好的小红书图文卡片写**配文**（发布时填在正文框里的那段字）。

【硬性规则】
1. 只输出一个 JSON 对象。第一个字符是 \`{\`, 最后一个字符是 \`}\`。
2. 不要 markdown 围栏, 不要任何解释性文字。
3. **禁止使用 Write / Edit / Bash 等文件工具**, 直接把 JSON 写在回复正文里。
4. **只能用下面卡片里已有的信息**, 不要编造数据、案例、数字或不存在的结论。

【JSON 结构】
{
  "title": "标题",
  "body": "正文",
  "tags": ["标签1", "标签2"]
}

【标题】
- 20 字以内, 越短越好。这是信息流里唯一会被看到的一行。
- 要有钩子: 给出具体收益、制造好奇、或点明痛点。不要写成书名式的中性概括。
- 可以带 1 个 emoji, 不要堆砌。

【正文】
- 300-500 字。开头两行要能独立成立 —— 信息流里只展开这两行。
- **段落之间空一行**, 每段 1-3 句。手机上大段文字没人读。
- 适度用 emoji 做段落标记, 但一段最多一个。
- 结尾放一句互动引导 (收藏 / 关注 / 评论区聊聊)。
- 用 \`\\n\` 表示换行。不要用 markdown 语法 (不要 # 井号标题、不要 ** 加粗) —— 小红书不渲染这些。

【标签】
- 5-8 个, 每个不带 # 号 (前端会自动加)。
- 混合: 2-3 个大词 (覆盖面广) + 3-5 个精准长尾词。
- 只用与内容真实相关的词, 不要蹭无关热词。

【这组卡片的分页 — 配文必须与它们一致】
${outline}
`;
}
