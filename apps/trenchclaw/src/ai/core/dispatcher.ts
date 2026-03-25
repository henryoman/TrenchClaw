import type {
  Action,
  ActionRegistryContract,
  ActionResult,
  ActionContext,
  ActionStep,
  DispatchResult,
  IdempotencyKey,
  PolicyEngineContract,
  RetryPolicy,
  RuntimeEventBus,
  StateStore,
} from "../contracts/types";
import type { RuntimeActionThrottleContract } from "../../automation/policy/tradingThrottle";
import { createIdempotencyKey } from "../contracts/types";

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
  actionThrottle?: RuntimeActionThrottleContract;
}

export class ActionDispatcher {
  constructor(private readonly deps: ActionDispatcherDeps) {}

  async dispatchStep(ctx: ActionContext, step: ActionStep): Promise<DispatchResult> {
    const action = this.deps.registry.get(step.actionName);
    if (!action) {
      return {
        results: [
          {
            ok: false,
            retryable: false,
            code: "unsupported_action",
            error: `Action "${step.actionName}" is not supported by this runtime`,
            durationMs: 0,
            timestamp: Date.now(),
            idempotencyKey: step.idempotencyKey ?? createIdempotencyKey(),
          },
        ],
        policyHits: [],
      };
    }

    const idempotencyKey = step.idempotencyKey ?? createIdempotencyKey();
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
    const stepResults = new Map<string, ActionResult>();

    for (const [index, step] of steps.entries()) {
      if (step.dependsOn && !completed.has(step.dependsOn)) {
        throw new Error(`Step "${step.actionName}" depends on missing key "${step.dependsOn}"`);
      }

      const resolvedInput = resolveStepInput(step.input, stepResults);
      const resolvedStep: ActionStep = {
        ...step,
        input: resolvedInput,
      };

      const stepResult = await this.dispatchStep(ctx, resolvedStep);
      results.push(...stepResult.results);
      policyHits.push(...stepResult.policyHits);

      const first = stepResult.results[0];
      if (first) {
        stepResults.set(resolveStepKey(step, index), first);
      }

      if (!first?.ok && !first?.retryable) {
        break;
      }

      completed.add(resolveStepKey(step, index));
    }

    return { results, policyHits };
  }

  private async executeWithRetry(
    action: Action,
    ctx: ActionContext,
    step: ActionStep,
    idempotencyKey: IdempotencyKey,
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
        await this.deps.actionThrottle?.acquire(action.name);
        const input = validateInput(action, step.input);
        await action.precheck?.(ctx, input);
        const output = await action.execute(ctx, input);
        await action.postcheck?.(ctx, input, output);

        // Actions may return a structured failure result without throwing.
        // Treat that as a failure path (with optional retry), not success.
        if (!output.ok) {
          const durationMs = output.durationMs || Date.now() - start;
          const timestamp = output.timestamp || Date.now();
          const message = output.error || `Action "${action.name}" returned an unsuccessful result`;
          const retryable = Boolean(output.retryable);
          const canRetry = retryable && attempt < maxAttempts;

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
            retryable,
            attempts: attempt,
          });

          return {
            ...output,
            error: message,
            retryable,
            durationMs,
            timestamp,
            idempotencyKey,
          };
        }

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

function resolveStepKey(step: ActionStep, index: number): string {
  if (step.key) {
    return step.key;
  }
  if (step.idempotencyKey) {
    return step.idempotencyKey;
  }
  return `step-${index + 1}`;
}

function resolveStepInput(input: unknown, stepResults: Map<string, ActionResult>): unknown {
  if (typeof input === "string") {
    return resolveTemplateString(input, stepResults);
  }

  if (Array.isArray(input)) {
    return input.map((entry) => resolveStepInput(entry, stepResults));
  }

  if (!input || typeof input !== "object") {
    return input;
  }

  const resolvedEntries = Object.entries(input as Record<string, unknown>).map(([key, value]) => [
    key,
    resolveStepInput(value, stepResults),
  ]);

  return Object.fromEntries(resolvedEntries);
}

const FULL_TEMPLATE_PATTERN = /^\$\{steps\.([a-zA-Z0-9_-]+)\.(output|result)((?:\.[a-zA-Z0-9_-]+)*)\}$/;
const INLINE_TEMPLATE_PATTERN = /\$\{steps\.([a-zA-Z0-9_-]+)\.(output|result)((?:\.[a-zA-Z0-9_-]+)*)\}/g;

function resolveTemplateString(template: string, stepResults: Map<string, ActionResult>): unknown {
  const fullMatch = template.match(FULL_TEMPLATE_PATTERN);
  if (fullMatch) {
    const [, stepKey = "", root = "output", path = ""] = fullMatch;
    return resolveTemplateReference(stepKey, root as "output" | "result", path, stepResults);
  }

  if (!template.includes("${steps.")) {
    return template;
  }

  return template.replace(
    INLINE_TEMPLATE_PATTERN,
    (_match, stepKey: string, root: "output" | "result", path: string) => {
      const value = resolveTemplateReference(stepKey, root, path, stepResults);
      if (value === null || value === undefined) {
        return "";
      }
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
      throw new Error(
        `Template "${template}" resolved to non-primitive value for steps.${stepKey}.${root}${path || ""}`,
      );
    },
  );
}

function resolveTemplateReference(
  stepKey: string,
  root: "output" | "result",
  path: string,
  stepResults: Map<string, ActionResult>,
): unknown {
  const result = stepResults.get(stepKey);
  if (!result) {
    throw new Error(`Template reference failed: step "${stepKey}" has no prior result`);
  }

  const rootValue = root === "output" ? result.data : result;
  const segments = path.split(".").filter(Boolean);

  let current: unknown = rootValue;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || !(segment in (current as Record<string, unknown>))) {
      throw new Error(`Template reference failed: steps.${stepKey}.${root}${path} is undefined`);
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}
