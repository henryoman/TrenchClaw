import type { ActionContext } from "../contracts/context";
import type { Policy, PolicyEngineContract, PolicyResult } from "../contracts/policy";

export class PolicyEngine implements PolicyEngineContract {
  constructor(private readonly policies: Policy[] = []) {}

  async evaluatePre(ctx: ActionContext, payload?: unknown): Promise<PolicyResult[]> {
    return this.evaluateByType("pre", ctx, payload);
  }

  async evaluatePost(ctx: ActionContext, payload?: unknown): Promise<PolicyResult[]> {
    return this.evaluateByType("post", ctx, payload);
  }

  private async evaluateByType(
    type: Policy["type"],
    ctx: ActionContext,
    payload?: unknown,
  ): Promise<PolicyResult[]> {
    const selected = [...this.policies, ...(ctx.policies ?? [])].filter((policy) => policy.type === type);
    return Promise.all(selected.map(async (policy) => policy.evaluate(ctx, payload)));
  }
}
