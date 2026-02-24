import type { RuntimeEventBus } from "./events";
import type { Policy } from "./policy";
import type { StateStore } from "./state";

export type RuntimeActor = "user" | "agent" | "system";

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
