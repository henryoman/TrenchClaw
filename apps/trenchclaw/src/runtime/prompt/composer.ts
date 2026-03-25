import type { StateStore } from "../../ai/contracts/types/state";
import { renderKnowledgePromptSummary } from "../../ai/brain/knowledgeIndex";
import type { RuntimeCapabilitySnapshot } from "../../tools";
import { renderLiveRuntimeContextSection } from "./liveContext";
import {
  renderAsyncToolBehaviorSection,
  renderCommandMenuSection,
  renderWorkspaceDirectoryMapSection,
} from "./toolMenu";

export type PromptToolEntry = RuntimeCapabilitySnapshot["modelTools"][number];

export interface RuntimePromptSections {
  commandMenuSection: string;
  asyncToolBehaviorSection: string;
  workspaceDirectoryMapSection: string;
  liveRuntimeContext: string;
  knowledgeSummary: string;
}

export const loadRuntimePromptSections = async (input: {
  toolEntries: PromptToolEntry[];
  stateStore?: StateStore;
  commandMenuTitle?: string;
  includeWorkspaceDirectoryMap?: boolean;
}): Promise<RuntimePromptSections> => {
  const [liveRuntimeContext, knowledgeSummary] = await Promise.all([
    renderLiveRuntimeContextSection({ stateStore: input.stateStore }),
    renderKnowledgePromptSummary(),
  ]);

  return {
    commandMenuSection: renderCommandMenuSection(input.toolEntries, input.commandMenuTitle),
    asyncToolBehaviorSection: renderAsyncToolBehaviorSection(input.toolEntries),
    workspaceDirectoryMapSection: input.includeWorkspaceDirectoryMap ? renderWorkspaceDirectoryMapSection() : "",
    liveRuntimeContext,
    knowledgeSummary,
  };
};
