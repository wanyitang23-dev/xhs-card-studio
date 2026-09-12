"use client";

import { applyPatch } from "diff";
import { refreshTemplates } from "@/lib/templates";
import { renderTemplateContactSheet } from "@/lib/templates/contact-sheet";
import { streamSse } from "@/lib/xhs/sse-client";
import { useXhs } from "@/lib/xhs/store";

export type TemplateGenerationStage =
  | "deriving"
  | "generating"
  | "refining"
  | "saving"
  | "success"
  | "error"
  | "cancelled";

export type TemplateGenerationJob = {
  id: string;
  name: string;
  stage: TemplateGenerationStage;
  message?: string;
};

type StartInput = {
  agent: string;
  name: string;
} & (
  | { sourceKind: "image"; imageDataUrl: string; imageFileName: string }
  | { sourceKind: "html"; html: string }
);

let jobs: TemplateGenerationJob[] = [];
const listeners = new Set<() => void>();
const controllers = new Map<string, AbortController>();

function emit(next: TemplateGenerationJob[]): void {
  jobs = next;
  for (const listener of listeners) listener();
}

function update(id: string, patch: Partial<TemplateGenerationJob>): void {
  emit(jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)));
}

export function getTemplateGenerationJobs(): TemplateGenerationJob[] {
  return jobs;
}

export function subscribeTemplateGenerationJobs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function dismissTemplateGenerationJob(id: string): void {
  const job = jobs.find((item) => item.id === id);
  if (!job || !["success", "error", "cancelled"].includes(job.stage)) return;
  emit(jobs.filter((item) => item.id !== id));
}

export function cancelTemplateGenerationJob(id: string): void {
  controllers.get(id)?.abort();
}

async function collectStream(url: string, body: unknown, signal: AbortSignal): Promise<string> {
  let streamed = "";
  let canonical = "";
  let streamError = "";
  await streamSse(
    url,
    body,
    {
      onDelta: (text) => {
        streamed += text;
      },
      onHtml: (text) => {
        canonical = text;
      },
      onError: (message) => {
        streamError = message;
      },
    },
    signal,
  );
  if (streamError) throw new Error(streamError);
  return canonical || streamed;
}

function cleanSkillBody(raw: string): string {
  const cleaned = raw.trim().replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/, "").trim();
  const firstSection = cleaned.search(/^【[^】]+】/m);
  return firstSection > 0 ? cleaned.slice(firstSection).trim() : cleaned;
}

function extractHtml(raw: string): string {
  const text = raw.trim();
  const doctype = text.search(/<!doctype\s+html/i);
  const htmlStart = text.search(/<html[\s>]/i);
  const start = doctype >= 0 ? doctype : htmlStart;
  const end = text.toLowerCase().lastIndexOf("</html>");
  return start >= 0 && end >= start ? text.slice(start, end + "</html>".length) : "";
}

function extractUnifiedDiff(raw: string): string {
  const text = raw.trim().replace(/^```(?:diff)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (text === "NO_CHANGES") return text;
  const start = text.indexOf("--- example.html");
  return start >= 0 ? text.slice(start) : "";
}

function validateExampleHtml(html: string): void {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const cards = doc.querySelectorAll(".deck > .card");
  if (cards.length !== 6) throw new Error(`example.html 应包含 6 张卡片，当前为 ${cards.length} 张`);
  if (doc.querySelector("script, iframe, form, input, button, textarea, select")) {
    throw new Error("example.html 包含不允许的脚本或交互控件");
  }
}

async function saveTemplate(input: {
  name: string;
  skillBody: string;
  exampleHtml: string;
  referenceImageDataUrl?: string;
}): Promise<string | undefined> {
  const response = await fetch("/api/templates/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await response.json()) as { skillId?: string; message?: string; error?: string };
  if (!response.ok) throw new Error(json.message ?? json.error ?? `HTTP ${response.status}`);
  return json.skillId;
}

async function runJob(id: string, input: StartInput, controller: AbortController): Promise<void> {
  try {
    let skillBody: string;
    let exampleHtml: string;

    if (input.sourceKind === "html") {
      skillBody = cleanSkillBody(
        await collectStream("/api/templates/derive", { agent: input.agent, html: input.html }, controller.signal),
      );
      if (!skillBody) throw new Error("agent 没有返回模板规则");
      exampleHtml = input.html;
    } else {
      skillBody = cleanSkillBody(
        await collectStream(
          "/api/templates/derive-image",
          { agent: input.agent, imageDataUrl: input.imageDataUrl },
          controller.signal,
        ),
      );
      if (!skillBody) throw new Error("agent 没有返回设计规格，请换一个支持图片理解的 agent");

      update(id, { stage: "generating" });
      const rawHtml = await collectStream(
        "/api/templates/generate-example",
        {
          agent: input.agent,
          name: input.name || input.imageFileName,
          skillBody,
          imageDataUrl: input.imageDataUrl,
        },
        controller.signal,
      );
      exampleHtml = extractHtml(rawHtml);
      if (!exampleHtml) throw new Error("agent 没有返回完整的 example.html");
      validateExampleHtml(exampleHtml);

      update(id, { stage: "refining" });
      const renderedImageDataUrl = await renderTemplateContactSheet(exampleHtml, input.imageDataUrl);
      const rawDiff = await collectStream(
        "/api/templates/refine-example",
        {
          agent: input.agent,
          originalImageDataUrl: input.imageDataUrl,
          renderedImageDataUrl,
          currentHtml: exampleHtml,
        },
        controller.signal,
      );
      const patch = extractUnifiedDiff(rawDiff);
      if (patch && patch !== "NO_CHANGES") {
        const refined = applyPatch(exampleHtml, patch);
        if (refined === false) throw new Error("视觉复核返回的 diff 无法应用");
        validateExampleHtml(refined);
        exampleHtml = refined;
      } else if (!patch) {
        throw new Error("视觉复核没有返回有效的 diff");
      }
    }

    update(id, { stage: "saving" });
    const skillId = await saveTemplate({
      name: input.name,
      skillBody,
      exampleHtml,
      referenceImageDataUrl: input.sourceKind === "image" ? input.imageDataUrl : undefined,
    });
    await refreshTemplates();
    if (skillId) useXhs.getState().setTemplateId(skillId);
    update(id, { stage: "success", message: "已保存并加入模板库" });
  } catch (error) {
    if (controller.signal.aborted || (error as Error)?.name === "AbortError") {
      update(id, { stage: "cancelled", message: "已取消" });
    } else {
      update(id, { stage: "error", message: (error as Error)?.message ?? String(error) });
    }
  } finally {
    controllers.delete(id);
  }
}

export function startTemplateGeneration(input: StartInput): string {
  const id = crypto.randomUUID();
  const controller = new AbortController();
  controllers.set(id, controller);
  emit([...jobs, { id, name: input.name, stage: "deriving" }]);
  void runJob(id, input, controller);
  return id;
}
