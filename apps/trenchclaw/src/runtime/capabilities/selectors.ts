import type { Action } from "../../ai/runtime/types/action";
import type { RuntimeSettings } from "../load";
import { summarizeFilesystemPolicy } from "../security/filesystem-manifest";
import { runtimeActionCapabilityDefinitions } from "./action-definitions";
import { workspaceToolCapabilityDefinitions } from "./workspace-tool-definitions";
import type {
  CapabilitySideEffectLevel,
  RuntimeActionCapabilityDefinition,
  RuntimeActionCapabilitySnapshotEntry,
  RuntimeCapabilitySnapshot,
  RuntimeModelToolSnapshotEntry,
  WorkspaceToolCapabilitySnapshotEntry,
} from "./types";

const compareByName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name);

const inferActionSideEffectLevel = (definition: RuntimeActionCapabilityDefinition): CapabilitySideEffectLevel => {
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
  definition: (typeof workspaceToolCapabilityDefinitions)[number],
): CapabilitySideEffectLevel => {
  if (definition.sideEffectLevel) {
    return definition.sideEffectLevel;
  }
  if (definition.tags.includes("write") || definition.tags.includes("edit")) {
    return "write";
  }
  return "read";
};

const toCompactJson = (value: unknown): string | null => {
  if (value === undefined) {
    return null;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const buildToolDescription = (input: {
  description: string;
  routingHint: string;
  sideEffectLevel: CapabilitySideEffectLevel;
  requiresConfirmation: boolean;
  exampleInput?: unknown;
}): string => {
  const parts = [
    input.description.trim(),
    `Prefer this when ${input.routingHint.trim().replace(/\.$/u, "")}.`,
    `Side effects: ${input.sideEffectLevel}.`,
  ];
  if (input.requiresConfirmation) {
    parts.push("This can require explicit user confirmation under the active runtime policy.");
  }
  const compactExample = toCompactJson(input.exampleInput);
  if (compactExample) {
    parts.push(`Example input: ${compactExample}`);
  }
  return parts.join(" ");
};

const toActionSnapshotEntry = async (
  definition: RuntimeActionCapabilityDefinition,
  settings: RuntimeSettings,
  filesystemPolicy: Awaited<ReturnType<typeof summarizeFilesystemPolicy>>,
): Promise<RuntimeActionCapabilitySnapshotEntry> => {
  const predicateContext = { settings, filesystemPolicy };
  const action = definition.action;
  const includedInCatalog = definition.includeInCatalog(predicateContext);
  const enabledBySettings = definition.enabledBySettings(predicateContext);
  const exposedToModel = definition.chatExposed !== false && Boolean(action.inputSchema) && includedInCatalog && enabledBySettings;
  const routingHint = (definition.routingHint ?? definition.purpose).trim();
  const sideEffectLevel = inferActionSideEffectLevel(definition);
  const requiresConfirmation = definition.requiresUserConfirmation === true;
  return {
    kind: "action",
    name: action.name,
    category: action.category,
    subcategory: action.subcategory,
    description: definition.description,
    purpose: definition.purpose,
    tags: definition.tags,
    exampleInput: definition.exampleInput,
    routingHint,
    sideEffectLevel,
    hasInputSchema: Boolean(action.inputSchema),
    hasOutputSchema: Boolean(action.outputSchema),
    includedInCatalog,
    enabledBySettings,
    enabledNow: includedInCatalog && enabledBySettings,
    requiresConfirmation,
    chatExposed: definition.chatExposed !== false,
    exposedToModel,
    toolDescription: buildToolDescription({
      description: definition.description,
      routingHint,
      sideEffectLevel,
      requiresConfirmation,
      exampleInput: definition.exampleInput,
    }),
    action,
  };
};

const toWorkspaceToolSnapshotEntry = async (
  definition: (typeof workspaceToolCapabilityDefinitions)[number],
  settings: RuntimeSettings,
  filesystemPolicy: Awaited<ReturnType<typeof summarizeFilesystemPolicy>>,
): Promise<WorkspaceToolCapabilitySnapshotEntry> => {
  const predicateContext = { settings, filesystemPolicy };
  const enabledBySettings = definition.enabledBySettings(predicateContext);
  const routingHint = (definition.routingHint ?? definition.purpose).trim();
  const sideEffectLevel = inferWorkspaceSideEffectLevel(definition);
  return {
    kind: "workspace-tool",
    name: definition.name,
    description: definition.description,
    purpose: definition.purpose,
    tags: definition.tags,
    exampleInput: definition.exampleInput,
    routingHint,
    sideEffectLevel,
    enabledBySettings,
    enabledNow: enabledBySettings,
    chatExposed: definition.chatExposed !== false,
    exposedToModel: definition.chatExposed !== false && enabledBySettings,
    toolDescription: buildToolDescription({
      description: definition.description,
      routingHint,
      sideEffectLevel,
      requiresConfirmation: false,
      exampleInput: definition.exampleInput,
    }),
  };
};

export const getRuntimeActionCapabilityDefinitions = (): readonly RuntimeActionCapabilityDefinition[] =>
  runtimeActionCapabilityDefinitions;

export const getRuntimeActionCatalog = async (settings: RuntimeSettings): Promise<Action<any, any>[]> => {
  const filesystemPolicy = await summarizeFilesystemPolicy({ actor: "agent", maxPathsPerBucket: 32 });
  return (await Promise.all(
    runtimeActionCapabilityDefinitions.map((definition) => toActionSnapshotEntry(definition, settings, filesystemPolicy)),
  ))
    .filter((entry) => entry.includedInCatalog)
    .map((entry) => entry.action);
};

export const isRuntimeActionEnabledBySettings = async (settings: RuntimeSettings, actionName: string): Promise<boolean> => {
  const definition = runtimeActionCapabilityDefinitions.find((entry) => entry.action.name === actionName);
  if (!definition) {
    return false;
  }
  const filesystemPolicy = await summarizeFilesystemPolicy({ actor: "agent", maxPathsPerBucket: 32 });
  return definition.enabledBySettings({ settings, filesystemPolicy });
};

export const getRuntimeActionsRequiringUserConfirmation = (): ReadonlySet<string> =>
  new Set(
    runtimeActionCapabilityDefinitions
      .filter((definition) => definition.requiresUserConfirmation === true)
      .map((definition) => definition.action.name),
  );

export const getRuntimeCapabilitySnapshot = async (settings: RuntimeSettings): Promise<RuntimeCapabilitySnapshot> => {
  const filesystemPolicy = await summarizeFilesystemPolicy({ actor: "agent", maxPathsPerBucket: 32 });
  const [actions, workspaceTools] = await Promise.all([
    Promise.all(runtimeActionCapabilityDefinitions.map((definition) => toActionSnapshotEntry(definition, settings, filesystemPolicy))),
    Promise.all(workspaceToolCapabilityDefinitions.map((definition) => toWorkspaceToolSnapshotEntry(definition, settings, filesystemPolicy))),
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
        enabledNow: entry.enabledNow,
        requiresConfirmation: entry.requiresConfirmation,
        exampleInput: entry.exampleInput,
        toolDescription: entry.toolDescription,
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
        enabledNow: entry.enabledNow,
        requiresConfirmation: false,
        exampleInput: entry.exampleInput,
        toolDescription: entry.toolDescription,
      })),
  ].toSorted(compareByName);

  return {
    actions: includedActions,
    workspaceTools: diagnosticsWorkspaceTools,
    modelTools,
  };
};

export const buildRuntimeChatToolNameCatalog = async (
  input:
    | RuntimeSettings
    | {
        actionNames: string[];
        workspaceToolNames: string[];
      },
): Promise<string[]> => {
  if ("actionNames" in input) {
    return [...input.actionNames, ...input.workspaceToolNames].toSorted((left, right) => left.localeCompare(right));
  }

  return (await getRuntimeCapabilitySnapshot(input)).modelTools.map((toolEntry) => toolEntry.name);
};
