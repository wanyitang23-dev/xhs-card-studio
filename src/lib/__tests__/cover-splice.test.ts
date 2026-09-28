import { describe, expect, it } from "vitest";
import { canSpliceCover, COVER_SLOT_ATTR, scopeCoverCss, spliceCover } from "@/lib/xhs/cover-splice";
import { buildRenderPrompt } from "@/lib/xhs/prompts";
import type { XhsPage } from "@/lib/xhs/types";

const page = (over: Partial<XhsPage> = {}): XhsPage => ({
  id: "p1",
  kind: "cover",
  title: "标题",
  body: "",
  imageAssetIds: [],
  confirmed: true,
  ...over,
});

const COVER = `<!DOCTYPE html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC">
<style>
:root{--ink:#1a1a1a}
body{margin:0;background:#f5efe6}
.card{width:1080px;height:1440px;padding:96px;background:var(--ink)}
.card .title{font-size:120px}
@media (max-width:600px){.title{font-size:80px}}
@keyframes float{from{opacity:0}to{opacity:1}}
</style></head>
<body><div class="card"><h1 class="title text-center">封面大字</h1></div></body></html>`;

const DECK = `<!DOCTYPE html><html><head>
<script src="https://cdn.tailwindcss.com"></script>
<style>.card{width:1080px;height:1440px;padding:80px;background:#fff}.title{font-size:64px}</style>
</head><body><div class="deck">
<div class="card" ${COVER_SLOT_ATTR}></div>
<div class="card"><h2 class="title">第二页</h2></div>
</div></body></html>`;

describe("scopeCoverCss", () => {
  const classes = new Set(["card", "title"]);

  it("把页面级选择器落到封面外壳上", () => {
    const out = scopeCoverCss(":root{--a:1} html,body{margin:0} body.dark{color:red} html > body .x{a:b}", classes);
    expect(out).toContain("#xhs-cover{--a:1}");
    expect(out).toContain("#xhs-cover,#xhs-cover{margin:0}");
    expect(out).toContain("#xhs-cover.dark{color:red}");
    expect(out).toContain("#xhs-cover .x{a:b}");
  });

  it("封面自己定义的 class 改名并加作用域, @media 里也一样", () => {
    const out = scopeCoverCss(".card .title{a:b} @media (x){.title{c:d}}", classes);
    expect(out).toContain("#xhs-cover .xc-card .xc-title{a:b}");
    expect(out).toContain("@media (x){#xhs-cover .xc-title{c:d}}");
  });

  it("@keyframes / @font-face 原样保留", () => {
    const css = "@keyframes f{from{opacity:0}to{opacity:1}}@font-face{font-family:X;src:url(a.woff)}";
    expect(scopeCoverCss(css, classes)).toBe(css);
  });
});

describe("spliceCover", () => {
  const out = spliceCover(DECK, COVER);
  const doc = new DOMParser().parseFromString(out, "text/html");

  it("封面进了占位, 占位保留成品的卡片 class", () => {
    const slot = doc.querySelector(`[${COVER_SLOT_ATTR}]`)!;
    expect(slot.className).toBe("card");
    expect(slot.querySelector("#xhs-cover h1")?.textContent).toBe("封面大字");
  });

  it("封面的 class 改了名, 成品的 .card 规则碰不到它; Tailwind 工具类不动", () => {
    const h1 = doc.querySelector("#xhs-cover h1")!;
    expect(h1.className).toBe("xc-title text-center");
    expect(doc.querySelector("#xhs-cover .card")).toBeNull();
    expect(doc.querySelector("#xhs-cover .xc-card")).not.toBeNull();
  });

  it("封面的样式加了作用域, 成品自己的卡片不受影响", () => {
    const scoped = Array.from(doc.querySelectorAll("style[data-xhs-cover-style]"))
      .map((s) => s.textContent)
      .join("\n");
    expect(scoped).toContain("#xhs-cover .xc-card{");
    expect(scoped).not.toMatch(/(^|[},])\s*\.card\s*\{/);
    expect(doc.querySelectorAll(".deck > .card").length).toBe(2);
  });

  it("占位不带成品卡片的装饰 (内边距 / ::before 装饰条)", () => {
    const css = Array.from(doc.querySelectorAll("style[data-xhs-cover-style]"))
      .map((s) => s.textContent)
      .join("\n");
    expect(css).toContain(`[${COVER_SLOT_ATTR}]{padding:0!important`);
    expect(css).toContain(`[${COVER_SLOT_ATTR}]::before`);
  });

  it("带上封面的字体链接", () => {
    expect(doc.querySelector('link[href*="Noto+Serif+SC"]')).not.toBeNull();
  });

  it("成品忘了写占位时, 按第一张卡的样子补一个放在最前面", () => {
    const noSlot = DECK.replace(`<div class="card" ${COVER_SLOT_ATTR}></div>`, "");
    const d = new DOMParser().parseFromString(spliceCover(noSlot, COVER), "text/html");
    const cards = d.querySelectorAll(".deck > .card");
    expect(cards.length).toBe(2);
    expect(cards[0].querySelector("#xhs-cover")).not.toBeNull();
  });
});

describe("canSpliceCover", () => {
  it("第 1 页的配图封面上已经有, 或者没有配图: 可以拼", () => {
    expect(canSpliceCover([page()], COVER)).toBe(true);
    expect(canSpliceCover([page({ imageAssetIds: ["asset:a"] })], '<img src="asset:a">')).toBe(true);
  });

  it("第 1 页有封面上没有的配图: 退回让模型重画第 1 页", () => {
    expect(canSpliceCover([page({ imageAssetIds: ["asset:a"] })], COVER)).toBe(false);
  });

  it("没有定稿封面: 不拼", () => {
    expect(canSpliceCover([page()], "")).toBe(false);
  });
});

describe("成品 prompt 的拼接模式", () => {
  const pages = [page(), page({ id: "p2", kind: "content", title: "第二页标题", body: "正文" })];

  it("要求占位元素、不许重写封面", () => {
    const p = buildRenderPrompt({ pages, skillBody: "模板", coverHtml: COVER });
    expect(p).toContain(COVER_SLOT_ATTR);
    expect(p).toContain("不要输出下面这张封面的任何 HTML 或 CSS");
    expect(p).toContain("你输出 1 个封面占位 + 1 张卡");
    expect(p).not.toContain("只把它原样搬进最终页面");
  });

  it("第 1 页有封面上没有的配图时, 仍走让模型重画的老路", () => {
    const withImg = [page({ imageAssetIds: ["asset:zzz"] }), pages[1]];
    const p = buildRenderPrompt({ pages: withImg, skillBody: "模板", coverHtml: COVER });
    expect(p).toContain("只把它原样搬进最终页面");
    expect(p).not.toContain(`${COVER_SLOT_ATTR}></div>`);
  });
});
