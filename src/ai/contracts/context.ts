import type { RuntimeEventBus } from "./events";
import type { Policy } from "./policy";

export interface JobMeta {
  jobId?: string;
  botId?: string;
  cycle?: number;
}

export interface ActionContext {
  wallet?: unknown;
  rpc?: unknown;
  jupiter?: unknown;
  tokenAccounts?: unknown;
  balances?: Record<string, bigint>;
  policies?: Policy[];
  jobMeta?: JobMeta;
  eventBus?: RuntimeEventBus;
}

export interface CreateActionContextConfig extends ActionContext {}

export function createActionContext(config: CreateActionContextConfig = {}): ActionContext {
  return {
    ...config,
    balances: config.balances ?? {},
    policies: config.policies ?? [],
  };
}
