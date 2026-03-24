import {
  consumeStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { createToolCallId, createUiTextPartId } from "../../ai/contracts/types/ids";
import {
  WALLET_CONTENTS_INTENT_PHRASES,
  WALLET_INVENTORY_INTENT_PHRASES,
} from "./constants";
import { createResponseMessageId, hasAnyIntentPhrase, hasWalletMutationIntent, isRecord, normalizeIntentText, isToolLikePart } from "./utils";
import { withChatHeaders } from "./persistence";

export const shouldUseWalletInventoryFastPath = (userMessage: string): boolean => {
  const normalized = normalizeIntentText(userMessage);
  if (!/\bwallets?\b/u.test(normalized) || hasWalletMutationIntent(normalized)) {
    return false;
  }

  const mentionsInventory = hasAnyIntentPhrase(normalized, WALLET_INVENTORY_INTENT_PHRASES);
  const mentionsContents = hasAnyIntentPhrase(normalized, WALLET_CONTENTS_INTENT_PHRASES);
  return mentionsInventory && !mentionsContents;
};

export const shouldUseWalletContentsFastPath = (userMessage: string): boolean => {
  const normalized = normalizeIntentText(userMessage);
  if (!/\bwallets?\b/u.test(normalized) || hasWalletMutationIntent(normalized)) {
    return false;
  }

  if (hasAnyIntentPhrase(normalized, WALLET_CONTENTS_INTENT_PHRASES)) {
    return true;
  }

  return /\b(?:what|show|list|how)\b/u.test(normalized);
};

export const formatWalletInventoryFastPathText = (data: unknown): string | null => {
  if (isRecord(data) && data.queued === true && isRecord(data.job)) {
    const job = data.job;
    const serialNumber = typeof job.serialNumber === "number" ? `#${job.serialNumber}` : `\`${typeof job.id === "string" ? job.id : "unknown-job"}\``;
    const status = typeof job.status === "string" ? job.status : "pending";
    const message = typeof data.message === "string" ? data.message : "Queued a wallet inventory scan in the background.";
    return [
      message,
      `Job ${serialNumber} is currently ${status}.`,
      "Ask again after it finishes, or inspect the job with `queryRuntimeStore`.",
    ].join("\n");
  }

  if (!isRecord(data) || !Array.isArray(data.wallets)) {
    return null;
  }

  const wallets = data.wallets
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      walletGroup: typeof entry.walletGroup === "string" ? entry.walletGroup : "",
      walletName: typeof entry.walletName === "string" ? entry.walletName : "",
      address: typeof entry.address === "string" ? entry.address : "",
    }))
    .filter((entry) => entry.walletName.length > 0 && entry.address.length > 0);

  if (wallets.length === 0) {
    return "No managed wallets were found.";
  }

  const walletGroups = [...new Set(wallets.map((wallet) => wallet.walletGroup).filter((walletGroup) => walletGroup.length > 0))];
  const heading =
    walletGroups.length === 1
      ? `We have ${wallets.length} managed wallet${wallets.length === 1 ? "" : "s"} in the ${walletGroups[0]} group:`
      : `We have ${wallets.length} managed wallet${wallets.length === 1 ? "" : "s"} across ${walletGroups.length} groups:`;

  const lines = wallets.map((wallet) =>
    walletGroups.length === 1
      ? `- ${wallet.walletName}: ${wallet.address}`
      : `- ${wallet.walletGroup}/${wallet.walletName}: ${wallet.address}`,
  );

  return [heading, ...lines].join("\n");
};

