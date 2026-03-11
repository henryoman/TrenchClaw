import type { RuntimeEventBus } from "./events";
import type { Policy } from "./policy";
import type { JobState, StateStore } from "./state";

export type RuntimeActor = "user" | "agent" | "system";

export interface RuntimeJobEnqueueRequest {
  botId: string;
  routineName: string;
  config?: Record<string, unknown>;
  totalCycles?: number;
  executeAtUnixMs?: number;
}

export type RuntimeJobControlOperation = "pause" | "cancel" | "resume";

export interface RuntimeJobControlRequest {
  jobId: string;
  operation: RuntimeJobControlOperation;
}

export interface JobMeta {
  jobId?: string;
  botId?: string;
  cycle?: number;
}

export interface ActionContext {
  actor?: RuntimeActor;
  wallet?: unknown;
  rpc?: unknown;
  jupiter?: unknown;
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
