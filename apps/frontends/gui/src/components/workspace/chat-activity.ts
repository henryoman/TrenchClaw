import type { GuiActivityEntry } from "@trenchclaw/types";
import { isToolUIPart, type UIMessage } from "ai";

export type ChatStatus = "submitted" | "streaming" | "ready" | "error";
export type ChatActivityTone = "pending" | "running" | "queued" | "done" | "error" | "info";

export interface ChatActivityItem {
  id: string;
  tone: ChatActivityTone;
  badge: string;
  title: string;
  detail: string;
  meta?: string;
}

export interface ChatActivityFeedItem {
  id: string;
  sourceLabel: string;
  summary: string;
  timestamp: number;
  tone: ChatActivityTone;
}

export interface ChatActivitySnapshot {
  statusLabel: string;
  statusTone: ChatActivityTone;
  currentItems: ChatActivityItem[];
  feedItems: ChatActivityFeedItem[];
}

const MAX_INPUT_PREVIEW = 84;
const FEED_ITEM_LIMIT = 6;
const RUNTIME_TRANSPORT_INITIALIZED_SUMMARY = "Runtime transport initialized";

type MessagePart = UIMessage["parts"][number];
type ToolPart = Extract<MessagePart, { type: string }> & {
  toolCallId: string;
  toolName?: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeDisplayText = (value: string): string =>
  value
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();

const truncateText = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const isRenderableToolPart = (part: MessagePart): part is ToolPart =>
  isToolUIPart(part);

const humanizeToolName = (toolName: string): string =>
  toolName
    .replace(/^tool-/u, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./u, (character) => character.toUpperCase());

const resolveToolPartName = (part: ToolPart): string =>
  typeof part.toolName === "string" && part.toolName.trim().length > 0
    ? part.toolName
    : part.type.startsWith("tool-")
      ? part.type.slice(5)
      : part.type;

const resolvePayloadData = (value: unknown): unknown =>
  isRecord(value) && "data" in value ? value.data : value;

const findNestedJobRecord = (value: unknown): Record<string, unknown> | null => {
  const payload = resolvePayloadData(value);
  if (!isRecord(payload)) {
    return null;
  }
  if (isRecord(payload.job)) {
    return payload.job;
  }
  return null;
};

const parseQueuedDetail = (value: unknown): string | null => {
  const payload = resolvePayloadData(value);
  if (!isRecord(payload) || payload.queued !== true) {
    return null;
  }

  const job = findNestedJobRecord(value);
  const serialNumber =
    typeof job?.serialNumber === "number"
      ? `#${job.serialNumber}`
      : typeof job?.id === "string" && job.id.trim().length > 0
        ? job.id.trim()
        : null;
  const status = typeof job?.status === "string" ? job.status : "pending";
  const message = typeof payload.message === "string" ? normalizeDisplayText(payload.message) : "";

  if (message) {
    return message;
  }
  if (serialNumber) {
    return `Background job ${serialNumber} is ${status}.`;
  }
  return `Queued background work (${status}).`;
};

const isThrottleText = (value: string): boolean =>
  /\b429\b/iu.test(value)
  || /too many requests/iu.test(value)
  || /rate limit/iu.test(value)
  || /throttl/iu.test(value)
  || /cooldown/iu.test(value);

const summarizeInput = (value: unknown): string | undefined => {
  if (!isRecord(value)) {
    if (typeof value === "string") {
      const text = normalizeDisplayText(value);
      return text ? truncateText(text, MAX_INPUT_PREVIEW) : undefined;
    }
    return undefined;
  }

  if (typeof value.command === "string") {
    return truncateText(value.command.trim(), MAX_INPUT_PREVIEW);
  }
  if (typeof value.path === "string") {
    return truncateText(value.path.trim(), MAX_INPUT_PREVIEW);
  }
  if (typeof value.doc === "string") {
    return truncateText(`doc: ${value.doc.trim()}`, MAX_INPUT_PREVIEW);
  }
  if (typeof value.wallet === "string") {
    return truncateText(`wallet: ${value.wallet.trim()}`, MAX_INPUT_PREVIEW);
  }
  if (Array.isArray(value.wallets) && value.wallets.length > 0) {
    return truncateText(`wallets: ${value.wallets.slice(0, 3).join(", ")}`, MAX_INPUT_PREVIEW);
  }
  if (isRecord(value.request) && typeof value.request.type === "string") {
    return truncateText(`request: ${value.request.type}`, MAX_INPUT_PREVIEW);
  }
  if (
    typeof value.inputCoin === "string"
    && typeof value.outputCoin === "string"
    && (typeof value.amount === "string" || typeof value.amount === "number")
  ) {
    return truncateText(`${value.inputCoin} -> ${value.outputCoin} · ${String(value.amount)}`, MAX_INPUT_PREVIEW);
  }

  return undefined;
};

const getMessageToolParts = (message: UIMessage): ToolPart[] =>
  (message.role === "assistant" ? message.parts : []).filter(isRenderableToolPart);

const collectToolPartsSinceLatestUser = (messages: UIMessage[]): ToolPart[] => {
  let startIndex = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      startIndex = index;
      break;
    }
  }

  return messages
    .slice(startIndex)
    .flatMap((message) => message.role === "assistant" ? message.parts : [])
    .filter(isRenderableToolPart);
};

