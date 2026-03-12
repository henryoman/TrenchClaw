import type { Action } from "../../ai/runtime/types/action";
import type { RuntimeSettings } from "../load";
import { runtimeActionCapabilityDefinitions } from "./action-definitions";
import { workspaceToolCapabilityDefinitions } from "./workspace-tool-definitions";
import type {
  RuntimeActionCapabilityDefinition,
  RuntimeActionCapabilitySnapshotEntry,
  RuntimeCapabilitySnapshot,
  WorkspaceToolCapabilitySnapshotEntry,
} from "./types";

const compareByName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name);

const toActionSnapshotEntry = (
  definition: RuntimeActionCapabilityDefinition,
  settings: RuntimeSettings,
): RuntimeActionCapabilitySnapshotEntry => {
  const predicateContext = { settings };
  const action = definition.action;
  return {
    kind: "action",
    name: action.name,
    category: action.category,
    subcategory: action.subcategory,
    description: definition.description,
    purpose: definition.purpose,
    tags: definition.tags,
    exampleInput: definition.exampleInput,
    hasInputSchema: Boolean(action.inputSchema),
    hasOutputSchema: Boolean(action.outputSchema),
    includedInCatalog: definition.includeInCatalog(predicateContext),
    enabledBySettings: definition.enabledBySettings(predicateContext),
    requiresUserConfirmation: definition.requiresUserConfirmation === true,
    chatExposed: definition.chatExposed !== false,
    action,
  };
};

const toWorkspaceToolSnapshotEntry = (
  definition: (typeof workspaceToolCapabilityDefinitions)[number],
  settings: RuntimeSettings,
): WorkspaceToolCapabilitySnapshotEntry => ({
  kind: "workspace-tool",
  name: definition.name,
  description: definition.description,
  purpose: definition.purpose,
  tags: definition.tags,
  exampleInput: definition.exampleInput,
  enabledBySettings: definition.enabledBySettings({ settings }),
  chatExposed: definition.chatExposed !== false,
});

export const getRuntimeActionCapabilityDefinitions = (): readonly RuntimeActionCapabilityDefinition[] =>
  runtimeActionCapabilityDefinitions;

export const getRuntimeActionCatalog = (settings: RuntimeSettings): Action<any, any>[] =>
  runtimeActionCapabilityDefinitions
    .map((definition) => toActionSnapshotEntry(definition, settings))
    .filter((entry) => entry.includedInCatalog)
    .map((entry) => entry.action);

export const isRuntimeActionEnabledBySettings = (settings: RuntimeSettings, actionName: string): boolean => {
  const definition = runtimeActionCapabilityDefinitions.find((entry) => entry.action.name === actionName);
  if (!definition) {
    return false;
  }
  return definition.enabledBySettings({ settings });
};

export const getRuntimeActionsRequiringUserConfirmation = (): ReadonlySet<string> =>
  new Set(
    runtimeActionCapabilityDefinitions
      .filter((definition) => definition.requiresUserConfirmation === true)
      .map((definition) => definition.action.name),
  );

export const getRuntimeCapabilitySnapshot = (settings: RuntimeSettings): RuntimeCapabilitySnapshot => {
  const actions = runtimeActionCapabilityDefinitions
    .map((definition) => toActionSnapshotEntry(definition, settings))
    .filter((entry) => entry.includedInCatalog)
    .toSorted(compareByName);
  const workspaceTools = workspaceToolCapabilityDefinitions
    .map((definition) => toWorkspaceToolSnapshotEntry(definition, settings))
    .filter((entry) => entry.enabledBySettings || entry.chatExposed)
    .toSorted(compareByName);

  const chatTools = [
    ...actions
      .filter((entry) => entry.chatExposed && entry.hasInputSchema)
      .map((entry) => ({
        kind: "action" as const,
        name: entry.name,
        description: entry.description,
        purpose: entry.purpose,
        enabledBySettings: entry.enabledBySettings,
        requiresUserConfirmation: entry.requiresUserConfirmation,
        exampleInput: entry.exampleInput,
      })),
    ...workspaceTools
      .filter((entry) => entry.chatExposed && entry.enabledBySettings)
      .map((entry) => ({
        kind: "workspace-tool" as const,
        name: entry.name,
        description: entry.description,
        purpose: entry.purpose,
        enabledBySettings: entry.enabledBySettings,
        requiresUserConfirmation: false,
        exampleInput: entry.exampleInput,
      })),
  ].toSorted(compareByName);

  return {
    actions,
    workspaceTools,
    chatTools,
  };
};

export const buildRuntimeChatToolNameCatalog = (
  input:
    | RuntimeSettings
    | {
        actionNames: string[];
        workspaceToolsEnabled: boolean;
      },
): string[] => {
  if ("actionNames" in input) {
    const actionNames = [...input.actionNames].toSorted((left, right) => left.localeCompare(right));
    if (!input.workspaceToolsEnabled) {
      return actionNames;
    }
    return [
      ...actionNames,
      ...workspaceToolCapabilityDefinitions.map((definition) => definition.name),
    ].toSorted((left, right) => left.localeCompare(right));
  }

  return getRuntimeCapabilitySnapshot(input).chatTools.map((toolEntry) => toolEntry.name);
};
