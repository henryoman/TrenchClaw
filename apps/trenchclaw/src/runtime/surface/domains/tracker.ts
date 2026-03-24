import type {
  RuntimeApiTrackerResponse,
  RuntimeApiTrackerView,
  RuntimeApiUpdateTrackerRequest,
  RuntimeApiUpdateTrackerResponse,
} from "@trenchclaw/types";
import { resolveCurrentActiveInstanceIdSync } from "../../instance/state";
import {
  DEFAULT_TRACKER_REGISTRY,
  readInstanceTrackerRegistry,
  type TrackerRegistry,
  writeInstanceTrackerRegistry,
} from "../../instance/registries/tracker";
import type { RuntimeTransportContext } from "../contracts";

const cloneTracker = (tracker: TrackerRegistry): RuntimeApiTrackerView => ({
  version: tracker.version,
  trackedWallets: tracker.trackedWallets.map((wallet) => ({
    address: wallet.address,
    label: wallet.label,
    notes: wallet.notes,
    tags: [...wallet.tags],
    enabled: wallet.enabled,
  })),
  trackedTokens: tracker.trackedTokens.map((token) => ({
    mintAddress: token.mintAddress,
    symbol: token.symbol,
    label: token.label,
    notes: token.notes,
    tags: [...token.tags],
    enabled: token.enabled,
  })),
});

const cloneDefaultTracker = (): RuntimeApiTrackerView => ({
  version: 1,
  trackedWallets: DEFAULT_TRACKER_REGISTRY.trackedWallets.map((wallet) => ({
    address: wallet.address,
    label: wallet.label,
    notes: wallet.notes,
    tags: [...wallet.tags],
    enabled: wallet.enabled,
  })),
  trackedTokens: DEFAULT_TRACKER_REGISTRY.trackedTokens.map((token) => ({
    mintAddress: token.mintAddress,
    symbol: token.symbol,
    label: token.label,
    notes: token.notes,
    tags: [...token.tags],
    enabled: token.enabled,
  })),
});

export const getTracker = async (context: RuntimeTransportContext): Promise<RuntimeApiTrackerResponse> => {
  const activeInstanceId = context.getActiveInstance()?.localInstanceId ?? resolveCurrentActiveInstanceIdSync();
  if (!activeInstanceId) {
    return {
      instanceId: null,
      filePath: null,
      runtimePath: null,
      exists: false,
      tracker: cloneDefaultTracker(),
    };
  }

  const trackerState = await readInstanceTrackerRegistry(activeInstanceId);

  return {
    instanceId: activeInstanceId,
    filePath: trackerState.filePath,
    runtimePath: trackerState.runtimePath,
    exists: true,
    tracker: cloneTracker(trackerState.registry),
  };
};

export const updateTracker = async (
  context: RuntimeTransportContext,
  payload: RuntimeApiUpdateTrackerRequest,
): Promise<RuntimeApiUpdateTrackerResponse> => {
  const activeInstanceId = context.getActiveInstance()?.localInstanceId ?? resolveCurrentActiveInstanceIdSync();
  if (!activeInstanceId) {
    throw new Error("No active instance selected. Tracker is instance-scoped.");
  }

  const result = await writeInstanceTrackerRegistry(activeInstanceId, payload.tracker);

  context.addActivity(
    "runtime",
    `Tracker updated: ${result.registry.trackedWallets.length} wallets / ${result.registry.trackedTokens.length} tokens`,
  );

  return {
    instanceId: activeInstanceId,
    filePath: result.filePath,
    runtimePath: result.runtimePath,
    savedAt: new Date().toISOString(),
    tracker: cloneTracker(result.registry),
  };
};
