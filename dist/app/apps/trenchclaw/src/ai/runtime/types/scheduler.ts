import type { ActionContext } from "./context";
import type { ActionStep } from "./action";
import type { JobState } from "./state";

export interface BotConfig {
  id: string;
  name: string;
  routine: string;
  triggerConfig: Record<string, unknown>;
  policyOverrides?: unknown[];
  walletId: string;
  enabled: boolean;
}

export type RoutinePlanner = (ctx: ActionContext, job: JobState) => Promise<ActionStep[]>;
