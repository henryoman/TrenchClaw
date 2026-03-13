import type { RuntimeCapabilitySnapshot } from "../../runtime/capabilities";
import type { GatewayLane, GatewayLanePolicy, GatewayLaneStatus } from "./types";

const OPERATOR_ACTION_ALLOWLIST = [
  "getManagedWalletContents",
  "getManagedWalletSolBalances",
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
] as const;

const LANE_POLICIES: Record<GatewayLane, GatewayLanePolicy> = {
  "operator-chat": {
    lane: "operator-chat",
    maxOutputTokens: 450,
    temperature: 0.1,
    maxToolSteps: 6,
    promptKind: "operator",
  },
  "workspace-agent": {
    lane: "workspace-agent",
    maxOutputTokens: 1_200,
    temperature: 0.1,
    maxToolSteps: 12,
    promptKind: "workspace",
  },
  "background-summary": {
    lane: "background-summary",
    maxOutputTokens: 300,
    temperature: 0.1,
    maxToolSteps: 1,
    promptKind: "summary",
  },
};

export const getGatewayLanePolicy = (lane: GatewayLane): GatewayLanePolicy => LANE_POLICIES[lane];

export const buildGatewayLaneStatuses = (input: {
  provider: string | null;
  model: string | null;
  modelAvailable: boolean;
  endpointsValid: boolean;
}): GatewayLaneStatus[] => {
  const baseStatus =
    input.provider && input.model && input.modelAvailable
      ? {
          enabled: true,
          provider: input.provider,
          model: input.model,
        }
      : input.provider && input.model
        ? {
            enabled: false,
            provider: input.provider,
            model: input.model,
            reason: "Selected model is not approved for operator chat",
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

  const allowedNames = new Set<string>(OPERATOR_ACTION_ALLOWLIST);
  return snapshot.modelTools
    .filter((toolEntry) => toolEntry.kind === "action" && allowedNames.has(toolEntry.name))
    .map((toolEntry) => toolEntry.name);
};
