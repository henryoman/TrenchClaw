import type {
  RuntimeApiActionToolView,
  RuntimeApiToolsResponse,
  RuntimeApiWorkspaceToolView,
} from "@trenchclaw/types";
import { getRuntimeCapabilitySnapshot } from "../../../tools";
import type { RuntimeTransportContext } from "../contracts";

const mapActionTool = (
  entry: Awaited<ReturnType<typeof getRuntimeCapabilitySnapshot>>["actions"][number],
): RuntimeApiActionToolView => ({
  kind: "action",
  name: entry.name,
  category: entry.category,
  subcategory: entry.subcategory,
  description: entry.description,
  purpose: entry.purpose,
  tags: entry.tags,
  exampleInput: entry.exampleInput,
  routingHint: entry.routingHint,
  sideEffectLevel: entry.sideEffectLevel,
  group: entry.group,
  visibility: entry.visibility,
  enabledNow: entry.enabledNow,
  exposedToModel: entry.exposedToModel,
  toolDescription: entry.toolDescription,
  releaseReadinessStatus: entry.releaseReadinessStatus,
  releaseReadinessNote: entry.releaseReadinessNote,
  hasInputSchema: entry.hasInputSchema,
  hasOutputSchema: entry.hasOutputSchema,
  includedInCatalog: entry.includedInCatalog,
  enabledBySettings: entry.enabledBySettings,
  requiresConfirmation: entry.requiresConfirmation,
  chatExposed: entry.chatExposed,
});

const mapWorkspaceTool = (
  entry: Awaited<ReturnType<typeof getRuntimeCapabilitySnapshot>>["workspaceTools"][number],
): RuntimeApiWorkspaceToolView => ({
  kind: "workspace-tool",
  name: entry.name,
  description: entry.description,
  purpose: entry.purpose,
  tags: entry.tags,
  exampleInput: entry.exampleInput,
  routingHint: entry.routingHint,
  sideEffectLevel: entry.sideEffectLevel,
  group: entry.group,
  visibility: entry.visibility,
  enabledNow: entry.enabledNow,
  exposedToModel: entry.exposedToModel,
  toolDescription: entry.toolDescription,
  releaseReadinessStatus: entry.releaseReadinessStatus,
  releaseReadinessNote: entry.releaseReadinessNote,
  enabledBySettings: entry.enabledBySettings,
  chatExposed: entry.chatExposed,
});

export const getTools = async (context: RuntimeTransportContext): Promise<RuntimeApiToolsResponse> => {
  const snapshot = await getRuntimeCapabilitySnapshot(context.runtime.settings);
  return {
    actions: snapshot.actions.map(mapActionTool),
    workspaceTools: snapshot.workspaceTools.map(mapWorkspaceTool),
    modelTools: snapshot.modelTools.map((entry) => ({
      kind: entry.kind,
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
    comingSoonFeatures: snapshot.comingSoonFeatures.map((entry) => ({
      id: entry.id,
      label: entry.label,
      aliases: entry.aliases,
      status: entry.status,
      note: entry.note,
    })),
  };
};
