import path from "node:path";
import type { UIMessage } from "ai";

import type { ActionResult } from "../runtime/types/action";
import {
  DEFAULT_WALLET_LIBRARY_FILE_NAME,
  type ManagedWalletLibraryEntry,
} from "../../solana/lib/wallet/wallet-types";
import {
  inferManagedWalletLibraryEntriesFromFilesystem,
  readManagedWalletLibraryEntries,
  resolveWalletKeypairRootPathForInstanceId,
} from "../../solana/lib/wallet/wallet-manager";
import { resolveCurrentActiveInstanceIdSync } from "../../runtime/instance-state";
import type { GatewayContext, GatewayFastPathResult, GatewayLane } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const walletContentsPatterns = [
  /\bwhat do we have in our wallets\b/u,
  /\bwallet contents\b/u,
  /\bholdings\b/u,
  /\btoken balances\b/u,
  /\btotal balances\b/u,
  /\bhow much is in our wallets\b/u,
  /\bour wallets?\b/u,
  /\bother coins\b/u,
];

const solOnlyPatterns = [
  /\bhow much sol\b/u,
  /\bsol only\b/u,
  /\bsol balance\b/u,
  /\bjust sol\b/u,
];

const extractLatestUserText = (messages: UIMessage[]): string =>
  messages
    .toReversed()
    .find((message) => message.role === "user")
    ?.parts.map((part) => (part.type === "text" ? part.text : "")).join("\n")
    .trim() ?? "";

const resolveWalletIntent = (message: string): { fastPath: string; actionName: string } | null => {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (solOnlyPatterns.some((pattern) => pattern.test(normalized))) {
    return {
      fastPath: "wallet-sol-balances",
      actionName: "getManagedWalletSolBalances",
    };
  }

  if (walletContentsPatterns.some((pattern) => pattern.test(normalized))) {
    return {
      fastPath: "wallet-contents",
      actionName: "getManagedWalletContents",
    };
  }

  return null;
};

const loadManagedWalletEntries = async (instanceId: string): Promise<ManagedWalletLibraryEntry[]> => {
  const keypairRootPath = resolveWalletKeypairRootPathForInstanceId(instanceId);
  const walletLibraryFilePath = path.join(keypairRootPath, DEFAULT_WALLET_LIBRARY_FILE_NAME);
  const walletLibraryFile = Bun.file(walletLibraryFilePath);
  if (await walletLibraryFile.exists()) {
    return (await readManagedWalletLibraryEntries({
      filePath: walletLibraryFilePath,
      inferFromFilesystem: true,
    })).entries;
  }
  return inferManagedWalletLibraryEntriesFromFilesystem({ keypairRootPath });
};

const resolveWalletScopeFromMessage = async (
  message: string,
  instanceId: string | null,
): Promise<{ walletGroup?: string; walletNames?: string[] }> => {
  if (!instanceId) {
    return {};
  }

  const entries = await loadManagedWalletEntries(instanceId);
  if (entries.length === 0) {
    return {};
  }

  const normalized = message.toLowerCase();
  const matchingNames = entries
    .filter((entry) =>
      normalized.includes(entry.walletName.toLowerCase())
      || normalized.includes(entry.walletId.toLowerCase())
      || normalized.includes(entry.address.toLowerCase()))
    .map((entry) => entry.walletName);
  const matchingGroups = [...new Set(
    entries
      .filter((entry) => normalized.includes(entry.walletGroup.toLowerCase()))
      .map((entry) => entry.walletGroup),
  )];

  return {
    ...(matchingGroups.length === 1 ? { walletGroup: matchingGroups[0] } : {}),
    ...(matchingNames.length > 0 ? { walletNames: [...new Set(matchingNames)] } : {}),
  };
};

const formatManagedWalletContents = (data: unknown): string => {
  if (!isRecord(data)) {
    return "Managed wallet contents are unavailable.";
  }

  const walletCount = typeof data.walletCount === "number" ? data.walletCount : 0;
  const totalBalanceSol = typeof data.totalBalanceSol === "number" ? data.totalBalanceSol : 0;
  const wallets = Array.isArray(data.wallets) ? data.wallets : [];
  const tokenTotals = Array.isArray(data.tokenTotals) ? data.tokenTotals : [];

  if (walletCount === 0) {
    return "No managed wallets are configured for the active instance, so the tracked wallet total is zero.";
  }

  const walletLines = wallets.slice(0, 8).map((wallet) => {
    if (!isRecord(wallet)) {
      return null;
    }
    const walletName = typeof wallet.walletName === "string" ? wallet.walletName : "unknown";
    const walletGroup = typeof wallet.walletGroup === "string" ? wallet.walletGroup : "unknown";
    const balanceSol = typeof wallet.balanceSol === "number" ? wallet.balanceSol : 0;
    const tokenBalances = Array.isArray(wallet.tokenBalances) ? wallet.tokenBalances : [];
    const tokenSummary = tokenBalances.length === 0
      ? "no tracked tokens"
      : tokenBalances
        .slice(0, 4)
        .map((token) =>
          isRecord(token)
            ? `${typeof token.balanceUiString === "string" ? token.balanceUiString : token.balance ?? "0"} ${typeof token.mintAddress === "string" ? token.mintAddress : "unknown-mint"}`
            : null)
        .filter((entry): entry is string => entry !== null)
        .join(", ");
    return `- ${walletGroup}/${walletName}: ${balanceSol} SOL; ${tokenSummary}`;
  }).filter((entry): entry is string => entry !== null);

  const tokenLines = tokenTotals
    .slice(0, 6)
    .map((token) =>
      isRecord(token)
        ? `- ${typeof token.balanceUiString === "string" ? token.balanceUiString : token.balance ?? "0"} ${typeof token.mintAddress === "string" ? token.mintAddress : "unknown-mint"}`
        : null)
    .filter((entry): entry is string => entry !== null);

  return [
    `Managed wallets: ${walletCount}. Total native SOL: ${totalBalanceSol}.`,
    walletLines.join("\n"),
    tokenLines.length > 0 ? `Aggregate token balances:\n${tokenLines.join("\n")}` : "No non-SOL token balances are currently tracked in managed wallets.",
  ]
    .filter((section) => section.trim().length > 0)
    .join("\n\n");
};

