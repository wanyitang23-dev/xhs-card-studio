/**
 * Bounding uploaded screenshots before they are stored.
 *
 * A phone screenshot is routinely 3–8 MB as a base64 data URL, and these have
 * to survive a reload — they are the user's own material, not something the
 * agent can regenerate. localStorage gives us roughly 5 MB *in total*, so the
 * originals cannot go in as-is.
 *
 * A card is 1080 px wide, so anything past ~1600 px on the long edge is
 * resolution the reader will never see. Re-encoding at that size typically
 * takes a screenshot from megabytes to a couple hundred kilobytes.
 */

/** Longest edge we keep. Comfortably above the 1080 px card width. */
export const MAX_EDGE = 1600;

/** JPEG quality for the re-encode. High enough that UI screenshots stay crisp. */
export const QUALITY = 0.85;

/**
 * The box an image should be re-encoded into: the same aspect ratio, with the
 * long edge capped at `maxEdge`. Never upscales — a small image is left alone.
 */
export function fitBox(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const k = maxEdge / longest;
  // `max(1, …)` so an extreme aspect ratio can't round the short edge to zero.
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** Rough decoded byte size of a data URL, without allocating the bytes. */
export function dataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(",");
  if (i === -1) return 0;
  const b64 = dataUrl.length - i - 1;
  return Math.max(0, Math.floor((b64 * 3) / 4));
}

/**
 * Re-encode a data URL down to `maxEdge`, preserving transparency-free content
 * as JPEG.
 *
 * Every failure path returns the original: a slightly-too-large screenshot is
 * far better than a lost one. The caller is expected to be in the browser;
 * outside it (tests, SSR) the original comes straight back.
 */
export async function downscaleDataUrl(
  dataUrl: string,
  maxEdge: number = MAX_EDGE,
): Promise<string> {
  if (typeof document === "undefined" || !dataUrl.startsWith("data:image/")) return dataUrl;
  try {
    const img = await loadImage(dataUrl);
    const box = fitBox(img.naturalWidth, img.naturalHeight, maxEdge);
    if (!box.width || !box.height) return dataUrl;

    const canvas = document.createElement("canvas");
    canvas.width = box.width;
    canvas.height = box.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    // Screenshots are mostly flat UI; a white matte keeps PNG transparency from
    // turning black once it is flattened into JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, box.width, box.height);
    ctx.drawImage(img, 0, 0, box.width, box.height);

    const out = canvas.toDataURL("image/jpeg", QUALITY);
    // A tiny or already-optimal image can come back *larger* after re-encoding.
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = src;
  });
}
