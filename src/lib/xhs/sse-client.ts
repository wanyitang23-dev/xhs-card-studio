"use client";

/**
 * Browser side of the SSE contract in `xhs/sse.ts`.
 *
 * `use-convert.ts` inlines this parse loop; the four-step flow needs it in
 * four more places (outline / three concurrent covers / render / derive), so
 * it is factored out here. Handlers are keyed by event name; anything with no
 * handler is ignored.
 */

export type SseHandlers = {
  /** Text the agent streamed. Called many times per run. */
  onDelta?: (text: string) => void;
  /** Canonical payload rescued from a file-write tool call — replaces, not appends. */
  onHtml?: (text: string) => void;
  /** Parsed outline, emitted once by /api/outline after the agent exits. */
  onOutline?: (pages: unknown) => void;
  /** Parsed caption, emitted once by /api/caption after the agent exits. */
  onCaption?: (caption: unknown) => void;
  onMeta?: (key: string, value: unknown) => void;
  onLog?: (kind: string, text: string) => void;
  onError?: (message: string) => void;
};

/**
 * POST `body` to `url` and pump the SSE response through `handlers`.
 *
 * Resolves when the stream ends. An aborted request resolves quietly — the
 * caller cancelled, which is not an error. Anything else rejects.
 */
export async function streamSse(
  url: string,
  body: unknown,
  handlers: SseHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  // SSE allows a `data:` block to inherit the preceding `event:` name, so the
  // last seen name has to persist across blocks.
  let lastEvent = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });

    let blank: number;
    while ((blank = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, blank);
      buf = buf.slice(blank + 2);
      let event = lastEvent;
      const dataLines: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      lastEvent = event;
      if (!dataLines.length) continue;
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
      } catch {
        continue;
      }
      dispatch(event, data, handlers);
    }
  }
}

function dispatch(event: string, d: Record<string, unknown>, h: SseHandlers) {
  switch (event) {
    case "delta":
      if (typeof d.text === "string" && d.text) h.onDelta?.(d.text);
      break;
    case "html":
      if (typeof d.text === "string") h.onHtml?.(d.text);
      break;
    case "outline":
      if (d.pages) h.onOutline?.(d.pages);
      break;
    case "caption":
      h.onCaption?.(d);
      break;
    case "meta":
      h.onMeta?.(String(d.key), d.value);
      break;
    case "error":
      h.onError?.(String(d.message ?? "agent error"));
      break;
    case "stderr":
    case "raw":
    case "start":
    case "done":
      if (typeof d.text === "string") h.onLog?.(event, d.text);
      break;
  }
}