const formatManagedWalletSolBalances = (data: unknown): string => {
  if (!isRecord(data)) {
    return "Managed SOL balances are unavailable.";
  }

  const walletCount = typeof data.walletCount === "number" ? data.walletCount : 0;
  const totalBalanceSol = typeof data.totalBalanceSol === "number" ? data.totalBalanceSol : 0;
  const wallets = Array.isArray(data.wallets) ? data.wallets : [];

  if (walletCount === 0) {
    return "No managed wallets are configured for the active instance, so the tracked SOL total is zero.";
  }

  return [
    `Managed wallets: ${walletCount}. Total native SOL: ${totalBalanceSol}.`,
    ...wallets.slice(0, 12).map((wallet) => {
      if (!isRecord(wallet)) {
        return "- unknown wallet: unavailable";
      }
      return `- ${wallet.walletGroup}/${wallet.walletName}: ${wallet.balanceSol} SOL`;
    }),
  ].join("\n");
};

const toFastPathFailureMessage = (actionName: string, result: ActionResult): string => {
  const errorMessage = result.error ?? `Action "${actionName}" failed.`;
  if (errorMessage.includes("protocol")) {
    return `${errorMessage} Fix the runtime RPC endpoint so it resolves to a concrete http/https URL, then retry the wallet query.`;
  }
  return `${errorMessage} Fix the runtime configuration or wallet scope, then retry the wallet query.`;
};

export const maybeExecuteFastPath = async (input: {
  requestMessages: UIMessage[];
  context: GatewayContext;
  lane: GatewayLane;
  userMessage?: string;
}): Promise<GatewayFastPathResult | null> => {
  if (input.lane !== "operator-chat") {
    return null;
  }

  const message = (input.userMessage?.trim() || extractLatestUserText(input.requestMessages)).trim();
  const intent = resolveWalletIntent(message);
  if (!intent) {
    return null;
  }

  const instanceId = resolveCurrentActiveInstanceIdSync();
  const scope = await resolveWalletScopeFromMessage(message, instanceId);
  const startedAt = Date.now();
  const dispatch = await input.context.dispatcher.dispatchStep(
    input.context.createActionContext({ actor: "agent" }),
    {
      actionName: intent.actionName,
      input: scope,
    },
  );
  const result = dispatch.results[0];
  if (!result) {
    return {
      actionName: intent.actionName,
      message: `Action "${intent.actionName}" returned no result.`,
      toolCalls: [intent.actionName],
      fastPathUsed: true,
      lane: input.lane,
      provider: null,
      model: null,
      executionTrace: {
        lane: input.lane,
        fastPath: intent.fastPath,
        provider: null,
        model: null,
        promptChars: 0,
        toolCount: 1,
        toolSteps: 1,
        durationMs: Date.now() - startedAt,
        failureCode: "MISSING_ACTION_RESULT",
      },
    };
  }

  if (!result.ok) {
    return {
      actionName: intent.actionName,
      message: toFastPathFailureMessage(intent.actionName, result),
      toolCalls: [intent.actionName],
      fastPathUsed: true,
      lane: input.lane,
      provider: null,
      model: null,
      executionTrace: {
        lane: input.lane,
        fastPath: intent.fastPath,
        provider: null,
        model: null,
        promptChars: 0,
        toolCount: 1,
        toolSteps: 1,
        durationMs: Date.now() - startedAt,
        failureCode: result.code,
      },
    };
  }

  const messageText = intent.actionName === "getManagedWalletSolBalances"
    ? formatManagedWalletSolBalances(result.data)
    : formatManagedWalletContents(result.data);

  return {
    actionName: intent.actionName,
    message: messageText,
    toolCalls: [intent.actionName],
    fastPathUsed: true,
    lane: input.lane,
    provider: null,
    model: null,
    executionTrace: {
      lane: input.lane,
      fastPath: intent.fastPath,
      provider: null,
      model: null,
      promptChars: 0,
      toolCount: 1,
      toolSteps: 1,
      durationMs: Date.now() - startedAt,
    },
  };
};
