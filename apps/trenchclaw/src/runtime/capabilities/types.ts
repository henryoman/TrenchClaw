import type { Action, ActionCategory, ActionSubcategory } from "../../ai/runtime/types/action";
import type { RuntimeSettings } from "../load";
import type { FilesystemPolicySummary } from "../security/filesystem-manifest";

export type CapabilitySideEffectLevel = "read" | "write" | "execute";
export type ReleaseReadinessStatus = "shipped-now" | "limited" | "coming-soon";

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
