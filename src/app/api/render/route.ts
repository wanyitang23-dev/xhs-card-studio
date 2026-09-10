import { NextRequest } from "next/server";
import { invokeAgent } from "@/lib/agents/invoke";
import { loadSkill } from "@/lib/templates/loader";
import { buildRenderPrompt } from "@/lib/xhs/prompts";
import type { XhsPage } from "@/lib/xhs/types";
import { resolveAssets } from "@/lib/xhs/assets";
import { abortOn, SSE_HEADERS, toSseStream } from "@/lib/xhs/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  agent: string;
  templateId: string;
  pages: XhsPage[];
  /** The winning cover's HTML, so the render keeps its exact design. */
  coverHtml?: string;
  /** `asset:<id>` → `data:image/...` for screenshots the user attached. */
  assets?: Record<string, string>;
  model?: string;
  binOverride?: string;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }
  const { agent, templateId, pages, coverHtml, assets = {}, model, binOverride } = body;
  if (!agent || !templateId || !Array.isArray(pages) || pages.length === 0) {
    return new Response("missing required fields: agent, templateId, pages", { status: 400 });
  }
  const skill = loadSkill(templateId);
  if (!skill) return new Response(`unknown template: ${templateId}`, { status: 400 });

  // Swap the short `asset:<id>` tokens for the real bytes right before the
  // prompt is built — the client keeps the readable token in its state, the
  // agent needs something it can drop straight into an <img src>.
  const { pages: inlined } = resolveAssets(pages, assets);

  const prompt = buildRenderPrompt({
    pages: inlined,
    skillBody: skill.body,
    coverHtml,
    exampleHtml: skill.exampleHtml,
  });
  const abortCtl = abortOn(req.signal);
  const source = invokeAgent({ agent, prompt, model, binOverride, signal: abortCtl.signal });

  return new Response(toSseStream(source, { abort: abortCtl }), { headers: SSE_HEADERS });
}