const toCurrentActivityItem = (part: ToolPart): ChatActivityItem => {
  const title = humanizeToolName(resolveToolPartName(part));
  const meta = summarizeInput(part.input);

  if (part.state === "input-streaming") {
    return {
      id: part.toolCallId,
      tone: "pending",
      badge: "PREP",
      title,
      detail: "Preparing tool input.",
      ...(meta ? { meta } : {}),
    };
  }

  if (part.state === "input-available") {
    return {
      id: part.toolCallId,
      tone: "running",
      badge: "RUN",
      title,
      detail: "Tool call is in flight.",
      ...(meta ? { meta } : {}),
    };
  }

  if (part.state === "output-error") {
    const errorText = normalizeDisplayText(part.errorText ?? "");
    return {
      id: part.toolCallId,
      tone: "error",
      badge: isThrottleText(errorText) ? "RATE" : "ERR",
      title,
      detail: isThrottleText(errorText)
        ? "RPC rate limit or throttle hit."
        : errorText || "Tool call failed.",
      ...(meta ? { meta } : {}),
    };
  }

  const queuedDetail = parseQueuedDetail(part.output);
  if (queuedDetail) {
    return {
      id: part.toolCallId,
      tone: "queued",
      badge: "QUEUE",
      title,
      detail: queuedDetail,
      ...(meta ? { meta } : {}),
    };
  }

  return {
    id: part.toolCallId,
    tone: "done",
    badge: "DONE",
    title,
    detail: "Tool result received.",
    ...(meta ? { meta } : {}),
  };
};

export const messagePartToActivityItem = (part: MessagePart): ChatActivityItem | null =>
  isRenderableToolPart(part) ? toCurrentActivityItem(part) : null;

export const getMessageActivityItems = (message: UIMessage): ChatActivityItem[] =>
  getMessageToolParts(message).map(toCurrentActivityItem);

export const hasRenderableMessageActivity = (message: UIMessage): boolean =>
  getMessageActivityItems(message).length > 0;

export const isIdleActivityItem = (item: ChatActivityItem): boolean =>
  item.id === "idle";

const hasVisibleAssistantTextSinceLatestUser = (messages: UIMessage[]): boolean => {
  let startIndex = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      startIndex = index;
      break;
    }
  }

  return messages
    .slice(startIndex)
    .some((message) =>
      message.role === "assistant"
      && message.parts.some((part) => part.type === "text" && normalizeDisplayText(part.text ?? "").length > 0));
};

const summarizeFeedTone = (entry: GuiActivityEntry): ChatActivityTone => {
  const summary = entry.summary.toLowerCase();
  if (/fail|error|denied|invalid/.test(summary)) {
    return "error";
  }
  if (/queued|pending|paused|waiting|cooldown|retry/.test(summary) || entry.source === "queue") {
    return "queued";
  }
  if (/finished|saved|updated|completed|succeeded|initialized/.test(summary)) {
    return "done";
  }
  if (/started|running|checking|sent/.test(summary)) {
    return "running";
  }
  return "info";
};

const isPromptSentEntry = (entry: GuiActivityEntry): boolean =>
  entry.source === "chat" && entry.summary.startsWith("Prompt sent");

const isAssistantResponseStartedEntry = (entry: GuiActivityEntry): boolean =>
  entry.source === "chat" && entry.summary === "Assistant response started";

const isAssistantResponseFinishedEntry = (entry: GuiActivityEntry): boolean =>
  entry.source === "chat" && entry.summary.startsWith("Assistant response finished");

const formatResponseDuration = (durationMs: number): string => {
  const safeDurationMs = Math.max(0, durationMs);
  if (safeDurationMs < 1_000) {
    return "under 1 second";
  }

  const seconds = safeDurationMs / 1_000;
  if (seconds < 10) {
    const rounded = seconds.toFixed(1).replace(/\.0$/u, "");
    return `${rounded} seconds`;
  }

  const roundedSeconds = Math.round(seconds);
  if (roundedSeconds < 60) {
    return `${roundedSeconds} second${roundedSeconds === 1 ? "" : "s"}`;
  }

  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"} ${remainingSeconds} second${remainingSeconds === 1 ? "" : "s"}`;
};

