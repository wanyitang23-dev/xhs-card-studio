import { NextRequest } from "next/server";
import { invokeAgent } from "@/lib/agents/invoke";
import { buildDerivePrompt } from "@/lib/xhs/prompts";
import { abortOn, SSE_HEADERS, toSseStream } from "@/lib/xhs/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reading a whole page costs input tokens, and the tail of a long card deck is
 * repetition of the same design. Truncating keeps the derive cheap while still
 * showing the agent every distinct element.
 */
const MAX_HTML_CHARS = 60_000;

type Body = {
  agent: string;
  html: string;
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
  const { agent, html, model, binOverride } = body;
  if (!agent || !html?.trim()) {
    return new Response("missing required fields: agent, html", { status: 400 });
  }

  const truncated =
    html.length > MAX_HTML_CHARS
      ? `${html.slice(0, MAX_HTML_CHARS)}\n<!-- …(已截断, 后续为同类卡片的重复结构) -->`
      : html;

  const abortCtl = abortOn(req.signal);
  const source = invokeAgent({
    agent,
    prompt: buildDerivePrompt({ html: truncated }),
    model,
    binOverride,
    signal: abortCtl.signal,
  });

  return new Response(toSseStream(source, { abort: abortCtl }), { headers: SSE_HEADERS });
}
