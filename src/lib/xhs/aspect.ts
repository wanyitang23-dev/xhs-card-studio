/**
 * Parse a skill's freeform `aspect_hint` into a render viewport for preview
 * thumbnails.
 *
 * The field is written by hand in each SKILL.md and has no fixed grammar —
 * real values include "1080×1440 (3:4)", "16:9", "810×1080 ×9",
 * "1080×1080 ×3" and "16:9 / 3:4". Rather than tighten the format (which would
 * break every existing skill and every template a user uploads), we read what
 * is there and fall back to the Xiaohongshu default when nothing parses.
 */

/** Xiaohongshu's canonical card: 1080×1440, 3:4 portrait. */
export const DEFAULT_VIEWPORT = { width: 1080, height: 1440 } as const;

export type Viewport = { width: number; height: number };

/** Guard against a typo'd hint producing a 200000px iframe. */
const MIN_DIM = 120;
const MAX_DIM = 4000;

function sane(w: number, h: number): Viewport | null {
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (w < MIN_DIM || h < MIN_DIM || w > MAX_DIM || h > MAX_DIM) return null;
  return { width: Math.round(w), height: Math.round(h) };
}

/**
 * Derive the pixel viewport an example page should be rendered at.
 *
 * Explicit `W×H` wins over a bare `A:B` ratio, because the former is the real
 * authored size while the latter only fixes the shape. A trailing `×9` is a
 * page *count*, not a dimension, so it must not be read as one — hence
 * matching the pair before scanning for ratios.
 */
export function parseViewport(hint: string | undefined | null): Viewport {
  if (!hint?.trim()) return { ...DEFAULT_VIEWPORT };
  const s = hint.replace(/[，,]/g, " ");

  // "1080×1440", "810x1080" — both the ASCII x and the multiplication sign.
  const pair = /(\d{3,4})\s*[×xX]\s*(\d{3,4})/.exec(s);
  if (pair) {
    const v = sane(Number(pair[1]), Number(pair[2]));
    if (v) return v;
  }

  // "16:9", "3:4" — a shape with no size, so anchor it to the default width.
  const ratio = /(\d{1,2})\s*:\s*(\d{1,2})/.exec(s);
  if (ratio) {
    const a = Number(ratio[1]);
    const b = Number(ratio[2]);
    if (a > 0 && b > 0) {
      const v = sane(DEFAULT_VIEWPORT.width, (DEFAULT_VIEWPORT.width * b) / a);
      if (v) return v;
    }
  }

  return { ...DEFAULT_VIEWPORT };
}

/**
 * The short badge shown on a thumbnail — the ratio alone, since the tile
 * already conveys size. Falls back to the raw hint when no ratio is written.
 */
export function aspectBadge(hint: string | undefined | null): string {
  if (!hint?.trim()) return "3:4";
  const ratio = /(\d{1,2})\s*:\s*(\d{1,2})/.exec(hint);
  if (ratio) return `${ratio[1]}:${ratio[2]}`;
  const pair = /(\d{3,4})\s*[×xX]\s*(\d{3,4})/.exec(hint);
  if (pair) {
    const w = Number(pair[1]);
    const h = Number(pair[2]);
    const g = gcd(w, h);
    return `${w / g}:${h / g}`;
  }
  return hint.trim().slice(0, 12);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Page count when the hint declares one ("×9" → 9). Otherwise `null`. */
export function parsePageCount(hint: string | undefined | null): number | null {
  if (!hint) return null;
  // Only a *standalone* ×N counts — the N in "1080×1440" is a dimension.
  const m = /(?:^|\s)[×xX]\s*(\d{1,2})(?:\s|$)/.exec(hint);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 2 && n <= 30 ? n : null;
}
