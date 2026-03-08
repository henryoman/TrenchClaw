import type { Action, ActionCategory, ActionSubcategory } from "../../ai/runtime/types/action";
import type { RuntimeSettings } from "../load";

export interface RuntimeCapabilityPredicateContext {
  settings: RuntimeSettings;
}

export interface RuntimeActionCapabilityDefinition {
  kind: "action";
  action: Action<any, any>;
  description: string;
  purpose: string;
  tags: readonly string[];
  exampleInput?: unknown;
  includeInCatalog: (context: RuntimeCapabilityPredicateContext) => boolean;
  enabledBySettings: (context: RuntimeCapabilityPredicateContext) => boolean;
  requiresUserConfirmation?: boolean;
  chatExposed?: boolean;
}

export interface WorkspaceToolCapabilityDefinition {
  kind: "workspace-tool";
  name: string;
  description: string;
  purpose: string;
  tags: readonly string[];
  exampleInput?: unknown;
  enabledBySettings: (context: RuntimeCapabilityPredicateContext) => boolean;
  chatExposed?: boolean;
}

export interface RuntimeActionCapabilitySnapshotEntry {
  kind: "action";
  name: string;
  category: ActionCategory;
  subcategory?: ActionSubcategory;
  description: string;
  purpose: string;
  tags: readonly string[];
  exampleInput?: unknown;
  hasInputSchema: boolean;
  hasOutputSchema: boolean;
  includedInCatalog: boolean;
  enabledBySettings: boolean;
  requiresUserConfirmation: boolean;
  chatExposed: boolean;
  action: Action<any, any>;
}

export interface WorkspaceToolCapabilitySnapshotEntry {
  kind: "workspace-tool";
  name: string;
  description: string;
  purpose: string;
  tags: readonly string[];
  exampleInput?: unknown;
  enabledBySettings: boolean;
  chatExposed: boolean;
}

export interface RuntimeChatToolSnapshotEntry {
  kind: "action" | "workspace-tool";
  name: string;
  description: string;
  purpose: string;
  enabledBySettings: boolean;
  requiresUserConfirmation: boolean;
  exampleInput?: unknown;
}

export interface RuntimeCapabilitySnapshot {
  actions: RuntimeActionCapabilitySnapshotEntry[];
  workspaceTools: WorkspaceToolCapabilitySnapshotEntry[];
  chatTools: RuntimeChatToolSnapshotEntry[];
}
