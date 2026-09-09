---
name: deck-xhs-pastel
zh_name: "马卡龙慢生活 Deck"
en_name: "Pastel Slow-life Deck"
emoji: "🍡"
description: "奶油底 + 柔光 blob + 马卡龙圆角卡片 + Playfair 斜体序号"
category: slides
scenario: personal
aspect_hint: "1080×1440 (3:4)"
featured: 33
tags: ["xhs", "pastel", "lifestyle", "lifestyle"]
---

【模板: 马卡龙慢生活 Deck】
【意图】生活方式 / 个人成长 / 情绪向内容, 做成小红书竖版图文。
【结构 — 与「小红书图文卡片」同一套骨架】
- 无框架、无 JS。`body` 里一个 `.deck` 纵向排列若干 `.card`, 卡间距 24px。
- `*{box-sizing:border-box}` 必须写。否则 padding 会加在 height 之外, 1440 的卡变成 1616, 比例就错了。
- `.card{width:1080px;height:1440px;overflow:hidden;display:flex;flex-direction:column;padding:80-90px}`
  **写死 height, 不要只用 `aspect-ratio`** —— 它只是首选尺寸, 内容一多就把卡撑高。
- 每张卡的骨架: 顶部一行 (标签 + 页码) → 中间内容 (`margin:auto 0` 垂直居中) → 底部一行页脚。
- 内容装不下就减字号或拆页, 不要让它溢出被裁掉。
【视觉】
- 奶油 `#fef8f1` 卡底, 页面底色 `#f6ece2`
- 三个柔光 blob 做装饰: **必须 `position:absolute`**, 否则会占据纵向空间把标题挤下去
- Playfair Display 斜体衬线做强调词与序号, 正文用 Noto Sans SC
- 26px 圆角马卡龙小卡 (桃 #ffd8c2 / 薄荷 #c8ecd8 / 天 #c9dcfb / 柠 #fdf0b2 / 玫 #fcd0dd)
- 顶栏: 白底 chip + 右侧页码; 底栏: 作者名 + 页序
- 收尾卡用深紫 `#2a2340` 反白