export const formatWalletContentsFastPathText = (data: unknown): string | null => {
  if (isRecord(data) && data.queued === true && isRecord(data.job)) {
    const job = data.job;
    const serialNumber = typeof job.serialNumber === "number" ? `#${job.serialNumber}` : `\`${typeof job.id === "string" ? job.id : "unknown-job"}\``;
    const status = typeof job.status === "string" ? job.status : "pending";
    const message = typeof data.message === "string" ? data.message : "Queued a wallet inventory scan in the background.";
    return [
      message,
      `Job ${serialNumber} is currently ${status}.`,
      "Ask for wallet contents again after it finishes, or inspect the job with `queryRuntimeStore`.",
    ].join("\n");
  }

  if (!isRecord(data) || !Array.isArray(data.wallets)) {
    return null;
  }

  const wallets = data.wallets
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      walletGroup: typeof entry.walletGroup === "string" ? entry.walletGroup : "",
      walletName: typeof entry.walletName === "string" ? entry.walletName : "",
      address: typeof entry.address === "string" ? entry.address : "",
      balanceSol: typeof entry.balanceSol === "number" ? entry.balanceSol : 0,
      collectibleCount: typeof entry.collectibleCount === "number" ? entry.collectibleCount : 0,
      tokenBalances: Array.isArray(entry.tokenBalances)
        ? entry.tokenBalances.filter((token): token is Record<string, unknown> => isRecord(token))
        : [],
    }))
    .filter((entry) => entry.walletName.length > 0 && entry.address.length > 0);
  const walletErrors = Array.isArray(data.walletErrors)
    ? data.walletErrors
      .filter((entry): entry is Record<string, unknown> => isRecord(entry))
      .map((entry) => ({
        walletGroup: typeof entry.walletGroup === "string" ? entry.walletGroup : "",
        walletName: typeof entry.walletName === "string" ? entry.walletName : "",
        retryable: entry.retryable === true,
      }))
      .filter((entry) => entry.walletName.length > 0)
    : [];

  if (wallets.length === 0) {
    return "No managed wallet contents were found.";
  }

  const header = `Here are the contents for ${wallets.length} managed wallet${wallets.length === 1 ? "" : "s"}:`;
  const lines: string[] = [];
  for (const wallet of wallets) {
    const tokenSummary = wallet.tokenBalances.length === 0
      ? ["  Tokens: none"]
      : wallet.tokenBalances.slice(0, 6).map((token) => {
          const mintAddress = typeof token.mintAddress === "string" ? token.mintAddress : "unknown-mint";
          const symbol = typeof token.symbol === "string" && token.symbol.trim().length > 0 ? token.symbol.trim() : null;
          const balanceUiString = typeof token.balanceUiString === "string" ? token.balanceUiString : "0";
          const valueUsd = typeof token.valueUsd === "number" && Number.isFinite(token.valueUsd) ? token.valueUsd : null;
          const label = symbol ? `${symbol} (${mintAddress})` : mintAddress;
          return `  Token ${label}: ${balanceUiString}${valueUsd !== null ? ` (~$${valueUsd.toFixed(2)})` : ""}`;
        });
    const collectibleSummary = wallet.collectibleCount > 0
      ? [`  Collectibles: ${wallet.collectibleCount}`]
      : [];

    lines.push(`- ${wallet.walletName}: ${wallet.balanceSol} SOL (${wallet.address})`);
    lines.push(...collectibleSummary);
    lines.push(...tokenSummary);
  }

  if (walletErrors.length > 0) {
    const skippedLabels = walletErrors
      .slice(0, 4)
      .map((entry) => (entry.walletGroup ? `${entry.walletGroup}/${entry.walletName}` : entry.walletName));
    const skippedSuffix = skippedLabels.length > 0 ? `: ${skippedLabels.join(", ")}` : "";
    const skippedReason = walletErrors.every((entry) => entry.retryable) ? " due to RPC throttling" : "";
    lines.push(`Skipped ${walletErrors.length} wallet${walletErrors.length === 1 ? "" : "s"}${skippedReason}${skippedSuffix}.`);
  }

  return [header, ...lines].join("\n");
};

export const formatWalletContentsRateLimitText = (toolName: string, error: string): string | null => {
  if (toolName !== "getManagedWalletContents") {
    return null;
  }

  const normalized = error.toLowerCase();
  if (
    normalized.includes("429")
    || normalized.includes("too many requests")
    || normalized.includes("rate limit")
  ) {
    return [
      "The wallet inventory read hit provider throttling before a safe fallback completed.",
      "`getManagedWalletContents` received a rate-limit response while reading managed-wallet balances.",
      "Retry after the cooldown, or let the runtime queue the heavier scan path instead of forcing it inline.",
    ].join("\n");
  }

  return null;
};

