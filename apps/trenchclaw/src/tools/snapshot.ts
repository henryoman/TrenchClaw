import type { Action } from "../ai/contracts/types/action";
import { toModelToolExampleInput } from "./model";
import {
  runtimeActionToolDefinitions,
  workspaceToolDefinitions,
} from "./registry";
import { resolveJupiterTriggerApiKey } from "../solana/lib/jupiter/trigger";
import type { RuntimeSettings } from "../runtime/settings";
import { summarizeFilesystemPolicy } from "../runtime/security/filesystemManifest";
import { getRuntimeComingSoonFeatures } from "./releaseReadiness";
import type {
  RuntimeActionToolDefinition,
  RuntimeActionToolSnapshotEntry,
  RuntimeModelToolSnapshotEntry,
  RuntimeToolVisibility,
  RuntimeToolSnapshot,
  RuntimeWorkspaceToolDefinition,
  RuntimeWorkspaceToolSnapshotEntry,
  ToolGroupId,
  ToolSideEffectLevel,
} from "./types";

const compareByName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name);

const JUPITER_TRIGGER_ACTIONS = new Set([
  "getTriggerOrders",
  "managedTriggerOrder",
  "managedTriggerCancelOrders",
]);

const OPERATOR_ALWAYS_TOOL_NAMES = new Set([
  "listKnowledgeDocs",
  "queryRuntimeStore",
  "readKnowledgeDoc",
]);

const OPERATOR_ROUTED_TOOL_NAMES = new Set([
  "getManagedWalletContents",
  "getManagedWalletSolBalances",
  "getSwapHistory",
  "getDexscreenerLatestTokenProfiles",
  "getDexscreenerLatestTokenBoosts",
  "getDexscreenerTopTokenBoosts",
  "getDexscreenerPairByChainAndPairId",
  "getDexscreenerTokenPairsByChain",
  "getDexscreenerTokensByChain",
  "getTokenLaunchTime",
  "getTokenPricePerformance",
  "getTokenHolderDistribution",
  "rankDexscreenerTopTokenBoostsByWhales",
  "searchDexscreenerPairs",
  "createWallets",
  "renameWallets",
  "transfer",
  "closeTokenAccount",
  "getTriggerOrders",
  "managedTriggerOrder",
  "managedTriggerCancelOrders",
  "managedSwap",
  "scheduleManagedSwap",
  "workspaceBash",
  "workspaceListDirectory",
  "workspaceReadFile",
]);

const isRpcDataFetchTool = (toolName: string): boolean =>
  toolName === "getManagedWalletContents"
  || toolName === "getManagedWalletSolBalances"
  || toolName === "getSwapHistory";

const isMarketNewsTool = (toolName: string): boolean =>
  toolName === "getConfiguredNewsFeeds"
  || toolName === "getWalletTracker"
  || toolName === "getCryptoNewsLatest"
  || toolName === "searchCryptoNews"
  || toolName === "getCryptoAssetSentiment"
  || toolName === "getCryptoFearGreedIndex"
  || toolName === "getCryptoTrendingTopics"
  || toolName === "getTokenLaunchTime"
  || toolName === "getTokenPricePerformance"
  || toolName === "getTokenHolderDistribution"
  || toolName === "rankDexscreenerTopTokenBoostsByWhales"
  || toolName === "downloadGeckoTerminalOhlcv"
  || toolName === "getLatestSolanaNews"
  || toolName.startsWith("getDexscreener")
  || toolName.startsWith("searchDexscreener");

const isRuntimeQueueTool = (toolName: string): boolean =>
  toolName === "queryRuntimeStore"
  || toolName === "queryInstanceMemory"
  || toolName === "mutateInstanceMemory"
  || toolName === "pingRuntime"
  || toolName === "enqueueRuntimeJob"
  || toolName === "manageRuntimeJob"
  || toolName === "submitTradingRoutine"
  || toolName === "runWakeupCheck"
  || toolName === "sleep";

const isKnowledgeTool = (toolName: string): boolean =>
  toolName === "listKnowledgeDocs" || toolName === "readKnowledgeDoc";

const isWorkspaceTool = (toolName: string): boolean =>
  toolName === "workspaceListDirectory"
  || toolName === "workspaceReadFile"
  || toolName === "workspaceWriteFile"
  || toolName === "workspaceBash";

