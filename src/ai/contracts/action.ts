import type { ZodType } from "zod";
import type { ActionContext } from "./context";
import type { PolicyResult } from "./policy";

export type ActionCategory = "data-based" | "wallet-based";
export type ActionSubcategory = "read-only" | "swap" | "transfer" | "mint";

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier?: number;
}

export interface ActionResult<TData = unknown> {
  ok: boolean;
  data?: TData;
  error?: string;
  code?: string;
  retryable: boolean;
  txSignature?: string;
  durationMs: number;
  timestamp: number;
  idempotencyKey: string;
  decisionTrace?: string[];
}

export interface ActionStep<TInput = unknown> {
  actionName: string;
  input: TInput;
  dependsOn?: string;
  retryPolicy?: RetryPolicy;
  idempotencyKey?: string;
}

export interface Action<TInput = unknown, TOutput = unknown> {
  name: string;
  category: ActionCategory;
  subcategory?: ActionSubcategory;
  inputSchema?: ZodType<TInput>;
  outputSchema?: ZodType<TOutput>;
  precheck?: (ctx: ActionContext, input: TInput) => Promise<void>;
  execute: (ctx: ActionContext, input: TInput) => Promise<ActionResult<TOutput>>;
  postcheck?: (ctx: ActionContext, input: TInput, output: ActionResult<TOutput>) => Promise<void>;
}

export interface RegisteredAction {
  name: string;
  category: ActionCategory;
  subcategory?: ActionSubcategory;
}

export interface ActionRegistryContract {
  register<TInput, TOutput>(action: Action<TInput, TOutput>): void;
  get(name: string): Action | undefined;
  list(): RegisteredAction[];
  byCategory(category: ActionCategory): RegisteredAction[];
}

export interface DispatchResult {
  results: ActionResult[];
  policyHits: PolicyResult[];
}
