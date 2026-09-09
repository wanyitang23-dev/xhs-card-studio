---
name: deck-xhs-white
zh_name: "白底杂志风 Deck"
en_name: "White Editorial Deck"
emoji: "🌈"
description: "纯白 + 顶部彩虹 bar + 渐变文字 + 马卡龙软卡片 + 黑底 pill"
category: slides
scenario: marketing
aspect_hint: "1080×1440 (3:4)"
featured: 27
tags: ["editorial", "rainbow", "macaron"]
---

【模板: 白底杂志风 Deck】
【意图】白底杂志风的小红书竖版图文。
【结构 — 与「小红书图文卡片」同一套骨架】
- 无框架、无 JS。`body` 里一个 `.deck` 纵向排列若干 `.card`, 卡间距 24px。
- `*{box-sizing:border-box}` 必须写。否则 padding 会加在 height 之外, 1440 的卡变成 1616, 比例就错了。
- `.card{width:1080px;height:1440px;overflow:hidden;display:flex;flex-direction:column;padding:80-90px}`
  **写死 height, 不要只用 `aspect-ratio`** —— 它只是首选尺寸, 内容一多就把卡撑高。
- 每张卡的骨架: 顶部一行 (标签 + 页码) → 中间内容 (`margin:auto 0` 垂直居中) → 底部一行页脚。
- 内容装不下就减字号或拆页, 不要让它溢出被裁掉。
【视觉】
- 纯白卡底, 页面底色 `#eef0f4`
- 每张卡顶部一条 12px 的 10 色彩虹 bar (用 `.card::before`, 宽度跟随卡片而不是视口)
- 60-92px display 标题; 关键词用紫→蓝→绿→橙→粉的渐变文字 (`background-clip:text`)
- 马卡龙浅色格子 (紫 #f4efff / 蓝 #eef4ff / 绿 #edfdf3 / 橙 #fff5ea), 2×2 网格或单列
- 黑底白字 pill 标重点; `.focus` 描边块放一句要记住的话
- 编号列表用黑色圆形数字徽章
- 收尾卡整卡反白 (`#111318` 底)