export const resolveToolGroup = (toolName: string): ToolGroupId => {
  if (isKnowledgeTool(toolName)) {
    return "knowledge";
  }
  if (isWorkspaceTool(toolName)) {
    return "workspace-cli";
  }
  if (isRuntimeQueueTool(toolName)) {
    return "runtime-queue";
  }
  if (isMarketNewsTool(toolName)) {
    return "market-news";
  }
  if (isRpcDataFetchTool(toolName)) {
    return "rpc-data-fetch";
  }
  return "wallet-execution";
};

export const resolveToolVisibility = (toolName: string, chatExposed = true): RuntimeToolVisibility => {
  if (!chatExposed) {
    return {
      operatorChat: "never",
      workspaceAgent: false,
      backgroundSummary: false,
    };
  }

  if (OPERATOR_ALWAYS_TOOL_NAMES.has(toolName)) {
    return {
      operatorChat: "always",
      workspaceAgent: true,
      backgroundSummary: false,
    };
  }

  return {
    operatorChat: OPERATOR_ROUTED_TOOL_NAMES.has(toolName) ? "routed" : "never",
    workspaceAgent: true,
    backgroundSummary: false,
  };
};

const inferActionSideEffectLevel = (definition: RuntimeActionToolDefinition): ToolSideEffectLevel => {
  if (definition.sideEffectLevel) {
    return definition.sideEffectLevel;
  }
  if (definition.action.category === "wallet-based" && definition.action.subcategory !== "read-only") {
    return "execute";
  }
  if (definition.tags.includes("read")) {
    return "read";
  }
  if (definition.tags.includes("write") || definition.tags.includes("filesystem") || definition.tags.includes("queue")) {
    return "write";
  }
  return definition.action.category === "wallet-based" ? "execute" : "read";
};

const inferWorkspaceSideEffectLevel = (
  definition: RuntimeWorkspaceToolDefinition,
): ToolSideEffectLevel => {
  if (definition.sideEffectLevel) {
    return definition.sideEffectLevel;
  }
  if (definition.tags.includes("write") || definition.tags.includes("edit")) {
    return "write";
  }
  return "read";
};

const formatExampleInput = (value: unknown): string | null => {
  if (value === undefined) {
    return null;
  }

  try {
    const serialized = JSON.stringify(value);
    if (!serialized) {
      return null;
    }
    return serialized.length > 240 ? `${serialized.slice(0, 237)}...` : serialized;
  } catch {
    return null;
  }
};

const buildToolDescription = (input: {
  description: string;
  purpose: string;
  routingHint: string;
  sideEffectLevel: RuntimeModelToolSnapshotEntry["sideEffectLevel"];
  requiresConfirmation: boolean;
  releaseReadinessStatus: string;
  releaseReadinessNote: string;
  exampleInput?: unknown;
}): string => {
  const parts = [
    input.description.trim(),
    `Why: ${input.purpose.trim().replace(/\.$/u, "")}.`,
    `Use this when ${input.routingHint.trim().replace(/\.$/u, "")}.`,
    `Side effects: ${input.sideEffectLevel}.`,
    `Release readiness: ${input.releaseReadinessStatus}. ${input.releaseReadinessNote.trim().replace(/\.$/u, "")}.`,
  ];
  const exampleInput = formatExampleInput(input.exampleInput);
  if (exampleInput) {
    parts.push(`Example input: ${exampleInput}.`);
  }
  if (input.requiresConfirmation) {
    parts.push("This can require explicit user confirmation under the active runtime policy.");
  }
  return parts.join(" ");
};

const isModelVisible = (input: RuntimeToolVisibility): boolean =>
  input.operatorChat !== "never" || input.workspaceAgent || input.backgroundSummary;

const resolveActionMetadata = (definition: RuntimeActionToolDefinition): {
  routingHint: string;
  sideEffectLevel: ToolSideEffectLevel;
  group: ToolGroupId;
  visibility: RuntimeToolVisibility;
  chatExposed: boolean;
} => {
  const chatExposed = definition.chatExposed !== false;
  return {
    routingHint: (definition.routingHint ?? definition.purpose).trim(),
    sideEffectLevel: inferActionSideEffectLevel(definition),
    group: definition.group ?? resolveToolGroup(definition.action.name),
    visibility: {
      ...resolveToolVisibility(definition.action.name, chatExposed),
      ...definition.visibility,
    },
    chatExposed,
  };
};

