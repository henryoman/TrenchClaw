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
  rpcUrl?: string;
  jupiter?: unknown;
  jupiterTrigger?: unknown;
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
  serialNumber: number | null;
  botId: string;
  routineName: string;
  status: GuiQueueJobStatus;
  createdAt: number;
  updatedAt: number;
  nextRunAt: number | null;
  cyclesCompleted: number;
}

export interface GuiScheduleJobView {
  id: string;
  serialNumber: number | null;
  botId: string;
  routineName: string;
  status: "upcoming" | "paused";
  createdAt: number;
  updatedAt: number;
  nextRunAt: number | null;
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
    bootedAt?: number;
    sessionId?: string;
    sessionKey?: string;
  };
}

export interface GuiQueueResponse {
  jobs: GuiQueueJobView[];
}

export interface GuiScheduleResponse {
  jobs: GuiScheduleJobView[];
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

export interface GuiSolPriceResponse {
  priceUsd: number | null;
  updatedAt: number | null;
}

export interface GuiConversationView {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface GuiConversationsResponse {
  conversations: GuiConversationView[];
}

export interface GuiConversationMessageView {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  parts?: Array<Record<string, unknown>>;
  createdAt: number;
}

export interface GuiConversationMessagesResponse {
  conversationId: string;
  messages: GuiConversationMessageView[];
}

export interface GuiDeleteConversationResponse {
  conversationId: string;
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

export interface GuiVaultResponse {
  filePath: string;
  templatePath: string;
  initializedFromTemplate: boolean;
  content: string;
}

export interface GuiUpdateVaultRequest {
  content: string;
}

export interface GuiUpdateVaultResponse {
  filePath: string;
  savedAt: string;
}

export interface GuiAiSettingsView {
  provider: "gateway" | "openrouter";
  model: string;
  defaultMode: string;
  temperature: number | null;
  maxOutputTokens: number | null;
}

export interface GuiAiProviderOptionView {
  id: "gateway" | "openrouter";
  label: string;
  description: string;
}

export interface GuiAiModelOptionView {
  id: string;
  label: string;
  providers: Array<"gateway" | "openrouter">;
}

export interface GuiAiSettingsResponse {
  filePath: string;
  templatePath: string;
  initializedFromTemplate: boolean;
  settings: GuiAiSettingsView;
  providerOptions: GuiAiProviderOptionView[];
  options: GuiAiModelOptionView[];
}

export interface GuiUpdateAiSettingsRequest {
  settings: GuiAiSettingsView;
}

export interface GuiUpdateAiSettingsResponse {
  filePath: string;
  savedAt: string;
  settings: GuiAiSettingsView;
  providerOptions: GuiAiProviderOptionView[];
  options: GuiAiModelOptionView[];
}

export type GuiTradingSwapProvider = "ultra" | "standard";
export type GuiTradingSwapMode = "ExactIn" | "ExactOut";
export type GuiTradingAmountUnit = "ui" | "native" | "percent";

export interface GuiTradingPresetView {
  id: string;
  label: string;
  enabled: boolean;
  amount: number | string;
  amountUnit: GuiTradingAmountUnit;
  swapProvider: GuiTradingSwapProvider;
  swapMode: GuiTradingSwapMode;
  executeTimeoutMs?: number;
}

export interface GuiTradingSettingsView {
  defaultSwapProvider: GuiTradingSwapProvider;
  defaultSwapMode: GuiTradingSwapMode;
  defaultAmountUnit: GuiTradingAmountUnit;
  scheduleActionName: string;
  quickBuyPresets: GuiTradingPresetView[];
  customPresets: GuiTradingPresetView[];
}

export interface GuiTradingSettingsResponse {
  instanceId: string | null;
  filePath: string | null;
  exists: boolean;
  settings: GuiTradingSettingsView;
}

export interface GuiUpdateTradingSettingsRequest {
  settings: GuiTradingSettingsView;
}

export interface GuiUpdateTradingSettingsResponse {
  instanceId: string;
  filePath: string;
  savedAt: string;
  settings: GuiTradingSettingsView;
}

export interface GuiWakeupSettingsView {
  intervalMinutes: number;
  prompt: string;
}

export interface GuiWakeupSettingsResponse {
  instanceId: string | null;
  filePath: string | null;
  exists: boolean;
  defaultPrompt: string;
  settings: GuiWakeupSettingsView;
}

export interface GuiUpdateWakeupSettingsRequest {
  settings: GuiWakeupSettingsView;
}

export interface GuiUpdateWakeupSettingsResponse {
  instanceId: string;
  filePath: string;
  savedAt: string;
  defaultPrompt: string;
  settings: GuiWakeupSettingsView;
}

export type GuiSecretCategory = "ai" | "blockchain";

export interface GuiSecretOptionView {
  id: string;
  category: GuiSecretCategory;
  label: string;
  vaultPath: string;
  placeholder: string;
  supportsPublicRpc: boolean;
}

export interface GuiRpcProviderOptionView {
  id: string;
  label: string;
  credentialLabel: string;
  placeholder: string;
  mode: "api-key" | "endpoint-url";
}

export interface GuiSecretEntryView {
  optionId: string;
  category: GuiSecretCategory;
  label: string;
  vaultPath: string;
  value: string;
  source: "custom" | "public";
  publicRpcId: string | null;
  rpcProviderId: string | null;
}

export interface GuiPublicRpcOptionView {
  id: string;
  label: string;
  url: string;
}

export interface GuiSecretsResponse {
  filePath: string;
  templatePath: string;
  initializedFromTemplate: boolean;
  options: GuiSecretOptionView[];
  entries: GuiSecretEntryView[];
  publicRpcOptions: GuiPublicRpcOptionView[];
  rpcProviderOptions: GuiRpcProviderOptionView[];
}

export interface GuiUpsertSecretRequest {
  optionId: string;
  value: string;
  source?: "custom" | "public";
  publicRpcId?: string | null;
  rpcProviderId?: string | null;
}

export interface GuiUpsertSecretResponse {
  filePath: string;
  savedAt: string;
  entry: GuiSecretEntryView;
}

export interface GuiDeleteSecretRequest {
  optionId: string;
}

export interface GuiDeleteSecretResponse {
  filePath: string;
  savedAt: string;
}

export interface GuiLlmCheckResponse {
  provider: string | null;
  model: string | null;
  baseURL: string | null;
  resolvedVaultFile: string | null;
  keySource: "vault" | "env" | "none";
  keyConfigured: boolean;
  keyLength: number;
  keyFingerprint: string | null;
  vaultKeyConfigured: boolean;
  vaultKeyLength: number;
  vaultKeyFingerprint: string | null;
  probeOk: boolean;
  probeStatus: number | null;
  probeMessage: string;
}

export interface GuiWalletNodeView {
  name: string;
  relativePath: string;
  kind: "directory" | "file";
  displayName?: string;
  walletName?: string;
  walletId?: string;
  address?: string;
  children?: GuiWalletNodeView[];
}

export interface GuiWalletsResponse {
  rootRelativePath: string;
  rootExists: boolean;
  nodes: GuiWalletNodeView[];
  walletFileCount: number;
}

export type RuntimeApiQueueJobStatus = GuiQueueJobStatus;
export type RuntimeApiQueueJobView = GuiQueueJobView;
export type RuntimeApiScheduleJobView = GuiScheduleJobView;
export type RuntimeApiBootstrapResponse = GuiBootstrapResponse;
export type RuntimeApiQueueResponse = GuiQueueResponse;
export type RuntimeApiScheduleResponse = GuiScheduleResponse;
export type RuntimeApiActivityEntry = GuiActivityEntry;
export type RuntimeApiActivityResponse = GuiActivityResponse;
export type RuntimeApiSolPriceResponse = GuiSolPriceResponse;
export type RuntimeApiConversationView = GuiConversationView;
export type RuntimeApiConversationsResponse = GuiConversationsResponse;
export type RuntimeApiConversationMessageView = GuiConversationMessageView;
export type RuntimeApiConversationMessagesResponse = GuiConversationMessagesResponse;
export type RuntimeApiDeleteConversationResponse = GuiDeleteConversationResponse;
export type RuntimeApiInstanceProfileView = GuiInstanceProfileView;
export type RuntimeApiInstancesResponse = GuiInstancesResponse;
export type RuntimeApiCreateInstanceRequest = GuiCreateInstanceRequest;
export type RuntimeApiCreateInstanceResponse = GuiCreateInstanceResponse;
export type RuntimeApiSignInInstanceRequest = GuiSignInInstanceRequest;
export type RuntimeApiSignInInstanceResponse = GuiSignInInstanceResponse;
export type RuntimeApiVaultResponse = GuiVaultResponse;
export type RuntimeApiUpdateVaultRequest = GuiUpdateVaultRequest;
export type RuntimeApiUpdateVaultResponse = GuiUpdateVaultResponse;
export type RuntimeApiAiSettingsView = GuiAiSettingsView;
export type RuntimeApiAiProviderOptionView = GuiAiProviderOptionView;
export type RuntimeApiAiModelOptionView = GuiAiModelOptionView;
export type RuntimeApiAiSettingsResponse = GuiAiSettingsResponse;
export type RuntimeApiUpdateAiSettingsRequest = GuiUpdateAiSettingsRequest;
export type RuntimeApiUpdateAiSettingsResponse = GuiUpdateAiSettingsResponse;
export type RuntimeApiTradingSwapProvider = GuiTradingSwapProvider;
export type RuntimeApiTradingSwapMode = GuiTradingSwapMode;
export type RuntimeApiTradingAmountUnit = GuiTradingAmountUnit;
export type RuntimeApiTradingPresetView = GuiTradingPresetView;
export type RuntimeApiTradingSettingsView = GuiTradingSettingsView;
export type RuntimeApiTradingSettingsResponse = GuiTradingSettingsResponse;
export type RuntimeApiUpdateTradingSettingsRequest = GuiUpdateTradingSettingsRequest;
export type RuntimeApiUpdateTradingSettingsResponse = GuiUpdateTradingSettingsResponse;
export type RuntimeApiWakeupSettingsView = GuiWakeupSettingsView;
export type RuntimeApiWakeupSettingsResponse = GuiWakeupSettingsResponse;
export type RuntimeApiUpdateWakeupSettingsRequest = GuiUpdateWakeupSettingsRequest;
export type RuntimeApiUpdateWakeupSettingsResponse = GuiUpdateWakeupSettingsResponse;
export type RuntimeApiSecretCategory = GuiSecretCategory;
export type RuntimeApiSecretOptionView = GuiSecretOptionView;
export type RuntimeApiRpcProviderOptionView = GuiRpcProviderOptionView;
export type RuntimeApiSecretEntryView = GuiSecretEntryView;
export type RuntimeApiPublicRpcOptionView = GuiPublicRpcOptionView;
export type RuntimeApiSecretsResponse = GuiSecretsResponse;
export type RuntimeApiUpsertSecretRequest = GuiUpsertSecretRequest;
export type RuntimeApiUpsertSecretResponse = GuiUpsertSecretResponse;
export type RuntimeApiDeleteSecretRequest = GuiDeleteSecretRequest;
export type RuntimeApiDeleteSecretResponse = GuiDeleteSecretResponse;
export type RuntimeApiLlmCheckResponse = GuiLlmCheckResponse;
export type RuntimeApiWalletNodeView = GuiWalletNodeView;
export type RuntimeApiWalletsResponse = GuiWalletsResponse;
