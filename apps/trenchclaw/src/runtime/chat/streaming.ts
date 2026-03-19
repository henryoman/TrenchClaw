import type { UIMessage, UIMessageChunk } from "ai";
import { createUiTextPartId } from "../../ai/runtime/types/ids";
import { createResponseMessageId, toRuntimeChatErrorMessage } from "./utils";

export const uiChunkHasVisibleText = (chunk: UIMessageChunk): boolean => {
  if (chunk.type === "text-delta") {
    return chunk.delta.trim().length > 0;
  }
  return false;
};

export const isSuppressiblePreToolChunk = (chunk: UIMessageChunk): boolean =>
  chunk.type === "text-start"
  || chunk.type === "text-delta"
  || chunk.type === "text-end"
  || chunk.type === "reasoning-start"
  || chunk.type === "reasoning-delta"
  || chunk.type === "reasoning-end";

export const isReasoningChunk = (chunk: UIMessageChunk): boolean =>
  chunk.type === "reasoning-start"
  || chunk.type === "reasoning-delta"
  || chunk.type === "reasoning-end";

export const uiChunkHasToolActivity = (chunk: UIMessageChunk): boolean =>
  chunk.type === "tool-input-start"
  || chunk.type === "tool-input-delta"
  || chunk.type === "tool-input-available"
  || chunk.type === "tool-input-error"
  || chunk.type === "tool-output-available"
  || chunk.type === "tool-output-error"
  || chunk.type === "tool-output-denied"
  || chunk.type === "tool-approval-request";

export const isRecoverableToolOnlyStreamError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Received text-end for missing text part")
    || message.includes("Received text-delta for missing text part");
};

export const pipeModelFullStreamToUIMessageStream = async (
  stream: AsyncIterable<Record<string, unknown>>,
  writeChunk: (chunk: UIMessageChunk) => void,
  observeChunk?: (chunk: UIMessageChunk) => void,
): Promise<void> => {
  const responseMessageId = createResponseMessageId();
  const activeTextPartIds = new Set<string>();
  for await (const part of stream) {
    const partType = typeof part.type === "string" ? part.type : "";
    let chunk: UIMessageChunk | null = null;
    switch (partType) {
      case "text": {
        const text = typeof part.text === "string" ? part.text : "";
        if (!text) break;
        const id = typeof part.id === "string" && part.id.length > 0 ? part.id : createUiTextPartId();
        chunk = { type: "text-start", id };
        observeChunk?.(chunk);
        writeChunk(chunk);
        chunk = { type: "text-delta", id, delta: text };
        observeChunk?.(chunk);
        writeChunk(chunk);
        chunk = { type: "text-end", id };
        activeTextPartIds.delete(id);
        break;
      }
      case "text-start": {
        const id = typeof part.id === "string" ? part.id : "";
        if (!id) break;
        activeTextPartIds.add(id);
        chunk = { type: "text-start", id };
        break;
      }
      case "text-delta": {
        const id = typeof part.id === "string" ? part.id : "";
        if (!id || !activeTextPartIds.has(id) || typeof part.text !== "string") break;
        chunk = { type: "text-delta", id, delta: part.text };
        break;
      }
      case "text-end": {
        const id = typeof part.id === "string" ? part.id : "";
        if (!id || !activeTextPartIds.has(id)) break;
        activeTextPartIds.delete(id);
        chunk = { type: "text-end", id };
        break;
      }
      case "reasoning-start":
      case "reasoning-delta":
      case "reasoning-end":
      case "tool-input-end":
      case "raw":
        break;
      case "tool-input-start": {
        const toolCallId = typeof part.id === "string" ? part.id : "";
        const toolName = typeof part.toolName === "string" ? part.toolName : "";
        if (!toolCallId || !toolName) break;
        chunk = { type: "tool-input-start", toolCallId, toolName };
        break;
      }
      case "tool-input-delta": {
        const toolCallId = typeof part.id === "string" ? part.id : "";
        const inputTextDelta = typeof part.delta === "string" ? part.delta : "";
        if (!toolCallId) break;
        chunk = { type: "tool-input-delta", toolCallId, inputTextDelta };
        break;
      }
      case "tool-call": {
        const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : "";
        const toolName = typeof part.toolName === "string" ? part.toolName : "";
        if (!toolCallId || !toolName) break;
        chunk = part.invalid === true
          ? {
              type: "tool-input-error",
              toolCallId,
              toolName,
              input: part.input,
              errorText: "Tool input validation failed.",
            }
          : {
              type: "tool-input-available",
              toolCallId,
              toolName,
              input: part.input,
            };
        break;
      }
      case "tool-result": {
        const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : "";
        if (!toolCallId) break;
        chunk = { type: "tool-output-available", toolCallId, output: part.output };
        break;
      }
      case "tool-error": {
        const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : "";
        if (!toolCallId) break;
        chunk = { type: "tool-output-error", toolCallId, errorText: toRuntimeChatErrorMessage(part.error) };
        break;
      }
      case "tool-output-denied": {
        const toolCallId = typeof part.toolCallId === "string" ? part.toolCallId : "";
        if (!toolCallId) break;
        chunk = { type: "tool-output-denied", toolCallId };
        break;
      }
      case "tool-approval-request": {
        const approvalId = typeof part.approvalId === "string" ? part.approvalId : "";
        const toolCall = part.toolCall && typeof part.toolCall === "object" ? part.toolCall as Record<string, unknown> : null;
        const toolCallId = typeof toolCall?.toolCallId === "string" ? toolCall.toolCallId : "";
        if (!approvalId || !toolCallId) break;
        chunk = { type: "tool-approval-request", approvalId, toolCallId };
        break;
      }
      case "start":
        chunk = { type: "start", messageId: responseMessageId };
        break;
      case "start-step":
        chunk = { type: "start-step" };
        break;
      case "finish-step":
        chunk = { type: "finish-step" };
        break;
      case "finish":
        chunk = {
          type: "finish",
          finishReason:
            part.finishReason === "stop"
            || part.finishReason === "length"
            || part.finishReason === "content-filter"
            || part.finishReason === "tool-calls"
            || part.finishReason === "error"
            || part.finishReason === "other"
              ? part.finishReason
              : "stop",
        };
        break;
      case "abort":
        chunk = { type: "abort", ...(typeof part.reason === "string" ? { reason: part.reason } : {}) };
        break;
      case "error":
        chunk = { type: "error", errorText: toRuntimeChatErrorMessage(part.error) };
        break;
    }
    if (!chunk) continue;
    observeChunk?.(chunk);
    writeChunk(chunk);
  }
};