const formatTransferToolResultText = (output: unknown): string | null => {
  if (!isRecord(output) || output.ok !== true || !isRecord(output.data)) {
    return null;
  }

  const data = output.data;
  const transferType = data.transferType;
  const sourceAddress = typeof data.sourceAddress === "string" ? data.sourceAddress : null;
  const destination = typeof data.destination === "string" ? data.destination : null;
  const amountRaw = typeof data.amountRaw === "string" ? data.amountRaw : null;
  const amountUi = typeof data.amountUi === "number" ? data.amountUi : null;
  const txSignature = typeof data.txSignature === "string" ? data.txSignature : null;
  if (
    (transferType !== "sol" && transferType !== "spl")
    || !sourceAddress
    || !destination
    || !amountRaw
    || amountUi === null
    || !txSignature
  ) {
    return null;
  }

  const assetText =
    transferType === "sol"
      ? "SOL"
      : `token mint \`${typeof data.mintAddress === "string" ? data.mintAddress : "unknown"}\``;

  return [
    "Transfer submitted successfully.",
    `Moved \`${amountRaw}\` raw unit(s) (${amountUi}) of ${assetText} from \`${sourceAddress}\` to \`${destination}\`.`,
    `Transaction signature: \`${txSignature}\`.`,
  ].join("\n");
};

const formatCloseTokenAccountToolResultText = (output: unknown): string | null => {
  if (!isRecord(output) || output.ok !== true || !isRecord(output.data)) {
    return null;
  }

  const data = output.data;
  const tokenAccountAddress = typeof data.tokenAccountAddress === "string" ? data.tokenAccountAddress : null;
  const destination = typeof data.destination === "string" ? data.destination : null;
  const txSignature = typeof data.txSignature === "string" ? data.txSignature : null;
  if (!tokenAccountAddress || !destination || !txSignature) {
    return null;
  }

  return [
    "Token account closed successfully.",
    `Closed \`${tokenAccountAddress}\` and sent the reclaimed rent to \`${destination}\`.`,
    `Transaction signature: \`${txSignature}\`.`,
  ].join("\n");
};

const formatManagedTriggerOrderToolResultText = (output: unknown): string | null => {
  if (!isRecord(output) || output.ok !== true || !isRecord(output.data)) {
    return null;
  }

  const data = output.data;
  const order = typeof data.order === "string" ? data.order : null;
  const maker = typeof data.maker === "string" ? data.maker : null;
  const inputMint = typeof data.inputMint === "string" ? data.inputMint : null;
  const outputMint = typeof data.outputMint === "string" ? data.outputMint : null;
  const makingAmount = typeof data.makingAmount === "string" ? data.makingAmount : null;
  const takingAmount = typeof data.takingAmount === "string" ? data.takingAmount : null;
  const derivedTriggerPrice = typeof data.derivedTriggerPrice === "string" ? data.derivedTriggerPrice : null;
  const status = typeof data.status === "string" ? data.status : null;
  const signature = typeof data.signature === "string" ? data.signature : null;
  const tracking =
    isRecord(data.tracking)
      ? {
          action: typeof data.tracking.action === "string" ? data.tracking.action : null,
          user: typeof data.tracking.user === "string" ? data.tracking.user : null,
          orderStatus: typeof data.tracking.orderStatus === "string" ? data.tracking.orderStatus : null,
        }
      : null;

  if (
    !order
    || !maker
    || !inputMint
    || !outputMint
    || !makingAmount
    || !takingAmount
    || !derivedTriggerPrice
  ) {
    return null;
  }

  const lines = [
    "Trigger order submitted successfully.",
    `Order \`${order}\` for maker \`${maker}\` is ${status ? `currently \`${status}\`` : "submitted"}.`,
    `It will trade \`${makingAmount}\` raw unit(s) of \`${inputMint}\` for \`${takingAmount}\` raw unit(s) of \`${outputMint}\` at trigger price \`${derivedTriggerPrice}\`.`,
  ];

  if (signature) {
    lines.push(`Transaction signature: \`${signature}\`.`);
  }

  if (tracking?.action === "getTriggerOrders" && tracking.user && tracking.orderStatus) {
    lines.push(
      `Track it with \`${tracking.action}\` for user \`${tracking.user}\` and orderStatus \`${tracking.orderStatus}\`.`,
    );
  }

  return lines.join("\n");
};

