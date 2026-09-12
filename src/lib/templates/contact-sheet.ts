"use client";

import { nodeToBlob } from "@/lib/export/image";

const CARD_COUNT = 6;
const REFERENCE_IMAGE_TOKEN = "__TEMPLATE_REFERENCE_IMAGE__";

/** Render the six generated cards into a compact image used only for visual QA. */
export async function renderTemplateContactSheet(
  html: string,
  referenceImageDataUrl?: string,
): Promise<string> {
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "position:fixed;left:-100000px;top:0;width:1080px;height:1440px;overflow:hidden;pointer-events:none;z-index:-1";
  const iframe = document.createElement("iframe");
  iframe.title = "模板视觉复核";
  iframe.setAttribute("sandbox", "allow-same-origin");
  iframe.style.cssText = "width:1080px;height:1440px;border:0";
  iframe.srcdoc = referenceImageDataUrl
    ? html.split(REFERENCE_IMAGE_TOKEN).join(referenceImageDataUrl)
    : html;
  wrap.appendChild(iframe);
  document.body.appendChild(wrap);

  try {
    await new Promise<void>((resolve) => {
      if (iframe.contentDocument?.readyState === "complete") return resolve();
      iframe.addEventListener("load", () => resolve(), { once: true });
      setTimeout(resolve, 5000);
    });
    await iframe.contentDocument?.fonts?.ready;

    const cards = Array.from(
      iframe.contentDocument?.querySelectorAll<HTMLElement>(".deck > .card") ?? [],
    );
    if (cards.length !== CARD_COUNT) {
      throw new Error(`example.html 应包含 ${CARD_COUNT} 张 .card，当前为 ${cards.length} 张`);
    }

    const cardWidth = 216;
    const cardHeight = 288;
    const gap = 12;
    const canvas = document.createElement("canvas");
    canvas.width = cardWidth * 3 + gap * 2;
    canvas.height = cardHeight * 2 + gap;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建模板复核画布");
    ctx.fillStyle = "#e7ecee";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < cards.length; i += 1) {
      const blob = await nodeToBlob(cards[i], { scale: 0.2, type: "image/png" });
      const url = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const x = (i % 3) * (cardWidth + gap);
        const y = Math.floor(i / 3) * (cardHeight + gap);
        ctx.drawImage(image, x, y, cardWidth, cardHeight);
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    wrap.remove();
  }
}
