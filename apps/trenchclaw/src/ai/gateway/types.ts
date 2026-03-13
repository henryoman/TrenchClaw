import type { LanguageModel, UIMessage } from "ai";
import type { RuntimeCapabilitySnapshot } from "../../runtime/capabilities";
import type { RuntimeSettings } from "../../runtime/load";
import type { ResolvedRuntimeEndpoints } from "../../runtime/load";
import type { ActionDispatcher, ActionRegistry, RuntimeEventBus, StateStore } from "../index";
import type { CreateActionContextConfig } from "../runtime/types/context";
import type { RuntimeLogger } from "../../runtime/logging/runtime-logger";

export type GatewayLane = "operator-chat" | "workspace-agent" | "background-summary";

export interface GatewayExecutionTrace {
  lane: GatewayLane;
  fastPath: string | null;
  provider: string | null;
  model: string | null;
  promptChars: number;
  toolCount: number;
  toolSteps: number;
  durationMs: number;
  failureCode?: string;
}

export interface GatewayRequest {
  lane?: GatewayLane;
  messages: UIMessage[];
  userMessage: string;
  sessionId?: string;
  instanceId?: string;
  intentHints?: string[];
  allowFastPath?: boolean;
  abortSignal?: AbortSignal;
}

export interface GatewayResponse {
  message: string;
  toolCalls: string[];
  fastPathUsed: boolean;
  lane: GatewayLane;
  provider: string | null;
  model: string | null;
  executionTrace: GatewayExecutionTrace;
}

export interface GatewayFastPathResult extends GatewayResponse {
  actionName: string;
}

export interface GatewayLanePolicy {
  lane: GatewayLane;
  maxOutputTokens: number;
  temperature?: number;
  maxToolSteps: number;
  promptKind: "operator" | "workspace" | "summary";
  allowFastPath: boolean;
}

export interface GatewayLaneStatus {
  lane: GatewayLane;
  enabled: boolean;
  provider: string | null;
  model: string | null;
  reason?: string;
}

export interface GatewayPreparedDirectExecution {
  kind: "direct";
  lane: GatewayLane;
  response: GatewayResponse;
}

export interface GatewayPreparedModelExecution {
  kind: "llm";
  lane: GatewayLane;
  provider: string | null;
  modelId: string | null;
  model: LanguageModel;
  systemPrompt: string;
  toolNames: string[];
  maxOutputTokens: number;
  temperature?: number;
  maxToolSteps: number;
  executionTrace: GatewayExecutionTrace;
}

export type GatewayPreparedExecution = GatewayPreparedDirectExecution | GatewayPreparedModelExecution;

export interface GatewayContext {
  settings: RuntimeSettings;
  endpoints: ResolvedRuntimeEndpoints;
  capabilitySnapshot?: RuntimeCapabilitySnapshot;
  dispatcher: ActionDispatcher;
  registry: ActionRegistry;
  eventBus: RuntimeEventBus;
  stateStore: StateStore;
  resolvedModel: {
    provider: string | null;
    model: string | null;
    languageModel: LanguageModel | null;
  };
  logger?: RuntimeLogger;
  workspaceRootDirectory?: string;
  createActionContext: (overrides?: CreateActionContextConfig) => ReturnType<typeof import("../runtime/types/context").createActionContext>;
}

export interface RuntimeGateway {
  prepareChatExecution: (request: GatewayRequest) => Promise<GatewayPreparedExecution>;
  listToolNames: (lane?: GatewayLane) => string[];
  describe: () => {
    lanes: GatewayLaneStatus[];
  };
}
