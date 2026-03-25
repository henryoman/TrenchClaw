import { describe, expect, test } from "bun:test";
import type { UIMessageChunk } from "ai";

import { pipeModelFullStreamToUIMessageStream } from "../../apps/trenchclaw/src/runtime/chat/streaming";

describe("chat streaming adapters", () => {
  test("forwards discrete reasoning chunks from model full streams", async () => {
    const chunks: UIMessageChunk[] = [];

    await pipeModelFullStreamToUIMessageStream(
      (async function* () {
        yield { type: "start" };
        yield { type: "reasoning-start", id: "reasoning-1" };
        yield { type: "reasoning-delta", id: "reasoning-1", text: "thinking" };
        yield { type: "reasoning-end", id: "reasoning-1" };
        yield { type: "finish", finishReason: "stop" };
      })(),
      (chunk) => {
        chunks.push(chunk);
      },
    );

    expect(chunks).toEqual([
      { type: "start", messageId: expect.any(String) },
      { type: "reasoning-start", id: "reasoning-1" },
      { type: "reasoning-delta", id: "reasoning-1", delta: "thinking" },
      { type: "reasoning-end", id: "reasoning-1" },
      { type: "finish", finishReason: "stop" },
    ]);
  });

  test("converts aggregate reasoning parts into UI reasoning chunks", async () => {
    const chunks: UIMessageChunk[] = [];

    await pipeModelFullStreamToUIMessageStream(
      (async function* () {
        yield { type: "start" };
        yield { type: "reasoning", id: "reasoning-2", text: "drafting answer" };
        yield { type: "finish", finishReason: "stop" };
      })(),
      (chunk) => {
        chunks.push(chunk);
      },
    );

    expect(chunks).toEqual([
      { type: "start", messageId: expect.any(String) },
      { type: "reasoning-start", id: "reasoning-2" },
      { type: "reasoning-delta", id: "reasoning-2", delta: "drafting answer" },
      { type: "reasoning-end", id: "reasoning-2" },
      { type: "finish", finishReason: "stop" },
    ]);
  });
});
