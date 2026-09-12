import { NextResponse } from "next/server";
import { installLocalTemplate, LocalInstallError, uninstallLocalTemplate } from "@/lib/skills/local-install";
import { invalidateSkillsCache } from "@/lib/templates/loader";
import { hostRejectedResponse, isHostAllowed } from "../../marketplace/_lib/host-guard";
import { decodeReferenceImageDataUrl, ReferenceImageError } from "@/lib/templates/reference-image";
import { localTemplateSlugFromSkillId } from "@/lib/templates/local-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Guard against a runaway paste pinning the whole file in memory. */
const MAX_HTML_BYTES = 2_000_000;
const MAX_BODY_CHARS = 20_000;

type Body = {
  name?: unknown;
  skillBody?: unknown;
  exampleHtml?: unknown;
  emoji?: unknown;
  description?: unknown;
  referenceImageDataUrl?: unknown;
};

export async function POST(req: Request) {
  if (!isHostAllowed(req)) return hostRejectedResponse();
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const exampleHtml = str(body.exampleHtml);
  const skillBody = str(body.skillBody);
  if (Buffer.byteLength(exampleHtml, "utf8") > MAX_HTML_BYTES) {
    return NextResponse.json({ error: "html_too_large" }, { status: 413 });
  }
  if (skillBody.length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: "body_too_large" }, { status: 413 });
  }

  try {
    const imageDataUrl = str(body.referenceImageDataUrl);
    const referenceImage = imageDataUrl ? decodeReferenceImageDataUrl(imageDataUrl) : undefined;
    const result = installLocalTemplate({
      name: str(body.name),
      skillBody,
      exampleHtml,
      emoji: str(body.emoji) || undefined,
      description: str(body.description) || undefined,
      referenceImage,
    });
    invalidateSkillsCache();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof LocalInstallError || err instanceof ReferenceImageError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "install_failed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  if (!isHostAllowed(req)) return hostRejectedResponse();
  const params = new URL(req.url).searchParams;
  // `id` is preferred because the server can prove it belongs to a local
  // upload. Keep `slug` for compatibility with the original private endpoint.
  const id = params.get("id");
  const slug = id ? localTemplateSlugFromSkillId(id) : params.get("slug");
  if (!slug) return NextResponse.json({ error: "invalid_local_template" }, { status: 400 });
  try {
    uninstallLocalTemplate(slug);
    invalidateSkillsCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof LocalInstallError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "uninstall_failed" }, { status: 500 });
  }
}
