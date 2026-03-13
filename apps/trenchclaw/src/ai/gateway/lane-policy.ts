import type { RuntimeCapabilitySnapshot } from "../../runtime/capabilities";
import type { GatewayLane, GatewayLanePolicy } from "./types";

const OPERATOR_ACTION_ALLOWLIST = [
  "getManagedWalletContents",
  "getManagedWalletSolBalances",
  "queryRuntimeStore",
  "queryInstanceMemory",
  "getSwapHistory",
  "searchDexscreenerPairs",
  "createWallets",
  "renameWallets",
  "createBlockchainAlert",
  "enqueueRuntimeJob",
  "manageRuntimeJob",
  "pingRuntime",
] as const;

const LANE_POLICIES: Record<GatewayLane, GatewayLanePolicy> = {
  "operator-chat": {
    lane: "operator-chat",
    maxOutputTokens: 450,
    temperature: 0.1,
    maxToolSteps: 4,
    promptKind: "operator",
    allowFastPath: true,
  },
  "workspace-agent": {
    lane: "workspace-agent",
    maxOutputTokens: 1_200,
    temperature: 0.1,
    maxToolSteps: 12,
    promptKind: "workspace",
    allowFastPath: false,
  },
  "background-summary": {
    lane: "background-summary",
    maxOutputTokens: 300,
    temperature: 0.1,
    maxToolSteps: 1,
    promptKind: "summary",
    allowFastPath: false,
  },
};

export const getGatewayLanePolicy = (lane: GatewayLane): GatewayLanePolicy => LANE_POLICIES[lane];

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

  const allowedNames = new Set(OPERATOR_ACTION_ALLOWLIST);
  return snapshot.modelTools
    .filter((toolEntry) => toolEntry.kind === "action" && allowedNames.has(toolEntry.name))
    .map((toolEntry) => toolEntry.name);
};
