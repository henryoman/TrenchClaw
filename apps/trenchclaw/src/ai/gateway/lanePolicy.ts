import type {
  RuntimeToolSnapshot,
  RuntimeModelToolSnapshotEntry,
  ToolGroupId,
} from "../../tools/types";
import { resolveToolGroup, resolveToolVisibility } from "../../tools/snapshot";
import type { GatewayLane, GatewayLanePolicy, GatewayLaneStatus } from "./types";

const OPERATOR_GROUP_MATCHERS: Record<ToolGroupId, RegExp> = {
  "runtime-queue": /\b(runtime|job|jobs|queue|queued|schedule|scheduled|wakeup|sleep|memory|conversation|history)\b/iu,
  "rpc-data-fetch": /\b(wallet|wallets|balance|balances|holding|holdings|portfolio|contents|inventory|tracker|swap history)\b/iu,
  "market-news": /\b(news|headline|headlines|sentiment|trend|trending|market|markets|token|tokens|coin|coins|pair|pairs|dex|dexscreener|gecko|geckoterminal|launch|price|prices|boost|boosts|meme|memes|whale|whales|holder|holders|ohlc|ohlcv|candle|candles|candlestick|candlesticks)\b/iu,
  "wallet-execution": /\b(transfer|send|swap|buy|sell|trigger|cancel|close token|close account|rename wallet|rename wallets|create wallet|create wallets|order|orders|dca)\b/iu,
  "workspace-cli": /\b(workspace|file|files|folder|folders|directory|directories|path|paths|readme|config|configs|json|bash|shell|cli|command|commands|search|rg|grep|which|version|help)\b|(?:^|[\s"'`])(\/|\.\.?\/)/iu,
  knowledge: /\b(doc|docs|documentation|knowledge|reference|references|guide|guidance|skill|skills|how to|how do)\b/iu,
};

const LANE_POLICIES: Record<GatewayLane, GatewayLanePolicy> = {
  "operator-chat": {
    lane: "operator-chat",
    promptKind: "operator",
    maxOutputTokens: 32_768,
    maxToolSteps: 12,
  },
  "workspace-agent": {
    lane: "workspace-agent",
    promptKind: "workspace",
    maxOutputTokens: 32_768,
    maxToolSteps: 12,
  },
  "background-summary": {
    lane: "background-summary",
    promptKind: "summary",
    maxOutputTokens: 8_192,
  },
};

export const getGatewayLanePolicy = (lane: GatewayLane): GatewayLanePolicy => LANE_POLICIES[lane];

const normalizeToolNameForPromptMatch = (toolName: string): string =>
  toolName
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .toLowerCase();

const getToolGroup = (toolEntry: RuntimeModelToolSnapshotEntry): ToolGroupId => toolEntry.group ?? resolveToolGroup(toolEntry.name);
const getToolVisibility = (toolEntry: RuntimeModelToolSnapshotEntry) =>
  toolEntry.visibility ?? resolveToolVisibility(toolEntry.name);

const routeOperatorToolNamesForUserMessage = (
  snapshot: RuntimeToolSnapshot,
  userMessage: string,
): string[] => {
  const availableTools = snapshot.modelTools.filter((toolEntry) => getToolVisibility(toolEntry).operatorChat !== "never");
  const normalizedUserMessage = userMessage.trim().toLowerCase();
  if (!normalizedUserMessage) {
    return availableTools
      .filter((toolEntry) => getToolVisibility(toolEntry).operatorChat === "always")
      .map((toolEntry) => toolEntry.name);
  }

  const matchedGroups = new Set<ToolGroupId>();
  for (const [groupId, matcher] of Object.entries(OPERATOR_GROUP_MATCHERS) as [ToolGroupId, RegExp][]) {
    if (matcher.test(normalizedUserMessage)) {
      matchedGroups.add(groupId);
    }
  }

  const explicitlyNamedTools = availableTools.filter((toolEntry) =>
    normalizedUserMessage.includes(toolEntry.name.toLowerCase())
    || normalizedUserMessage.includes(normalizeToolNameForPromptMatch(toolEntry.name)));
  for (const toolEntry of explicitlyNamedTools) {
    matchedGroups.add(getToolGroup(toolEntry));
  }

  if (matchedGroups.has("wallet-execution")) {
    matchedGroups.add("rpc-data-fetch");
  }
  if (/\b(schedule|scheduled|later|routine|dca)\b/iu.test(normalizedUserMessage)) {
    matchedGroups.add("runtime-queue");
  }

  const routedTools = new Map<string, RuntimeModelToolSnapshotEntry>();
  const addTool = (toolEntry: RuntimeModelToolSnapshotEntry): void => {
    if (!routedTools.has(toolEntry.name)) {
      routedTools.set(toolEntry.name, toolEntry);
    }
  };

  for (const toolEntry of availableTools) {
    if (getToolVisibility(toolEntry).operatorChat === "always") {
      addTool(toolEntry);
    }
  }

  if (matchedGroups.size > 0) {
    for (const toolEntry of availableTools) {
      if (getToolVisibility(toolEntry).operatorChat !== "never" && matchedGroups.has(getToolGroup(toolEntry))) {
        addTool(toolEntry);
      }
    }
  }

  for (const toolEntry of explicitlyNamedTools) {
    addTool(toolEntry);
  }

  return Array.from(routedTools.keys());
};

export const buildGatewayLaneStatuses = (input: {
  provider: string | null;
  model: string | null;
  endpointsValid: boolean;
}): GatewayLaneStatus[] => {
  const baseStatus =
    input.provider && input.model
      ? {
          enabled: true,
          provider: input.provider,
          model: input.model,
        }
      : {
          enabled: false,
          provider: input.provider,
          model: input.model,
          reason: "No model provider configured",
        };

  return [
    {
      lane: "operator-chat",
      ...baseStatus,
      ...(input.endpointsValid ? {} : { enabled: false, reason: "Runtime endpoints are invalid" }),
    },
    {
      lane: "workspace-agent",
      ...baseStatus,
    },
    {
      lane: "background-summary",
      ...baseStatus,
    },
  ];
};

export const getGatewayToolNamesForLane = (
  snapshot: RuntimeToolSnapshot | undefined,
  lane: GatewayLane,
  userMessage?: string,
): string[] => {
  if (!snapshot) {
    return [];
  }

  if (lane === "workspace-agent") {
    return snapshot.modelTools
      .filter((toolEntry) => getToolVisibility(toolEntry).workspaceAgent)
      .map((toolEntry) => toolEntry.name);
  }

  if (lane === "background-summary") {
    return snapshot.modelTools
      .filter((toolEntry) => getToolVisibility(toolEntry).backgroundSummary)
      .map((toolEntry) => toolEntry.name);
  }

  if (typeof userMessage === "string") {
    return routeOperatorToolNamesForUserMessage(snapshot, userMessage);
  }

  return snapshot.modelTools
    .filter((toolEntry) => getToolVisibility(toolEntry).operatorChat !== "never")
    .map((toolEntry) => toolEntry.name);
};
