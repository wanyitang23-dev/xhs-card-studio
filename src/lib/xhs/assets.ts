import type { XhsPage } from "./types";

/**
 * Replace each page's `asset:<id>` tokens with the image bytes behind them.
 *
 * A token with nothing behind it is **dropped**, not passed through. The
 * previous `assets[id] ?? id` fallback handed the raw token to the agent, which
 * wrote it into the finished card as `<img src="asset:amtufp3udd">` — a broken
 * image in the user's deliverable, with nothing in the UI to hint at why.
 * Silently losing a picture is bad; silently shipping a broken tag is worse.
 */
export function resolveAssets(
  pages: XhsPage[],
  assets: Record<string, string>,
): { pages: XhsPage[]; missing: number } {
  let missing = 0;
  const resolved = pages.map((p) => {
    const urls: string[] = [];
    for (const id of p.imageAssetIds ?? []) {
      const url = assets[id];
      if (typeof url === "string" && url.length > 0) urls.push(url);
      else missing++;
    }
    return { ...p, imageAssetIds: urls };
  });
  return { pages: resolved, missing };
}