const resolveWorkspaceMetadata = (definition: RuntimeWorkspaceToolDefinition): {
  routingHint: string;
  sideEffectLevel: ToolSideEffectLevel;
  group: ToolGroupId;
  visibility: RuntimeToolVisibility;
  chatExposed: boolean;
} => {
  const chatExposed = definition.chatExposed !== false;
  return {
    routingHint: (definition.routingHint ?? definition.purpose).trim(),
    sideEffectLevel: inferWorkspaceSideEffectLevel(definition),
    group: definition.group ?? resolveToolGroup(definition.name),
    visibility: {
      ...resolveToolVisibility(definition.name, chatExposed),
      ...definition.visibility,
    },
    chatExposed,
  };
};

const toActionSnapshotEntry = async (
  definition: RuntimeActionToolDefinition,
  settings: RuntimeSettings,
  filesystemPolicy: Awaited<ReturnType<typeof summarizeFilesystemPolicy>>,
): Promise<RuntimeActionToolSnapshotEntry> => {
  const predicateContext = { settings, filesystemPolicy };
  const action = definition.action;
  const metadata = resolveActionMetadata(definition);
  const includedInCatalog = definition.includeInCatalog(predicateContext);
  const enabledBySettings = definition.enabledBySettings(predicateContext);
  const runtimeReady =
    JUPITER_TRIGGER_ACTIONS.has(action.name)
      ? Boolean(await resolveJupiterTriggerApiKey())
      : true;
  const exposedToModel =
    Boolean(action.inputSchema)
    && includedInCatalog
    && enabledBySettings
    && runtimeReady
    && isModelVisible(metadata.visibility);
  return {
    kind: "action",
    name: action.name,
    category: action.category,
    subcategory: action.subcategory,
    description: definition.description,
    purpose: definition.purpose,
    tags: definition.tags,
    exampleInput: toModelToolExampleInput(action.name, definition.exampleInput),
    routingHint: metadata.routingHint,
    sideEffectLevel: metadata.sideEffectLevel,
    group: metadata.group,
    visibility: metadata.visibility,
    hasInputSchema: Boolean(action.inputSchema),
    hasOutputSchema: Boolean(action.outputSchema),
    includedInCatalog,
    enabledBySettings,
    enabledNow: includedInCatalog && enabledBySettings && runtimeReady,
    requiresConfirmation: definition.requiresUserConfirmation === true,
    chatExposed: metadata.chatExposed,
    exposedToModel,
    releaseReadinessStatus: definition.releaseReadiness.status,
    releaseReadinessNote: definition.releaseReadiness.note,
    toolDescription: buildToolDescription({
      description: definition.description,
      purpose: definition.purpose,
      routingHint: metadata.routingHint,
      sideEffectLevel: metadata.sideEffectLevel,
      requiresConfirmation: definition.requiresUserConfirmation === true,
      releaseReadinessStatus: definition.releaseReadiness.status,
      releaseReadinessNote: definition.releaseReadiness.note,
      exampleInput: toModelToolExampleInput(action.name, definition.exampleInput),
    }),
    action,
  };
};

const toWorkspaceToolSnapshotEntry = async (
  definition: RuntimeWorkspaceToolDefinition,
  settings: RuntimeSettings,
  filesystemPolicy: Awaited<ReturnType<typeof summarizeFilesystemPolicy>>,
): Promise<RuntimeWorkspaceToolSnapshotEntry> => {
  const metadata = resolveWorkspaceMetadata(definition);
  const enabledBySettings = definition.enabledBySettings({ settings, filesystemPolicy });
  const exposedToModel = enabledBySettings && isModelVisible(metadata.visibility);
  return {
    kind: "workspace-tool",
    name: definition.name,
    description: definition.description,
    purpose: definition.purpose,
    tags: definition.tags,
    exampleInput: toModelToolExampleInput(definition.name, definition.exampleInput),
    routingHint: metadata.routingHint,
    sideEffectLevel: metadata.sideEffectLevel,
    group: metadata.group,
    visibility: metadata.visibility,
    enabledBySettings,
    enabledNow: enabledBySettings,
    chatExposed: metadata.chatExposed,
    exposedToModel,
    releaseReadinessStatus: definition.releaseReadiness.status,
    releaseReadinessNote: definition.releaseReadiness.note,
    toolDescription: buildToolDescription({
      description: definition.description,
      purpose: definition.purpose,
      routingHint: metadata.routingHint,
      sideEffectLevel: metadata.sideEffectLevel,
      requiresConfirmation: false,
      releaseReadinessStatus: definition.releaseReadiness.status,
      releaseReadinessNote: definition.releaseReadiness.note,
      exampleInput: toModelToolExampleInput(definition.name, definition.exampleInput),
    }),
  };
};

