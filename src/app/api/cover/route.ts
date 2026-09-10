import { NextRequest } from "next/server";
import { invokeAgent } from "@/lib/agents/invoke";
import { loadSkill } from "@/lib/templates/loader";
import { buildCoverPrompt } from "@/lib/xhs/prompts";
import { abortOn, SSE_HEADERS, toSseStream } from "@/lib/xhs/sse";
import { COVER_DIRECTIONS } from "@/lib/xhs/cover-directions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  agent: string;
  templateId: string;
  title: string;
  body?: string;
  /** Which of {@link COVER_DIRECTIONS} to nudge this variant toward. */
  direction: string;
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
  const { agent, templateId, title, body: subtitle = "", direction, model, binOverride } = body;
  if (!agent || !templateId || !title?.trim()) {
    return new Response("missing required fields: agent, templateId, title", { status: 400 });
  }
  const dir = (COVER_DIRECTIONS as Record<string, { label: string; text: string }>)[direction];
  if (!dir) return new Response(`unknown direction: ${direction}`, { status: 400 });

  const skill = loadSkill(templateId);
  if (!skill) return new Response(`unknown template: ${templateId}`, { status: 400 });

  const prompt = buildCoverPrompt({
    title,
    body: subtitle,
    direction: dir.text,
    skillBody: skill.body,
    exampleHtml: skill.exampleHtml,
  });
  const abortCtl = abortOn(req.signal);
  const source = invokeAgent({ agent, prompt, model, binOverride, signal: abortCtl.signal });

  return new Response(toSseStream(source, { abort: abortCtl }), { headers: SSE_HEADERS });
}
