import type { LanguageModel, UIMessage } from "ai";
import type { RuntimeCapabilitySnapshot } from "../capabilities";
import type { RuntimeLogger } from "../logging/runtime-logger";
import type { RuntimeGateway } from "../../ai/gateway";
import type { GatewayLane } from "../../ai/gateway";
import type {
  ActionDispatcher,
  ActionRegistry,
  RuntimeEventBus,
  StateStore,
} from "../../ai";
import type {
  RuntimeJobControlRequest,
  RuntimeJobEnqueueRequest,
} from "../../ai/contracts/types/context";
import type { convertToModelMessages, generateText, streamText } from "ai";

export interface RuntimeChatService {
  listToolNames: (lane?: GatewayLane) => string[];
  stream: (
    messages: UIMessage[],
    input?: {
      headers?: HeadersInit;
      chatId?: string;
      sessionId?: string;
      conversationTitle?: string;
      lane?: GatewayLane;
      abortSignal?: AbortSignal;
    },
  ) => Promise<Response>;
}

export interface RuntimeChatServiceDeps {
  dispatcher: ActionDispatcher;
  registry: ActionRegistry;
  eventBus: RuntimeEventBus;
  stateStore: StateStore;
  rpcUrl?: string;
  jupiter?: unknown;
  jupiterTrigger?: unknown;
  jupiterUltra?: unknown;
  tokenAccounts?: unknown;
  ultraSigner?: {
    address?: string;
    signBase64Transaction: (base64Transaction: string) => Promise<string>;
  };
  enqueueJob?: (input: RuntimeJobEnqueueRequest) => Promise<import("../../ai").JobState>;
  manageJob?: (input: RuntimeJobControlRequest) => Promise<import("../../ai").JobState>;
  logger?: RuntimeLogger;
  capabilitySnapshot?: RuntimeCapabilitySnapshot;
  workspaceRootDirectory?: string;
  gateway: RuntimeGateway;
}

export interface RuntimeChatServiceOverrides {
  convertToModelMessages?: typeof convertToModelMessages;
  streamText?: typeof streamText;
  generateText?: typeof generateText;
}

export interface PreparedChatExecution {
  model: LanguageModel;
  systemPrompt: string;
  toolNames: string[];
  maxOutputTokens?: number;
  temperature?: number;
  maxToolSteps?: number;
  provider: string | null;
  modelId: string | null;
  lane: GatewayLane;
}
