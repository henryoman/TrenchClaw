export type ActionCategory = "data-based" | "wallet-based";

export type ActionSubcategory = "read-only" | "swap" | "transfer" | "mint";

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier?: number;
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  policyName: string;
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

export interface ActionContext {
  wallet?: unknown;
  rpc?: unknown;
  jupiter?: unknown;
  tokenAccounts?: unknown;
  balances?: Record<string, bigint>;
  policies?: Policy[];
  jobMeta?: {
    jobId?: string;
    botId?: string;
    cycle?: number;
  };
  eventBus?: unknown;
}

export interface Policy {
  name: string;
  type: "pre" | "post";
  evaluate: (ctx: ActionContext, payload?: unknown) => Promise<PolicyResult> | PolicyResult;
}

export interface ActionStep {
  actionName: string;
  input: unknown;
  dependsOn?: string;
  retryPolicy?: RetryPolicy;
}

export interface Action<TInput = unknown, TOutput = unknown> {
  name: string;
  category: ActionCategory;
  subcategory?: ActionSubcategory;
  inputSchema?: unknown;
  outputSchema?: unknown;
  precheck?: (ctx: ActionContext, input: TInput) => Promise<void>;
  execute: (ctx: ActionContext, input: TInput) => Promise<ActionResult<TOutput>>;
  postcheck?: (ctx: ActionContext, input: TInput, output: ActionResult<TOutput>) => Promise<void>;
}

export interface BotConfig {
  id: string;
  name: string;
  routine: string;
  triggerConfig: unknown;
  policyOverrides?: Policy[];
  walletId: string;
  enabled: boolean;
}

export interface JobState {
  id: string;
  botId: string;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  nextRunAt?: number;
  lastRunAt?: number;
  lastResult?: ActionResult;
  cyclesCompleted: number;
  totalCycles?: number;
}

export type RuntimeEventName =
  | "action:start"
  | "action:success"
  | "action:fail"
  | "action:retry"
  | "bot:start"
  | "bot:pause"
  | "bot:stop"
  | "policy:block"
  | "rpc:failover";

export interface RuntimeEvent {
  type: RuntimeEventName;
  timestamp: number;
  payload?: unknown;
}

export type GuiQueueJobStatus = "pending" | "running" | "paused" | "stopped" | "failed";

export interface GuiQueueJobView {
  id: string;
  botId: string;
  routineName: string;
  status: GuiQueueJobStatus;
  createdAt: number;
  updatedAt: number;
  nextRunAt: number | null;
  cyclesCompleted: number;
}

export interface GuiBootstrapResponse {
  profile: "safe" | "dangerous" | "veryDangerous";
  llmEnabled: boolean;
  activeInstance: GuiInstanceProfileView | null;
  runtime: {
    profile: "safe" | "dangerous" | "veryDangerous";
    registeredActions: string[];
    pendingJobs: number;
    schedulerTickMs: number;
    llmEnabled: boolean;
    llmModel?: string;
    sessionId?: string;
    sessionKey?: string;
  };
}

export interface GuiQueueResponse {
  jobs: GuiQueueJobView[];
}

export interface GuiActivityEntry {
  id: string;
  source: "runtime" | "queue" | "chat";
  summary: string;
  timestamp: number;
}

export interface GuiActivityResponse {
  entries: GuiActivityEntry[];
}

export interface GuiChatRequest {
  message: string;
}

export interface GuiChatResponse {
  reply: string;
  llmEnabled: boolean;
}

export interface GuiInstanceProfileView {
  fileName: string;
  localInstanceId: string;
  name: string;
  safetyProfile: "safe" | "dangerous" | "veryDangerous";
  userPinRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GuiInstancesResponse {
  instances: GuiInstanceProfileView[];
}

export interface GuiCreateInstanceRequest {
  name: string;
  userPin?: string;
  safetyProfile?: "safe" | "dangerous" | "veryDangerous";
}

export interface GuiCreateInstanceResponse {
  instance: GuiInstanceProfileView;
}

export interface GuiSignInInstanceRequest {
  localInstanceId: string;
  userPin?: string;
}

export interface GuiSignInInstanceResponse {
  instance: GuiInstanceProfileView;
}
