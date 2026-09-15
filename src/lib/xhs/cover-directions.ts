/**
 * The visual directions offered in the step-③ cover comparison.
 *
 * Shared by the API route (which turns `text` into prompt instructions) and the
 * client (which renders `label` under each tile), so the two can never drift.
 *
 * These steer *composition* only. Palette and typography stay the skill's job,
 * so all three candidates still read as the same template — three tweaks of one
 * layout would make the comparison pointless.
 */
export const COVER_DIRECTIONS = {
  "big-type": {
    label: "巨字标题",
    text: "主标题是绝对视觉主体, 按语义主动分成 2-4 行；减少眉题、标签和装饰, 不为填满版式编造文字。有配图时将图片作为次级视觉证据, 留白分布在标题组与配图之间, 不要集中堆在页脚前。",
  },
  "badge-stack": {
    label: "标签堆叠",
    text: "上方醒目标签、标题、副标题、配图和下方看点组成一个主内容组；主内容组在页脚上方的可用区域内垂直居中，元素保持正常文档流。",
  },
  "split-block": {
    label: "色块分割",
    text: "用一个大色块把卡片切成上下或左右两半, 标题压在色块边界上。构图有张力, 视觉重心偏离中心。",
  },
} as const;

export type CoverDirectionId = keyof typeof COVER_DIRECTIONS;

export const COVER_DIRECTION_IDS = Object.keys(COVER_DIRECTIONS) as CoverDirectionId[];

export function coverLabel(id: string): string {
  return (COVER_DIRECTIONS as Record<string, { label: string }>)[id]?.label ?? id;
}

/**
 * Build the cover list for a run that regenerates only `directions`.
 *
 * Tiles not being regenerated are carried over untouched — that is the whole
 * point of per-tile regeneration, and getting it wrong silently throws away
 * covers the user was happy with. Order always follows
 * {@link COVER_DIRECTION_IDS} so tiles never shuffle between runs.
 */
export function mergeCoverRun<T extends { id: string }>(
  existing: T[],
  directions: string[],
  makePending: (id: string) => T,
): T[] {
  const pending = new Set(directions);
  const byId = new Map(existing.map((c) => [c.id, c]));
  return COVER_DIRECTION_IDS.filter((id) => pending.has(id) || byId.has(id)).map((id) =>
    pending.has(id) ? makePending(id) : byId.get(id)!,
  );
}
