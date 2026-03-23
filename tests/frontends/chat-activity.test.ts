import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import { buildChatActivitySnapshot } from "../../apps/frontends/gui/src/components/workspace/chat-activity";

describe("buildChatActivitySnapshot", () => {
  test("surfaces queued tool work clearly for the current run", () => {
    const messages: UIMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "check wallets" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-getManagedWalletContents",
            toolCallId: "tool-1",
            state: "output-available",
            input: {},
            output: {
              data: {
                queued: true,
                job: {
                  serialNumber: 12,
                  status: "pending",
                },
              },
            },
          },
        ],
      },
    ];

    const snapshot = buildChatActivitySnapshot({
      messages,
      chatStatus: "ready",
      runtimeEntries: [],
    });

    expect(snapshot.statusLabel).toBe("Queued");
    expect(snapshot.currentItems[0]?.detail).toContain("check wallets");
    expect(snapshot.currentItems.some((item) => item.badge === "QUEUE" && item.detail.includes("#12"))).toBe(true);
  });

  test("shows planning state before the first tool call arrives", () => {
    const messages: UIMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "open the runtime docs" }],
      },
    ];

    const snapshot = buildChatActivitySnapshot({
      messages,
      chatStatus: "submitted",
      runtimeEntries: [],
    });

    expect(snapshot.statusLabel).toBe("Planning");
    expect(snapshot.currentItems.some((item) => item.badge === "PLAN")).toBe(true);
  });

  test("maps runtime feed items into readable tones", () => {
    const snapshot = buildChatActivitySnapshot({
      messages: [],
      chatStatus: "ready",
      runtimeEntries: [
        {
          id: "queue-1",
          source: "queue",
          summary: "Queued actionSequence for bot-1 (2/3)",
          timestamp: 10,
        },
        {
          id: "chat-1",
          source: "chat",
          summary: "Assistant response finished",
          timestamp: 20,
        },
      ],
    });

    expect(snapshot.feedItems).toHaveLength(2);
    expect(snapshot.feedItems[0]?.tone).toBe("queued");
    expect(snapshot.feedItems[1]?.tone).toBe("done");
  });
});