export const formatKnownToolOnlyCompletionText = (message: UIMessage | undefined): string | null => {
  if (!message || message.role !== "assistant") {
    return null;
  }

  for (const part of message.parts) {
    if (!isToolLikePart(part)) {
      continue;
    }

    const toolName = part.type.slice(5);
    const output = "output" in part ? part.output : undefined;

    if (isRecord(output) && output.ok === false && typeof output.error === "string") {
      return formatWalletContentsRateLimitText(toolName, output.error)
        ?? `The request failed while running ${toolName}: ${output.error}`;
    }

    if (toolName === "getManagedWalletContents") {
      const walletContentsOutput =
        isRecord(output) && output.ok === true && "data" in output
          ? output.data
          : output;
      const formatted = formatWalletContentsFastPathText(walletContentsOutput);
      if (formatted) {
        return formatted;
      }
    }

    if (toolName === "transfer") {
      const formatted = formatTransferToolResultText(output);
      if (formatted) {
        return formatted;
      }
    }

    if (toolName === "closeTokenAccount") {
      const formatted = formatCloseTokenAccountToolResultText(output);
      if (formatted) {
        return formatted;
      }
    }

    if (toolName === "managedTriggerOrder") {
      const formatted = formatManagedTriggerOrderToolResultText(output);
      if (formatted) {
        return formatted;
      }
    }
  }

  return null;
};

export const createDirectTextStreamResponse = (input: {
  text: string;
  headers?: HeadersInit;
  chatId: string;
  originalMessages: UIMessage[];
  onFinish: (messages: UIMessage[]) => void;
}): Response => {
  const textId = createUiTextPartId();
  const stream = createUIMessageStream({
    originalMessages: input.originalMessages,
    execute: ({ writer }) => {
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: input.text });
      writer.write({ type: "text-end", id: textId });
    },
    onFinish: async ({ messages: finishedMessages }) => {
      input.onFinish(finishedMessages);
    },
  });

  return createUIMessageStreamResponse({
    headers: withChatHeaders(input.headers, input.chatId),
    stream,
    consumeSseStream: consumeStream,
  });
};

export const createDirectToolResultStreamResponse = (input: {
  headers?: HeadersInit;
  chatId: string;
  originalMessages: UIMessage[];
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput: unknown;
  text: string;
  onFinish: (messages: UIMessage[]) => void;
}): Response => {
  const toolCallId = createToolCallId();
  const textId = createUiTextPartId();

  const stream = createUIMessageStream({
    originalMessages: input.originalMessages,
    execute: ({ writer }) => {
      writer.write({ type: "start", messageId: createResponseMessageId() });
      writer.write({ type: "start-step" });
      writer.write({ type: "tool-input-start", toolCallId, toolName: input.toolName });
      writer.write({
        type: "tool-input-available",
        toolCallId,
        toolName: input.toolName,
        input: input.toolInput,
      });
      writer.write({
        type: "tool-output-available",
        toolCallId,
        output: input.toolOutput,
      });
      writer.write({ type: "finish-step" });
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: input.text });
      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish", finishReason: "stop" });
    },
    onFinish: async ({ messages: finishedMessages }) => {
      input.onFinish(finishedMessages);
    },
  });

  return createUIMessageStreamResponse({
    headers: withChatHeaders(input.headers, input.chatId),
    stream,
    consumeSseStream: consumeStream,
  });
};
