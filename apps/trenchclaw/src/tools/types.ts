import type { Action, ActionCategory, ActionSubcategory } from "../ai/contracts/types/action";
import type { RuntimeSettings } from "../runtime/settings";
import type { FilesystemPolicySummary } from "../runtime/security/filesystem-manifest";

export const TOOL_GROUP_IDS = [
  "runtime-queue",
  "rpc-data-fetch",
  "market-news",
  "wallet-execution",
  "workspace-cli",
  "knowledge",
] as const;

export type ToolGroupId = (typeof TOOL_GROUP_IDS)[number];
export type CapabilitySideEffectLevel = "read" | "write" | "execute";
export type ReleaseReadinessStatus = "shipped-now" | "limited" | "coming-soon";
export type ToolLaneVisibility = "never" | "routed" | "always";

export interface RuntimeToolVisibility {
  operatorChat: ToolLaneVisibility;
  workspaceAgent: boolean;
  backgroundSummary: boolean;
}

export interface RuntimeCapabilityPredicateContext {
  settings: RuntimeSettings;
  filesystemPolicy: FilesystemPolicySummary;
}

export interface RuntimeCapabilityMetadata {
  description: string;
  purpose: string;
  tags: readonly string[];
  releaseReadiness: RuntimeReleaseReadinessDescriptor;
  exampleInput?: unknown;
  routingHint?: string;
  sideEffectLevel?: CapabilitySideEffectLevel;
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

export interface RuntimeActionCapabilityDefinition extends RuntimeCapabilityMetadata {
  kind: "action";
  action: Action<any, any>;
  includeInCatalog: (context: RuntimeCapabilityPredicateContext) => boolean;
  enabledBySettings: (context: RuntimeCapabilityPredicateContext) => boolean;
  requiresUserConfirmation?: boolean;
  chatExposed?: boolean;
}

export interface WorkspaceToolCapabilityDefinition extends RuntimeCapabilityMetadata {
  kind: "workspace-tool";
  name: string;
  enabledBySettings: (context: RuntimeCapabilityPredicateContext) => boolean;
  chatExposed?: boolean;
}

export interface RuntimeCapabilitySnapshotBase {
  description: string;
  purpose: string;
  tags: readonly string[];
  exampleInput?: unknown;
  routingHint: string;
  sideEffectLevel: CapabilitySideEffectLevel;
  group: ToolGroupId;
  visibility: RuntimeToolVisibility;
  enabledNow: boolean;
  exposedToModel: boolean;
  toolDescription: string;
  releaseReadinessStatus: ReleaseReadinessStatus;
  releaseReadinessNote: string;
}

export interface RuntimeActionCapabilitySnapshotEntry extends RuntimeCapabilitySnapshotBase {
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

export interface WorkspaceToolCapabilitySnapshotEntry extends RuntimeCapabilitySnapshotBase {
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
  sideEffectLevel: CapabilitySideEffectLevel;
  group?: ToolGroupId;
  visibility?: RuntimeToolVisibility;
  enabledNow: boolean;
  requiresConfirmation: boolean;
  exampleInput?: unknown;
  toolDescription: string;
  releaseReadinessStatus: ReleaseReadinessStatus;
  releaseReadinessNote: string;
}

export interface RuntimeCapabilitySnapshot {
  actions: RuntimeActionCapabilitySnapshotEntry[];
  workspaceTools: WorkspaceToolCapabilitySnapshotEntry[];
  modelTools: RuntimeModelToolSnapshotEntry[];
  comingSoonFeatures: RuntimeComingSoonFeatureEntry[];
}
