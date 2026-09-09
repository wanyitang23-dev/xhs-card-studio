import { NextRequest } from "next/server";
import { invokeAgent } from "@/lib/agents/invoke";
import { loadSkill } from "@/lib/templates/loader";
import { extractJson } from "@/lib/extract-json";
import { buildOutlinePrompt } from "@/lib/xhs/prompts";
import {
  clampPageCount,
  MAX_PAGES,
  MIN_PAGES,
  type OutlineResponse,
  type PageCountSetting,
  type PageKind,
} from "@/lib/xhs/types";
import { abortOn, SSE_HEADERS, toSseStream } from "@/lib/xhs/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  agent: string;
  templateId: string;
  content: string;
  format?: string;
  /** `"auto"`, or an exact card count the user set in the UI. */
  pageCount?: PageCountSetting;
  model?: string;
  binOverride?: string;
};

/**
 * Coerce whatever the agent returned into a well-formed page list.
 *
 * The agent is told the exact schema but is not bound by it, so every field is
 * treated as untrusted: unknown `kind`s become "content", missing text becomes
 * empty, and the cover/ending bookends are forced into place. Returning a
 * half-valid outline the user can fix in the editor beats erroring out.
 */
function normalizePages(raw: OutlineResponse | null): Array<{ kind: PageKind; title: string; body: string }> | null {
  if (!raw || !Array.isArray(raw.pages)) return null;
  const pages = raw.pages
    .filter((p): p is NonNullable<typeof p> => !!p && typeof p === "object")
    .slice(0, MAX_PAGES)
    .map((p) => ({
      kind: (p.kind === "cover" || p.kind === "ending" ? p.kind : "content") as PageKind,
      title: typeof p.title === "string" ? p.title.trim() : "",
      body: typeof p.body === "string" ? p.body.trim() : "",
    }))
    .filter((p) => p.title || p.body);
  if (pages.length < MIN_PAGES) return null;
  // Force the bookends regardless of what the agent labelled them.
  pages[0].kind = "cover";
  pages[pages.length - 1].kind = "ending";
  for (let i = 1; i < pages.length - 1; i++) pages[i].kind = "content";
  return pages;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }
  const {
    agent,
    templateId,
    content,
    format = "text",
    pageCount: rawPageCount = "auto",
    model,
    binOverride,
  } = body;
  if (!agent || !templateId || !content?.trim()) {
    return new Response("missing required fields: agent, templateId, content", { status: 400 });
  }
  const skill = loadSkill(templateId);
  if (!skill) return new Response(`unknown template: ${templateId}`, { status: 400 });

  const pageCount: PageCountSetting =
    typeof rawPageCount === "number" && Number.isFinite(rawPageCount)
      ? clampPageCount(rawPageCount)
      : "auto";
  const prompt = buildOutlinePrompt({ content, format, pageCount, skillBody: skill.body });
  const abortCtl = abortOn(req.signal);
  const source = invokeAgent({ agent, prompt, model, binOverride, signal: abortCtl.signal });

  // Accumulate text deltas so the finished JSON can be parsed once the agent
  // exits. The raw deltas still stream through for the progress log — the user
  // sees the agent working even though only the parsed result is usable.
  let acc = "";
  const sse = toSseStream(source, {
    abort: abortCtl,
    onEvent: (ev) => {
      if (ev.type === "delta") acc += ev.text;
      else if (ev.type === "html") acc = ev.text;
    },
    onDone: (send) => {
      const pages = normalizePages(extractJson<OutlineResponse>(acc));
      if (pages) send("outline", { pages, requested: pageCount });
      else
        send("error", {
          message:
            "没能从 agent 的回复里解析出分页大纲。可以重试一次，或换一个 agent。",
          raw: acc.slice(0, 500),
        });
    },
  });

  return new Response(sse, { headers: SSE_HEADERS });
}
