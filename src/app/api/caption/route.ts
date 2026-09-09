import { NextRequest } from "next/server";
import { invokeAgent } from "@/lib/agents/invoke";
import { extractJson } from "@/lib/extract-json";
import { buildCaptionPrompt } from "@/lib/xhs/prompts";
import type { ContentMode, XhsPage } from "@/lib/xhs/types";
import { abortOn, SSE_HEADERS, toSseStream } from "@/lib/xhs/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  agent: string;
  pages: XhsPage[];
  mode?: ContentMode;
  model?: string;
  binOverride?: string;
};

/** Xiaohongshu's own limits, so the UI can warn before the user pastes. */
const MAX_TITLE = 20;
const MAX_TAGS = 10;

export type CaptionResponse = { title?: unknown; body?: unknown; tags?: unknown };

/**
 * Coerce the agent's reply into a caption the UI can render.
 *
 * Every field is treated as untrusted: a missing title falls back to the cover
 * card's own title, tags are de-duplicated and stripped of any `#` the model
 * added despite being told not to. Returning a partial caption the user can
 * edit beats erroring out.
 */
export function normalizeCaption(raw: CaptionResponse | null, pages: Pick<XhsPage, "title">[]) {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const title = str(raw?.title) || pages[0]?.title || "";
  const body = str(raw?.body);
  const seen = new Set<string>();
  const tags = (Array.isArray(raw?.tags) ? raw.tags : [])
    .map((t) => str(t).replace(/^#+/, "").trim())
    .filter((t) => {
      if (!t || seen.has(t)) return false;
      seen.add(t);
      return true;
    })
    .slice(0, MAX_TAGS);
  if (!title && !body && tags.length === 0) return null;
  return { title: title.slice(0, MAX_TITLE * 2), body, tags };
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }
  const { agent, pages, mode = "condensed", model, binOverride } = body;
  if (!agent || !Array.isArray(pages) || pages.length === 0) {
    return new Response("missing required fields: agent, pages", { status: 400 });
  }

  const abortCtl = abortOn(req.signal);
  const source = invokeAgent({
    agent,
    prompt: buildCaptionPrompt({ pages, mode }),
    model,
    binOverride,
    signal: abortCtl.signal,
  });

  let acc = "";
  const sse = toSseStream(source, {
    abort: abortCtl,
    onEvent: (ev) => {
      if (ev.type === "delta") acc += ev.text;
      else if (ev.type === "html") acc = ev.text;
    },
    onDone: (send) => {
      const caption = normalizeCaption(extractJson<CaptionResponse>(acc), pages);
      if (caption) send("caption", caption);
      else send("error", { message: "没能从 agent 的回复里解析出配文，可以重试一次。" });
    },
  });

  return new Response(sse, { headers: SSE_HEADERS });
}
