import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import { buildChatActivitySnapshot } from "../../apps/frontends/gui/src/components/workspace/chat-activity";

describe("buildChatActivitySnapshot", () => {
  test("renders command tool activity as command plus compact status", () => {
    const messages: UIMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "list files" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-workspaceBash",
            toolCallId: "tool-1",
            toolName: "workspaceBash",
            state: "output-error",
            input: { type: "shell", command: "ls -la" },
            errorText: "{\"error\":\"Command failed\",\"details\":{\"exitCode\":2}}",
          },
        ] as UIMessage["parts"],
      },
    ];

    const snapshot = buildChatActivitySnapshot({
      messages,
      chatStatus: "ready",
      runtimeEntries: [],
    });

    expect(snapshot.currentItems).toHaveLength(1);
    expect(snapshot.currentItems[0]).toMatchObject({
      badge: "ERR",
      title: "ls -la",
      detail: "Error",
      compact: true,
    });
    expect(snapshot.currentItems[0]?.meta).toBeUndefined();
  });

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
    expect(snapshot.currentItems.some((item) => item.badge === "ASK")).toBe(false);
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

  test("collapses chat prompt lifecycle into one response-time entry", () => {
    const snapshot = buildChatActivitySnapshot({
      messages: [],
      chatStatus: "ready",
      runtimeEntries: [
        {
          id: "chat-1",
          source: "chat",
          summary: "Prompt sent (1 message)",
          timestamp: 1_000,
        },
        {
          id: "chat-2",
          source: "chat",
          summary: "Assistant response started",
          timestamp: 1_200,
        },
        {
          id: "chat-3",
          source: "chat",
          summary: "Assistant response finished",
          timestamp: 3_400,
        },
      ],
    });

    expect(snapshot.feedItems).toHaveLength(1);
    expect(snapshot.feedItems[0]).toMatchObject({
      sourceLabel: "agent",
      summary: "Agent responded in 2.4 seconds",
      tone: "done",
    });
  });
});
