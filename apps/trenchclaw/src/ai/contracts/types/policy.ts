import type { ActionContext } from "./context";

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  policyName: string;
}

export interface Policy {
  name: string;
  type: "pre" | "post";
  evaluate: (ctx: ActionContext, payload?: unknown) => Promise<PolicyResult> | PolicyResult;
}

export interface PolicyEngineContract {
  evaluatePre(ctx: ActionContext, payload?: unknown): Promise<PolicyResult[]>;
  evaluatePost(ctx: ActionContext, payload?: unknown): Promise<PolicyResult[]>;
}
