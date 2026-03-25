import { isReasoningUIPart, isToolUIPart, type UIMessage } from "ai";

import {
  messagePartToActivityItem,
  type ChatActivityItem,
} from "./chatActivity";

type MessagePart = UIMessage["parts"][number];
type ToolPart = Extract<MessagePart, { type: string }> & {
  toolCallId: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
};

export type AssistantThoughtEntry =
  | {
      kind: "reasoning";
      text: string;
      state: "streaming" | "done";
    }
  | {
      kind: "activity";
      item: ChatActivityItem;
    };

export type AssistantMessageBlock =
  | {
      kind: "text";
      id: string;
      text: string;
    }
  | {
      kind: "thought";
      id: string;
      state: "streaming" | "done";
      entries: AssistantThoughtEntry[];
    };

export interface AssistantMessageLayout {
  blocks: AssistantMessageBlock[];
}

const normalizeDisplayText = (value: string): string =>
  value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const isTextPart = (part: MessagePart): part is Extract<MessagePart, { type: "text" }> =>
  part.type === "text";

const isStreamingToolPart = (part: ToolPart): boolean =>
  part.state === "input-streaming" || part.state === "input-available";

export const buildAssistantMessageLayout = (message: UIMessage): AssistantMessageLayout => {
  const blocks: AssistantMessageBlock[] = [];
  let currentThoughtEntries: AssistantThoughtEntry[] = [];
  let currentThoughtState: "streaming" | "done" = "done";
  let thoughtIndex = 0;
  let textIndex = 0;

  const flushThoughtBlock = (): void => {
    if (currentThoughtEntries.length === 0) {
      return;
    }

    blocks.push({
      kind: "thought",
      id: `${message.id}:thought:${thoughtIndex}`,
      state: currentThoughtState,
      entries: currentThoughtEntries,
    });

    thoughtIndex += 1;
    currentThoughtEntries = [];
    currentThoughtState = "done";
  };

  for (const part of message.parts) {
    if (isTextPart(part)) {
      const text = normalizeDisplayText(part.text ?? "");
      if (!text) {
        continue;
      }

      flushThoughtBlock();
      blocks.push({
        kind: "text",
        id: `${message.id}:text:${textIndex}`,
        text,
      });
      textIndex += 1;
      continue;
    }

    if (isReasoningUIPart(part)) {
      const text = normalizeDisplayText(part.text ?? "");
      const state = part.state === "streaming" ? "streaming" : "done";
      if (!text && state !== "streaming") {
        continue;
      }

      currentThoughtEntries.push({
        kind: "reasoning",
        text,
        state,
      });
      if (state === "streaming") {
        currentThoughtState = "streaming";
      }
      continue;
    }

    if (isToolUIPart(part)) {
      const activityItem = messagePartToActivityItem(part);
      if (!activityItem) {
        continue;
      }

      currentThoughtEntries.push({
        kind: "activity",
        item: activityItem,
      });
      if (isStreamingToolPart(part as ToolPart)) {
        currentThoughtState = "streaming";
      }
    }
  }

  flushThoughtBlock();

  return { blocks };
};
