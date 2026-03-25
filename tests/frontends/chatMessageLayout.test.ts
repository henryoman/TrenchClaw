import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import { buildAssistantMessageLayout } from "../../apps/frontends/gui/src/components/workspace/chatMessageLayout";

describe("buildAssistantMessageLayout", () => {
  test("groups reasoning and tool activity into collapsible thought blocks between text blocks", () => {
    const message: UIMessage = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "Planning the next step", state: "done" },
        { type: "text", text: "First visible answer." },
        { type: "reasoning", text: "Checking the workspace", state: "done" },
        {
          type: "tool-workspaceBash",
          toolCallId: "tool-1",
          toolName: "workspaceBash",
          state: "input-available",
          input: { command: "ls" },
        },
        {
          type: "tool-workspaceBash",
          toolCallId: "tool-1",
          toolName: "workspaceBash",
          state: "output-available",
          input: { command: "ls" },
          output: { ok: true },
        },
        { type: "text", text: "Second visible answer." },
      ] as UIMessage["parts"],
    };

    const layout = buildAssistantMessageLayout(message);

    expect(layout.blocks).toHaveLength(4);
    expect(layout.blocks.map((block) => block.kind)).toEqual(["thought", "text", "thought", "text"]);
    expect(layout.blocks[0]).toMatchObject({
      kind: "thought",
      state: "done",
      entries: [{ kind: "reasoning", text: "Planning the next step", state: "done" }],
    });
    expect(layout.blocks[1]).toMatchObject({
      kind: "text",
      text: "First visible answer.",
    });
    expect(layout.blocks[2]).toMatchObject({
      kind: "thought",
      state: "streaming",
    });
    if (layout.blocks[2]?.kind !== "thought") {
      return;
    }
    expect(layout.blocks[2].entries.map((entry) => entry.kind)).toEqual(["reasoning", "activity", "activity"]);
    expect(layout.blocks[3]).toMatchObject({
      kind: "text",
      text: "Second visible answer.",
    });
  });

  test("preserves a streaming placeholder thought block even without reasoning text yet", () => {
    const message: UIMessage = {
      id: "assistant-2",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "", state: "streaming" },
      ] as UIMessage["parts"],
    };

    const layout = buildAssistantMessageLayout(message);

    expect(layout.blocks).toEqual([
      {
        kind: "thought",
        id: "assistant-2:thought:0",
        state: "streaming",
        entries: [{ kind: "reasoning", text: "", state: "streaming" }],
      },
    ]);
  });
});
