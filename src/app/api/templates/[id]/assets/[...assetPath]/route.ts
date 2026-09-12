import { readSkillAsset } from "@/lib/templates/loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; assetPath: string[] }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id, assetPath } = await ctx.params;
  const asset = readSkillAsset(id, assetPath);
  if (!asset) return new Response("template asset not found", { status: 404 });

  const body = asset.data.buffer.slice(
    asset.data.byteOffset,
    asset.data.byteOffset + asset.data.byteLength,
  ) as ArrayBuffer;

  return new Response(body, {
    headers: {
      "Content-Type": asset.contentType,
      "Cache-Control":
        process.env.NODE_ENV === "development"
          ? "no-store"
          : "public, max-age=31536000, immutable",
    },
  });
}