export const getRuntimeActionCatalog = async (settings: RuntimeSettings): Promise<Action<any, any>[]> => {
  const filesystemPolicy = await summarizeFilesystemPolicy({ actor: "agent", maxPathsPerBucket: 32 });
  return (await Promise.all(
    runtimeActionToolDefinitions.map((definition) => toActionSnapshotEntry(definition, settings, filesystemPolicy)),
  ))
    .filter((entry) => entry.includedInCatalog)
    .map((entry) => entry.action);
};

export const isRuntimeActionEnabledBySettings = async (settings: RuntimeSettings, actionName: string): Promise<boolean> => {
  const definition = runtimeActionToolDefinitions.find((entry) => entry.action.name === actionName);
  if (!definition) {
    return false;
  }
  const filesystemPolicy = await summarizeFilesystemPolicy({ actor: "agent", maxPathsPerBucket: 32 });
  return definition.enabledBySettings({ settings, filesystemPolicy });
};

export const getRuntimeActionsRequiringUserConfirmation = (): ReadonlySet<string> =>
  new Set(
    runtimeActionToolDefinitions
      .filter((definition) => definition.requiresUserConfirmation === true)
      .map((definition) => definition.action.name),
  );

export const getRuntimeToolSnapshot = async (
  settings: RuntimeSettings,
): Promise<RuntimeToolSnapshot> => {
  const filesystemPolicy = await summarizeFilesystemPolicy({ actor: "agent", maxPathsPerBucket: 32 });
  const [actions, workspaceTools] = await Promise.all([
    Promise.all(
      runtimeActionToolDefinitions.map((definition) => toActionSnapshotEntry(definition, settings, filesystemPolicy)),
    ),
    Promise.all(
      workspaceToolDefinitions.map((definition) => toWorkspaceToolSnapshotEntry(definition, settings, filesystemPolicy)),
    ),
  ]);

  const includedActions = actions
    .filter((entry) => entry.includedInCatalog)
    .toSorted(compareByName);
  const diagnosticsWorkspaceTools = workspaceTools.toSorted(compareByName);

  const modelTools: RuntimeModelToolSnapshotEntry[] = [
    ...includedActions
      .filter((entry) => entry.exposedToModel)
      .map((entry) => ({
        kind: "action" as const,
        name: entry.name,
        description: entry.description,
        purpose: entry.purpose,
        routingHint: entry.routingHint,
        sideEffectLevel: entry.sideEffectLevel,
        group: entry.group,
        visibility: entry.visibility,
        enabledNow: entry.enabledNow,
        requiresConfirmation: entry.requiresConfirmation,
        exampleInput: entry.exampleInput,
        toolDescription: entry.toolDescription,
        releaseReadinessStatus: entry.releaseReadinessStatus,
        releaseReadinessNote: entry.releaseReadinessNote,
      })),
    ...diagnosticsWorkspaceTools
      .filter((entry) => entry.exposedToModel)
      .map((entry) => ({
        kind: "workspace-tool" as const,
        name: entry.name,
        description: entry.description,
        purpose: entry.purpose,
        routingHint: entry.routingHint,
        sideEffectLevel: entry.sideEffectLevel,
        group: entry.group,
        visibility: entry.visibility,
        enabledNow: entry.enabledNow,
        requiresConfirmation: false,
        exampleInput: entry.exampleInput,
        toolDescription: entry.toolDescription,
        releaseReadinessStatus: entry.releaseReadinessStatus,
        releaseReadinessNote: entry.releaseReadinessNote,
      })),
  ].toSorted(compareByName);

  return {
    actions: includedActions,
    workspaceTools: diagnosticsWorkspaceTools,
    modelTools,
    comingSoonFeatures: getRuntimeComingSoonFeatures(),
  };
};

export const getRuntimeCapabilitySnapshot = getRuntimeToolSnapshot;