const toFeedItem = (
  entry: GuiActivityEntry,
  overrides?: Partial<Pick<ChatActivityFeedItem, "sourceLabel" | "summary" | "tone">>,
): ChatActivityFeedItem => ({
  id: entry.id,
  sourceLabel: overrides?.sourceLabel ?? entry.source,
  summary: overrides?.summary ?? entry.summary,
  timestamp: entry.timestamp,
  tone: overrides?.tone ?? summarizeFeedTone(entry),
});

export const buildConsoleFeedItems = (
  entries: GuiActivityEntry[],
  limit?: number,
): ChatActivityFeedItem[] => {
  const items: ChatActivityFeedItem[] = [];
  let latestPromptEntry: GuiActivityEntry | null = null;
  let latestResponseStartedEntry: GuiActivityEntry | null = null;

  for (const entry of entries) {
    if (entry.summary === RUNTIME_TRANSPORT_INITIALIZED_SUMMARY) {
      continue;
    }

    if (isPromptSentEntry(entry)) {
      latestPromptEntry = entry;
      latestResponseStartedEntry = null;
      continue;
    }

    if (isAssistantResponseStartedEntry(entry)) {
      latestResponseStartedEntry = entry;
      continue;
    }

    if (isAssistantResponseFinishedEntry(entry)) {
      const startedAt = latestPromptEntry?.timestamp ?? latestResponseStartedEntry?.timestamp;
      items.push(toFeedItem(entry, {
        sourceLabel: "agent",
        summary: startedAt
          ? `Agent responded in ${formatResponseDuration(entry.timestamp - startedAt)}`
          : "Agent responded",
        tone: "done",
      }));
      latestPromptEntry = null;
      latestResponseStartedEntry = null;
      continue;
    }

    items.push(toFeedItem(entry));
  }

  return typeof limit === "number" ? items.slice(-limit) : items;
};

const resolveStatus = (input: {
  runtimeError: string;
  chatStatus: ChatStatus;
  currentItems: ChatActivityItem[];
}): { label: string; tone: ChatActivityTone } => {
  if (input.runtimeError.trim().length > 0 || input.currentItems.some((item) => item.tone === "error")) {
    return { label: "Needs attention", tone: "error" };
  }
  if (input.currentItems.some((item) => item.tone === "queued")) {
    return { label: "Queued", tone: "queued" };
  }
  if (input.currentItems.some((item) => item.tone === "running")) {
    return { label: "Working", tone: "running" };
  }
  if (input.chatStatus === "submitted") {
    return { label: "Planning", tone: "pending" };
  }
  if (input.chatStatus === "streaming") {
    return { label: "Streaming", tone: "running" };
  }
  if (input.currentItems.some((item) => item.tone === "done")) {
    return { label: "Complete", tone: "done" };
  }
  return { label: "Idle", tone: "info" };
};

export const buildChatActivitySnapshot = (input: {
  messages: UIMessage[];
  chatStatus: ChatStatus;
  runtimeError?: string;
  runtimeEntries?: GuiActivityEntry[];
}): ChatActivitySnapshot => {
  const runtimeError = input.runtimeError?.trim() ?? "";
  const currentItems: ChatActivityItem[] = [];
  const toolItems = collectToolPartsSinceLatestUser(input.messages).map(toCurrentActivityItem);
  const hasVisibleAssistantText = hasVisibleAssistantTextSinceLatestUser(input.messages);

  if (runtimeError) {
    currentItems.push({
      id: "runtime-error",
      tone: "error",
      badge: "ERR",
      title: "Runtime error",
      detail: runtimeError,
    });
  }

  currentItems.push(...toolItems);

  if (toolItems.length === 0 && input.chatStatus === "submitted") {
    currentItems.push({
      id: "planning",
      tone: "pending",
      badge: "PLAN",
      title: "Agent",
      detail: "Waiting for the first tool decision.",
    });
  }

  if (toolItems.length === 0 && input.chatStatus === "streaming") {
    currentItems.push({
      id: "streaming",
      tone: "running",
      badge: "TEXT",
      title: "Response",
      detail: hasVisibleAssistantText ? "Streaming answer text." : "Generating answer text.",
    });
  }

  if (currentItems.length === 0) {
    currentItems.push({
      id: "idle",
      tone: "info",
      badge: "IDLE",
      title: "Agent",
      detail: "No live activity yet.",
    });
  }

  const feedItems = buildConsoleFeedItems(input.runtimeEntries ?? [], FEED_ITEM_LIMIT);

  const status = resolveStatus({
    runtimeError,
    chatStatus: input.chatStatus,
    currentItems,
  });

  return {
    statusLabel: status.label,
    statusTone: status.tone,
    currentItems,
    feedItems,
  };
};
