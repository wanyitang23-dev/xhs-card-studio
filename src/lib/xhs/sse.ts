/**
 * Shared SSE plumbing for the xhs endpoints.
 *
 * `/api/convert` grew its own copy of this loop; the four-step flow needs the
 * same wire format in three more places, so it lives here once. Behaviour is
 * identical: every InvokeEvent is forwarded as `event: <type>` with the event
 * object as the JSON payload.
 */

import type { InvokeEvent } from "@/lib/agents/invoke";

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

/**
 * Bridge an agent event stream to an SSE body.
 *
 * `onEvent` sees every event before it is written, so a caller can accumulate
 * text deltas (the outline endpoint parses the completed JSON that way) and
 * `onDone` can append a final synthetic event after the agent exits.
 */
export function toSseStream(
  source: ReadableStream<InvokeEvent>,
  opts: {
    abort: AbortController;
    onEvent?: (ev: InvokeEvent) => void;
    onDone?: (send: (event: string, data: unknown) => void) => void;
  },
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const reader = source.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          opts.onEvent?.(value);
          send(value.type, value);
        }
        opts.onDone?.(send);
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : String(err) });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      opts.abort.abort();
    },
  });
}

/** Wire the request's abort signal to a controller the agent spawn can watch. */
export function abortOn(signal: AbortSignal | null | undefined): AbortController {
  const ctl = new AbortController();
  signal?.addEventListener("abort", () => ctl.abort(), { once: true });
  return ctl;
}