export const pipeUIMessageStream = async (
  stream: ReadableStream<UIMessageChunk>,
  writeChunk: (chunk: UIMessageChunk) => void,
  observeChunk?: (chunk: UIMessageChunk) => void,
): Promise<void> => {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      observeChunk?.(value);
      writeChunk(value);
    }
  } finally {
    reader.releaseLock();
  }
};

export const writeAssistantTextMessage = (input: {
  writeChunk: (chunk: UIMessageChunk) => void;
  text: string;
  finishReason?: "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other";
}): void => {
  const messageId = createResponseMessageId();
  const textId = createUiTextPartId();
  input.writeChunk({ type: "start", messageId });
  input.writeChunk({ type: "text-start", id: textId });
  input.writeChunk({ type: "text-delta", id: textId, delta: input.text });
  input.writeChunk({ type: "text-end", id: textId });
  input.writeChunk({ type: "finish", finishReason: input.finishReason ?? "stop" });
};

export function createToolPartFromStreamState(input: {
  toolName: string;
  toolCallId: string;
  state: "input-available";
  input: unknown;
}): UIMessage["parts"][number];
export function createToolPartFromStreamState(input: {
  toolName: string;
  toolCallId: string;
  state: "output-available";
  input: unknown;
  output: unknown;
}): UIMessage["parts"][number];
export function createToolPartFromStreamState(input: {
  toolName: string;
  toolCallId: string;
  state: "input-available" | "output-available";
  input: unknown;
  output?: unknown;
}): UIMessage["parts"][number] {
  if (input.state === "input-available") {
    return {
      type: `tool-${input.toolName}`,
      toolCallId: input.toolCallId,
      state: "input-available",
      input: input.input,
    };
  }

  return {
    type: `tool-${input.toolName}`,
    toolCallId: input.toolCallId,
    state: "output-available",
    input: input.input,
    output: input.output,
  };
}
