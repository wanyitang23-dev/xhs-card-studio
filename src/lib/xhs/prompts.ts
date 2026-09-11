/**
 * Prompt builders for the four-step flow.
 *
 * Shape mirrors `templates/shared.ts`: a hard-rules block the model must obey,
 * then the skill's own style body, then the user's material. What changes per
 * step is the *product* being asked for — a JSON outline, one cover, or the
 * finished multi-card page.
 */

import { SHARED_DESIGN_DIRECTIVES } from "@/lib/templates/shared";
import { exampleReferenceBlock } from "./example-ref";
import type { PageCountSetting, XhsPage } from "./types";
import { MAX_PAGES, MIN_PAGES, RECOMMENDED_MAX_PAGES } from "./types";

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
- **标题有字号下限。** 卡片主标题不得小于卡片宽度的 6%(1080 宽的卡即 ≥64px), 封面主标题不得小于
  8%(即 ≥86px) —— 封面主标题是整张卡的视觉焦点, 必须一眼可读。
  宁可让标题占掉半张卡、宁可删掉旁边的装饰元素, 也不要把它缩到和正文一样大。
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
  实测缺陷: \`.block-clay{position:absolute;height:668px}\` 配白色标题, 标题实际折了 5 行、
  底部到 714px, 于是有 46px 的白字落在浅色纸面上, 对比度约 1.03:1, 完全看不见。
- 判据一句话: **谁决定了文字的颜色, 谁就必须包住这段文字。**
- 想要「上深下浅」的分割版式: 让深色区是一个 flex 子项, 高度由它内部的内容撑出来,
  浅色区是下一个 flex 子项。不要用固定 px 高度去切分卡片。
- 同理: 深色文字压在浅色图片/浅色块上时, 也要保证那块背景一定覆盖到文字底部。

【重叠硬规则 — 想压在上面就必须显式声明层级】
- **用负边距把一个块提上去压在前一个块上时, 它必须写 \`position:relative\` 和更大的 \`z-index\`。**
  否则它会被压在下面。原因是绘制顺序: 同一层叠上下文里, **定位元素(哪怕只写了
  \`position:relative\` 没写 z-index)比普通静态块后画**, 所以静态元素一定输给定位过的兄弟。
- 实测缺陷: \`.slab{position:relative}\` 深色块 0-637px, 下面浅色区里的浮层卡片用
  \`margin-top:-100px\` 上提到 537-679px, 想压在分界线上。布局完全正确, 但命中测试显示
  537-637 这 100px 画出来的是 slab —— 卡片只露出底下 42px, 文字被吃掉大半。
  补上 \`position:relative;z-index:3\` 后, 几何一点没变, 卡片正常显示在最上层。
- 一句话: **位置对了不等于看得见。** 只要两个块在视觉上重叠, 就必须明确谁在上面, 不能靠默认。
- 反过来: 深色块自己写了 \`position:relative\` 时, 别忘了它会盖住后面所有没定位的兄弟内容。
- **不许用 \`.父容器 > *\` 这种一刀切的写法去抬升内容。** 它会把你特意用
  \`position:absolute\` 抽出布局的装饰层一起罩进去, 装饰球于是掉回正常流里占掉大片高度。
  两条选择器优先级都是 (0,1,0), 写在后面的赢 —— 你自己写的 \`.blob{position:absolute}\` 会输。
  实测缺陷: \`.slab > *{position:relative}\` 让两个 460px / 380px 的光斑进入布局,
  深色块从约 870px 撑到 1708px(卡片只有 1440), 下半张浅色区整个被顶到卡片外, 正文、
  三个格子、页脚分别超出底部 384 / 594 / 654px, 成品只剩一块黑底。
  **正确写法: 点名要抬升的元素** (\`.slab > .topbar, .slab > h1 { position:relative; z-index:2 }\`),
  或者在后面补一条更具体的 \`.slab > .blob{ position:absolute }\` 把装饰层救回来。

`;

/**
 * How the cards should read.
 *
 * There used to be a second mode that reproduced the article's own sentences.
 * It was dropped: a card is a few dozen characters of display type, so pasting
 * paragraphs into one fights the format rather than using it.
 */
