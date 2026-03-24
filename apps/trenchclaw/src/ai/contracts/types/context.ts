import type { RuntimeEventBus } from "./events";
import type { BotId, JobId } from "./ids";
import type { Policy } from "./policy";
import type { JobState, StateStore } from "./state";
import type { LlmClient } from "../../llm/types";

export type RuntimeActor = "user" | "agent" | "system";

export interface RuntimeJobEnqueueRequest {
  botId: BotId;
  routineName: string;
  config?: Record<string, unknown>;
  totalCycles?: number;
  executeAtUnixMs?: number;
}

export type RuntimeJobControlOperation = "pause" | "cancel" | "resume";

export interface RuntimeJobControlRequest {
  jobId: JobId;
  operation: RuntimeJobControlOperation;
}

export interface JobMeta {
  jobId?: JobId;
  botId?: BotId;
  routineName?: string;
  cycle?: number;
}

export interface ActionContext {
  actor?: RuntimeActor;
  wallet?: unknown;
  rpc?: unknown;
  rpcUrl?: string;
  jupiter?: unknown;
  jupiterTrigger?: unknown;
  jupiterUltra?: unknown;
  tokenAccounts?: unknown;
  ultraSigner?: {
    address?: string;
    signBase64Transaction: (base64Transaction: string) => Promise<string>;
  };
  balances?: Record<string, bigint>;
  policies?: Policy[];
  jobMeta?: JobMeta;
  eventBus?: RuntimeEventBus;
  stateStore?: StateStore;
  llm?: LlmClient | null;
  enqueueJob?: (input: RuntimeJobEnqueueRequest) => Promise<JobState>;
  manageJob?: (input: RuntimeJobControlRequest) => Promise<JobState>;
}

export interface CreateActionContextConfig extends ActionContext {}

export function createActionContext(config: CreateActionContextConfig = {}): ActionContext {
  return {
    actor: config.actor ?? "system",
    ...config,
    balances: config.balances ?? {},
    policies: config.policies ?? [],
  };
}
