import { describe, expect, test } from "bun:test";

import { createTimedStreamingFetch } from "../../apps/frontends/gui/src/features/chat/chat-transport";

const encoder = new TextEncoder();

describe("chat transport timeout guard", () => {
  test("passes through a completed stream", async () => {
    const timedFetch = createTimedStreamingFetch(100, async (_input, _init) =>
      new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("ok"));
          controller.close();
        },
      }))
    );

    const response = await timedFetch("https://example.test/chat");
    expect(await response.text()).toBe("ok");
  });

  test("fails stalled chat streams with an explicit timeout error", async () => {
    const timedFetch = createTimedStreamingFetch(20, async (_input, init) => {
      const signal = init?.signal;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          signal?.addEventListener("abort", () => {
            controller.error(new DOMException("Aborted", "AbortError"));
          }, { once: true });
        },
      }));
    });

    await expect(timedFetch("https://example.test/chat").then((response) => response.text())).rejects.toThrow(
      "Chat request timed out after 20ms",
    );
  });
});
