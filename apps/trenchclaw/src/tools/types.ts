import type { Action, ActionCategory, ActionSubcategory } from "../ai/contracts/types/action";
import type { RuntimeSettings } from "../runtime/settings";
import type { FilesystemPolicySummary } from "../runtime/security/filesystemManifest";

export const TOOL_GROUP_IDS = [
  "runtime-queue",
  "rpc-data-fetch",
  "market-news",
  "wallet-execution",
  "workspace-cli",
  "knowledge",
] as const;

export type ToolGroupId = (typeof TOOL_GROUP_IDS)[number];
export type ToolSideEffectLevel = "read" | "write" | "execute";
export type ReleaseReadinessStatus = "shipped-now" | "limited" | "coming-soon";
export type ToolLaneVisibility = "never" | "routed" | "always";

export interface RuntimeToolVisibility {
  operatorChat: ToolLaneVisibility;
  workspaceAgent: boolean;
  backgroundSummary: boolean;
}

export interface RuntimeToolPredicateContext {
  settings: RuntimeSettings;
  filesystemPolicy: FilesystemPolicySummary;
}

export interface RuntimeToolMetadata {
  description: string;
  purpose: string;
  tags: readonly string[];
  releaseReadiness: RuntimeReleaseReadinessDescriptor;
  exampleInput?: unknown;
  routingHint?: string;
  sideEffectLevel?: ToolSideEffectLevel;
  group?: ToolGroupId;
  visibility?: Partial<RuntimeToolVisibility>;
}

export interface RuntimeReleaseReadinessDescriptor {
  status: ReleaseReadinessStatus;
  note: string;
}

export interface RuntimeComingSoonFeatureEntry extends RuntimeReleaseReadinessDescriptor {
  id: string;
  label: string;
  aliases: readonly string[];
}

export interface RuntimeActionToolDefinition extends RuntimeToolMetadata {
  kind: "action";
  action: Action<any, any>;
  includeInCatalog: (context: RuntimeToolPredicateContext) => boolean;
  enabledBySettings: (context: RuntimeToolPredicateContext) => boolean;
  requiresUserConfirmation?: boolean;
  chatExposed?: boolean;
}

export interface RuntimeWorkspaceToolDefinition extends RuntimeToolMetadata {
  kind: "workspace-tool";
  name: string;
  enabledBySettings: (context: RuntimeToolPredicateContext) => boolean;
  chatExposed?: boolean;
}

export interface RuntimeToolSnapshotBase {
  description: string;
  purpose: string;
  tags: readonly string[];
  exampleInput?: unknown;
  routingHint: string;
  sideEffectLevel: ToolSideEffectLevel;
  group: ToolGroupId;
  visibility: RuntimeToolVisibility;
  enabledNow: boolean;
  exposedToModel: boolean;
  toolDescription: string;
  releaseReadinessStatus: ReleaseReadinessStatus;
  releaseReadinessNote: string;
}

export interface RuntimeActionToolSnapshotEntry extends RuntimeToolSnapshotBase {
  kind: "action";
  name: string;
  category: ActionCategory;
  subcategory?: ActionSubcategory;
  hasInputSchema: boolean;
  hasOutputSchema: boolean;
  includedInCatalog: boolean;
  enabledBySettings: boolean;
  requiresConfirmation: boolean;
  chatExposed: boolean;
  action: Action<any, any>;
}

export interface RuntimeWorkspaceToolSnapshotEntry extends RuntimeToolSnapshotBase {
  kind: "workspace-tool";
  name: string;
  enabledBySettings: boolean;
  chatExposed: boolean;
}

export interface RuntimeModelToolSnapshotEntry {
  kind: "action" | "workspace-tool";
  name: string;
  description: string;
  purpose: string;
  routingHint: string;
  sideEffectLevel: ToolSideEffectLevel;
  group?: ToolGroupId;
  visibility?: RuntimeToolVisibility;
  enabledNow: boolean;
  requiresConfirmation: boolean;
  exampleInput?: unknown;
  toolDescription: string;
  releaseReadinessStatus: ReleaseReadinessStatus;
  releaseReadinessNote: string;
}

export interface RuntimeToolSnapshot {
  actions: RuntimeActionToolSnapshotEntry[];
  workspaceTools: RuntimeWorkspaceToolSnapshotEntry[];
  modelTools: RuntimeModelToolSnapshotEntry[];
  comingSoonFeatures: RuntimeComingSoonFeatureEntry[];
}
