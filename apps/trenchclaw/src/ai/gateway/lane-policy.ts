import type { RuntimeCapabilitySnapshot } from "../../runtime/capabilities";
import type { GatewayLane, GatewayLanePolicy, GatewayLaneStatus } from "./types";

const OPERATOR_TOOL_ALLOWLIST = [
  "getManagedWalletContents",
  "getManagedWalletSolBalances",
  "listKnowledgeDocs",
  "readKnowledgeDoc",
  "queryRuntimeStore",
  "queryInstanceMemory",
  "getSwapHistory",
  "getDexscreenerLatestTokenProfiles",
  "getDexscreenerLatestTokenBoosts",
  "getDexscreenerTopTokenBoosts",
  "getDexscreenerPairByChainAndPairId",
  "getDexscreenerTokenPairsByChain",
  "getDexscreenerTokensByChain",
  "searchDexscreenerPairs",
  "createWallets",
  "renameWallets",
  "transfer",
  "closeTokenAccount",
  "getTriggerOrders",
  "managedTriggerOrder",
  "managedTriggerCancelOrders",
  "managedSwap",
  "managedUltraSwap",
  "scheduleManagedUltraSwap",
  "submitTradingRoutine",
  "workspaceBash",
  "workspaceListDirectory",
  "workspaceReadFile",
] as const;

const LANE_POLICIES: Record<GatewayLane, GatewayLanePolicy> = {
  "operator-chat": {
    lane: "operator-chat",
    promptKind: "operator",
    maxOutputTokens: 32_768,
    maxToolSteps: 4,
  },
  "workspace-agent": {
    lane: "workspace-agent",
    promptKind: "workspace",
    maxOutputTokens: 32_768,
    maxToolSteps: 4,
  },
  "background-summary": {
    lane: "background-summary",
    promptKind: "summary",
    maxOutputTokens: 8_192,
  },
};

export const getGatewayLanePolicy = (lane: GatewayLane): GatewayLanePolicy => LANE_POLICIES[lane];

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
  snapshot: RuntimeCapabilitySnapshot | undefined,
  lane: GatewayLane,
): string[] => {
  if (!snapshot) {
    return [];
  }

  if (lane === "workspace-agent") {
    return snapshot.modelTools.map((toolEntry) => toolEntry.name);
  }

  if (lane === "background-summary") {
    return [];
  }

  const allowedNames = new Set<string>(OPERATOR_TOOL_ALLOWLIST);
  return snapshot.modelTools
    .filter((toolEntry) => allowedNames.has(toolEntry.name))
    .map((toolEntry) => toolEntry.name);
};
