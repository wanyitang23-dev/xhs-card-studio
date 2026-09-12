import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { invokeAgent, type InvokeEvent } from "@/lib/agents/invoke";
import { decodeReferenceImageDataUrl, REFERENCE_IMAGE_TOKEN, ReferenceImageError } from "@/lib/templates/reference-image";
import { buildImageDerivePrompt } from "@/lib/xhs/prompts";
import { abortOn, SSE_HEADERS, toSseStream } from "@/lib/xhs/sse";
import { hostRejectedResponse, isHostAllowed } from "../../marketplace/_lib/host-guard";
import { loadImageToXhsTemplateSkill } from "@/lib/templates/image-to-xhs-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  agent?: unknown;
  imageDataUrl?: unknown;
  model?: unknown;
  binOverride?: unknown;
};

function removeTemp(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

function cleanupAfter(source: ReadableStream<InvokeEvent>, cleanup: () => void): ReadableStream<InvokeEvent> {
  let reader: ReadableStreamDefaultReader<InvokeEvent> | null = null;
  let cleaned = false;
  const finish = () => {
    if (cleaned) return;
    cleaned = true;
    cleanup();
  };

  return new ReadableStream<InvokeEvent>({
    async start(controller) {
      reader = source.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        finish();
      }
    },
    async cancel() {
      finish();
      await reader?.cancel();
    },
  });
}

export async function POST(req: NextRequest) {
  if (!isHostAllowed(req)) return hostRejectedResponse();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }

  const agent = typeof body.agent === "string" ? body.agent : "";
  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  if (!agent || !imageDataUrl) {
    return new Response("missing required fields: agent, imageDataUrl", { status: 400 });
  }

  let image: ReturnType<typeof decodeReferenceImageDataUrl>;
  try {
    image = decodeReferenceImageDataUrl(imageDataUrl);
  } catch (err) {
    if (err instanceof ReferenceImageError) {
      return new Response(err.message, { status: err.code === "image_too_large" ? 413 : 400 });
    }
    return new Response("invalid image", { status: 400 });
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xhs-style-image-"));
  const imagePath = path.join(tempDir, `reference.${image.extension}`);
  fs.writeFileSync(imagePath, image.bytes);

  const abortCtl = abortOn(req.signal);
  const source = invokeAgent({
    agent,
    prompt: buildImageDerivePrompt({
      imagePath,
      assetToken: REFERENCE_IMAGE_TOKEN,
      workflowSkill: loadImageToXhsTemplateSkill(),
    }),
    cwd: tempDir,
    model: typeof body.model === "string" ? body.model : undefined,
    binOverride: typeof body.binOverride === "string" ? body.binOverride : undefined,
    signal: abortCtl.signal,
  });
  const cleaned = cleanupAfter(source, () => removeTemp(tempDir));

  return new Response(toSseStream(cleaned, { abort: abortCtl }), { headers: SSE_HEADERS });
}
