# 小红书图文自动化生成

在本地 coding-agent CLI 上跑的小红书图文工具。

## 跑起来

```bash
npm install
npm run dev
```

打开 http://localhost:3000

不需要 API key —— 复用你终端里已经登录的 `claude` / `codex` / `cursor-agent` 等 CLI。
顶部右上角选一个 agent 即可。

## 多任务

左侧任务栏可以同时开多篇文章，各自独立走四步流程，互不干扰。
一篇在生成时可以切到另一篇继续编辑——流式结果会写回发起它的那个任务，
任务栏上的小圆点显示哪些还在跑。任务名默认取文章首行，双击可改。

## 四步流程

| 步骤 | 做什么 | 接口 |
|---|---|---|
| ① 贴文章 | 粘贴内容、定张数、填小红书号、选模板 | — |
| ② 定分页 | agent 先拆好，你逐页改文案、加减页、传配图，逐页确认 | `POST /api/outline` |
| ③ 挑封面 | 同一份文案生成三种构图，并排对比选一个 | `POST /api/cover` ×3 并发 |
| ④ 出成品 | 按锁定的分页 + 选定封面生成完整 HTML，导出 PNG；右栏同时产出可一键复制的标题 / 正文 / 标签 | `POST /api/render`、`POST /api/caption` |

第 ② 步是整个工具的关键：它让 agent 输出**结构化清单**而不是网页
（[`extract-json.ts`](src/lib/extract-json.ts)），所以你能在生成前把每一页的文字定死。
到第 ④ 步，prompt 里明确写着「页数和文字已锁定，一个字都不许改」。

## 上传自己的模板

右上角「上传模板」→ 贴一份你喜欢的 HTML → 点「让 agent 反推」，
agent 读完它、写出设计规格（配色 / 字体 / 尺寸 / 版式），存成一个模板。
之后就能用这套风格生成你自己的内容。

模板落在 `~/.xhs-anything/skills/`，和内置模板一起出现在选择器里。
可以先自动生成规格、再手改，两种都行。

## 目录

```
src/lib/xhs/            四步流程的核心
  types.ts              分页 / 封面的数据模型
  prompts.ts            五段 prompt（拆页 / 封面 / 成品 / 发布文案 / 反推模板）
  store.ts              流程状态
  use-flow.ts           驱动三次 agent 调用
  cover-directions.ts   三种封面构图（服务端和界面共用）
  aspect.ts             解析 SKILL.md 里手写的 aspect_hint
  use-element-size.ts   测量容器尺寸，供按设计宽度排版再缩放用
src/lib/extract-json.ts 从 agent 的啰嗦回复里捞出 JSON
src/lib/skills/local-install.ts  用户上传的模板落盘
src/components/xhs/     四步的界面
  template-gallery.tsx  模板画廊：每个模板一张实时缩略图
  scaled-document.tsx   按卡片设计宽度排版、再缩放显示（预览与导出共用）
  caption-pane.tsx      发布文案栏，逐段复制
src/lib/templates/skills/        内置模板（每个文件夹一个 SKILL.md）
```

改视觉风格**不用碰代码** —— 直接编辑
`src/lib/templates/skills/card-xiaohongshu/SKILL.md` 里的中文说明即可。

## 命令

```bash
npm run dev
npm run build
npm run typecheck
npm test
```

## 许可证

Apache License 2.0，见 [`LICENSE`](LICENSE)。

本项目派生自 [`html-anything`](https://github.com/nexu-io/html-anything)（同为 Apache-2.0）。
按协议 §4(b) 的要求，改动清单记录在 [`NOTICE`](NOTICE) 里。
