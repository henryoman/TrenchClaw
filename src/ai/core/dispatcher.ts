import type {
  Action,
  ActionRegistryContract,
  ActionResult,
  ActionStep,
  DispatchResult,
  RetryPolicy,
} from "../contracts/action";
import type { ActionContext } from "../contracts/context";
import type { PolicyEngineContract } from "../contracts/policy";
import type { StateStore } from "../contracts/state";
import type { RuntimeEventBus } from "../contracts/events";

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 1,
  backoffMs: 0,
  backoffMultiplier: 1,
};

export interface ActionDispatcherDeps {
  registry: ActionRegistryContract;
  policyEngine: PolicyEngineContract;
  stateStore: StateStore;
  eventBus: RuntimeEventBus;
}

export class ActionDispatcher {
  constructor(private readonly deps: ActionDispatcherDeps) {}

  async dispatchStep(ctx: ActionContext, step: ActionStep): Promise<DispatchResult> {
    const action = this.deps.registry.get(step.actionName);
    if (!action) {
      throw new Error(`Action "${step.actionName}" is not registered`);
    }

    const idempotencyKey = step.idempotencyKey ?? crypto.randomUUID();
    const cached = this.deps.stateStore.getReceipt(idempotencyKey);
    if (cached?.ok) {
      return { results: [cached], policyHits: [] };
    }

    const policyHits = await this.deps.policyEngine.evaluatePre(ctx, {
      actionName: step.actionName,
      input: step.input,
      idempotencyKey,
    });

    const denied = policyHits.find((hit) => !hit.allowed);
    if (denied) {
      this.deps.eventBus.emit("policy:block", {
        actionName: step.actionName,
        policyName: denied.policyName,
        reason: denied.reason ?? "blocked by policy",
      });
      return {
        results: [
          {
            ok: false,
            retryable: false,
            error: denied.reason ?? "blocked by policy",
            durationMs: 0,
            timestamp: Date.now(),
            idempotencyKey,
          },
        ],
        policyHits,
      };
    }

    const result = await this.executeWithRetry(action, ctx, step, idempotencyKey);
    this.deps.stateStore.saveReceipt(result);

    const postHits = await this.deps.policyEngine.evaluatePost(ctx, {
      actionName: step.actionName,
      input: step.input,
      result,
      idempotencyKey,
    });

    return { results: [result], policyHits: [...policyHits, ...postHits] };
  }

  async dispatchPlan(ctx: ActionContext, steps: ActionStep[]): Promise<DispatchResult> {
    const results: ActionResult[] = [];
    const policyHits = [];
    const completed = new Set<string>();

    for (const step of steps) {
      if (step.dependsOn && !completed.has(step.dependsOn)) {
        throw new Error(`Step "${step.actionName}" depends on missing key "${step.dependsOn}"`);
      }

      const stepResult = await this.dispatchStep(ctx, step);
      results.push(...stepResult.results);
      policyHits.push(...stepResult.policyHits);

      const first = stepResult.results[0];
      if (!first?.ok && !first?.retryable) {
        break;
      }

      if (first?.idempotencyKey) {
        completed.add(first.idempotencyKey);
      }
    }

    return { results, policyHits };
  }

  private async executeWithRetry(
    action: Action,
    ctx: ActionContext,
    step: ActionStep,
    idempotencyKey: string,
  ): Promise<ActionResult> {
    const retry = step.retryPolicy ?? DEFAULT_RETRY_POLICY;
    const maxAttempts = Math.max(1, retry.maxAttempts);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      this.deps.eventBus.emit("action:start", {
        actionName: action.name,
        idempotencyKey,
        inputSummary: summarizeInput(step.input),
      });

      const start = Date.now();

      try {
        const input = validateInput(action, step.input);
        await action.precheck?.(ctx, input);
        const output = await action.execute(ctx, input);
        await action.postcheck?.(ctx, input, output);

        const result: ActionResult = {
          ...output,
          durationMs: output.durationMs || Date.now() - start,
          timestamp: output.timestamp || Date.now(),
          idempotencyKey,
        };

        this.deps.eventBus.emit("action:success", {
          actionName: action.name,
          idempotencyKey,
          durationMs: result.durationMs,
          txSignature: result.txSignature,
        });

        return result;
      } catch (error) {
        const durationMs = Date.now() - start;
        const message = error instanceof Error ? error.message : String(error);
        const canRetry = attempt < maxAttempts;

        if (canRetry) {
          const nextRetryMs = computeBackoffMs(retry, attempt);
          this.deps.eventBus.emit("action:retry", {
            actionName: action.name,
            idempotencyKey,
            attempt,
            nextRetryMs,
          });
          await sleep(nextRetryMs);
          continue;
        }

        this.deps.eventBus.emit("action:fail", {
          actionName: action.name,
          idempotencyKey,
          error: message,
          retryable: false,
          attempts: attempt,
        });

        return {
          ok: false,
          retryable: false,
          error: message,
          durationMs,
          timestamp: Date.now(),
          idempotencyKey,
        };
      }
    }

    return {
      ok: false,
      retryable: false,
      error: "dispatcher failed unexpectedly",
      durationMs: 0,
      timestamp: Date.now(),
      idempotencyKey,
    };
  }
}

function validateInput(action: Action, input: unknown): unknown {
  if (!action.inputSchema) {
    return input;
  }
  return action.inputSchema.parse(input);
}

function summarizeInput(input: unknown): string {
  if (input === null || input === undefined) {
    return "empty";
  }
  if (typeof input === "string") {
    return input.slice(0, 120);
  }
  if (typeof input === "object") {
    return "object";
  }
  return String(input);
}

function computeBackoffMs(policy: RetryPolicy, attempt: number): number {
  const multiplier = policy.backoffMultiplier ?? 1;
  return Math.floor(policy.backoffMs * multiplier ** Math.max(0, attempt - 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