const CARD_VOICE = `【表达方式】
- 把原文提炼成适合卡片阅读的短句。
- 每页正文控制在 60 字以内, 能用短语就不用整句。
- 数字、对比、步骤优先做成可视化结构 (大数字 / 左右对比 / 编号步骤), 不要堆成一段话。
- 提炼不等于丢信息: 原文的每个要点仍要有对应的页, 只是表达更短。`;


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
}): string {
  const pageRule =
    args.pageCount === "auto" ? AUTO_PAGE_RULE : exactPageRule(args.pageCount);
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
- **封面和结尾都算在总页数里。**
${pageRule}
- 总页数不得低于 ${MIN_PAGES} 页, 不得超过 ${MAX_PAGES} 页 (小红书单帖上限)。
  如果内容多到装不下, 优先合并最次要的要点, 而不是删掉它们。
- title 是卡片上的大字, 要短 (建议 12 字以内); body 是正文。

${CARD_VOICE}

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
}): string {
  return `${SHARED_DESIGN_DIRECTIVES}
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
${coverImageBlock(args.images)}
【封面文案 — 原样使用, 不要改写】
主标题: ${args.title}
${args.body ? `副标题 / 钩子: ${args.body}` : "（无副标题）"}
`;
}

/**
 * The cover's attached pictures.
 *
 * Step 2 lets a screenshot be attached to any page, the cover included, but
 * `/api/cover` had no field to carry one — so the picture showed in the outline
 * and then quietly failed to reach the agent. It is the user's own material;
 * an attached image should be visible in the thing it was attached to.
 */
function coverImageBlock(images: string[] | undefined): string {
  if (!images?.length) return "";
  return `
【这一页的配图 — 必须真的出现在卡片里】
- 下面 ${images.length} 张图是用户为封面上传的。用 \`<img src="asset:xxx">\` 嵌进卡片,
  \`src\` **就写这个短标记本身**, 工具会在你输出之后把真实图片替换进去。
- **绝对不要自己写 \`data:image/...;base64,\` 这类内容**, 也不要编造图片 URL 或占位图。
  图片数据有几十万个字符, 你抄不完, 抄到一半输出就被截断、整张卡片作废。
- 配图是内容的一部分, 不是装饰: 给它安排真实的版面位置 (整幅、半幅、圆角卡片里都可以),
  不要缩成角落里的小图标。图片区域和文字区域不要互相压盖。
- 图片的实际长宽未知, 所以要给它一个确定的容器 (例如固定高度 + \`object-fit:cover\`),
  不要让它按原始尺寸把版面撑开。
${images.map((token) => `  - ${token}`).join("\n")}
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
}): string {
  const pageBlocks = args.pages
    .map((p, i) => {
      // Tokens, never bytes: a data URL here would have to be copied back out
      // of the model verbatim, and a few hundred thousand characters of base64
      // truncates the answer long before the document closes.
      const imgs = p.imageAssetIds.length
        ? `\n  配图 (必须嵌入这一页, 写成 <img src="asset:xxx">, src 就用下面的短标记本身,
    工具会在生成后替换成真实图片; 不要自己写 base64、不要改成占位图):\n${p.imageAssetIds
            .map((a) => `  - ${a}`)
            .join("\n")}`
        : "";
      return `第 ${i + 1} 页 [${p.kind}]\n  标题: ${p.title}\n  正文: ${p.body || "（无）"}${imgs}`;
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

  return `${SHARED_DESIGN_DIRECTIVES}
${CJK_TYPOGRAPHY_RULES}
${CARD_LAYOUT_RULES}
${args.skillBody.trim()}
${exampleReferenceBlock(args.exampleHtml)}

【本次任务: 按已确认的分页出成品】
- 分页已经由用户逐页确认过。**页数、每页的标题和正文都已锁定, 一个字都不许改, 不许合并、不许拆分、不许增删页。**
- 你的工作只是把每一页**做好看**: 挑版式、配色、字号层级、图文排布。
- 后续内容页的视觉风格必须和封面保持同一套系统。

${CARD_VOICE}

${footerRule(args.handle)}

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
