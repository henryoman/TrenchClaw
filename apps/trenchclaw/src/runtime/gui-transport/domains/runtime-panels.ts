import type {
  GuiActivityResponse,
  GuiBootstrapResponse,
  GuiQueueJobView,
  GuiQueueResponse,
} from "@trenchclaw/types";
import { resolveLlmProviderConfig } from "../../../ai/llm/config";
import { ACTIVE_JOB_STATUSES, GUI_QUEUE_INCLUDE_HISTORY } from "../constants";
import type { RuntimeGuiDomainContext } from "../contracts";

export const mapJobToView = (job: ReturnType<RuntimeGuiDomainContext["runtime"]["stateStore"]["listJobs"]>[number]): GuiQueueJobView => ({
  id: job.id,
  botId: job.botId,
  routineName: job.routineName,
  status: job.status,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  nextRunAt: typeof job.nextRunAt === "number" ? job.nextRunAt : null,
  cyclesCompleted: job.cyclesCompleted,
});

export const getBootstrap = async (context: RuntimeGuiDomainContext): Promise<GuiBootstrapResponse> => {
  const llmConfig = await resolveLlmProviderConfig();
  return {
    profile: context.runtime.settings.profile,
    llmEnabled: llmConfig !== null,
    activeInstance: context.getActiveInstance(),
    runtime: context.runtime.describe(),
  };
};

export const getQueue = (context: RuntimeGuiDomainContext): GuiQueueResponse => {
  const jobs = context.runtime.stateStore
    .listJobs()
    .toSorted((a, b) => b.updatedAt - a.updatedAt)
    .map(mapJobToView)
    .filter((job) => GUI_QUEUE_INCLUDE_HISTORY || ACTIVE_JOB_STATUSES.has(job.status));
  return { jobs };
};

export const getActivity = (context: RuntimeGuiDomainContext, limit = 100): GuiActivityResponse => {
  const normalizedLimit = Math.max(1, Math.trunc(limit));
  return {
    entries: context.getActivityEntries(normalizedLimit),
  };
};
