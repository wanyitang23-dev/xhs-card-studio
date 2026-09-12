import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { invokeAgent, type InvokeEvent } from "@/lib/agents/invoke";
import { buildImageTemplateRefinePrompt } from "@/lib/xhs/prompts";
import { abortOn, SSE_HEADERS, toSseStream } from "@/lib/xhs/sse";
import { decodeReferenceImageDataUrl, ReferenceImageError } from "@/lib/templates/reference-image";
import { loadImageToXhsTemplateSkill } from "@/lib/templates/image-to-xhs-template";
import { hostRejectedResponse, isHostAllowed } from "../../marketplace/_lib/host-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HTML_CHARS = 2_000_000;

type Body = {
  agent?: unknown;
  originalImageDataUrl?: unknown;
  renderedImageDataUrl?: unknown;
  currentHtml?: unknown;
  model?: unknown;
  binOverride?: unknown;
};

function cleanupAfter(source: ReadableStream<InvokeEvent>, dir: string): ReadableStream<InvokeEvent> {
  let reader: ReadableStreamDefaultReader<InvokeEvent> | null = null;
  const cleanup = () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
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
        cleanup();
      }
    },
    async cancel() {
      cleanup();
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

  const str = (value: unknown) => (typeof value === "string" ? value : "");
  const agent = str(body.agent);
  const currentHtml = str(body.currentHtml);
  if (!agent || !currentHtml || !str(body.originalImageDataUrl) || !str(body.renderedImageDataUrl)) {
    return new Response("missing required refinement fields", { status: 400 });
  }
  if (currentHtml.length > MAX_HTML_CHARS) {
    return new Response("example HTML is too large", { status: 413 });
  }

  try {
    const original = decodeReferenceImageDataUrl(str(body.originalImageDataUrl));
    const rendered = decodeReferenceImageDataUrl(str(body.renderedImageDataUrl));
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xhs-template-refine-"));
    const imagePath = path.join(tempDir, `reference.${original.extension}`);
    const renderedPath = path.join(tempDir, `rendered.${rendered.extension}`);
    fs.writeFileSync(imagePath, original.bytes);
    fs.writeFileSync(renderedPath, rendered.bytes);

    const abortCtl = abortOn(req.signal);
    const source = invokeAgent({
      agent,
      prompt: buildImageTemplateRefinePrompt({
        workflowSkill: loadImageToXhsTemplateSkill(),
        imagePath,
        renderedPath,
        currentHtml,
      }),
      cwd: tempDir,
      model: str(body.model) || undefined,
      binOverride: str(body.binOverride) || undefined,
      signal: abortCtl.signal,
    });
    return new Response(toSseStream(cleanupAfter(source, tempDir), { abort: abortCtl }), {
      headers: SSE_HEADERS,
    });
  } catch (err) {
    if (err instanceof ReferenceImageError) {
      return new Response(err.message, { status: err.code === "image_too_large" ? 413 : 400 });
    }
    return new Response(err instanceof Error ? err.message : "refinement failed", { status: 500 });
  }
}
