import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createGateway,
  stepCountIs,
  streamText,
  tool,
  type LanguageModel,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { createActionContext } from "../ai/runtime/types/context";
import type {
  ActionDispatcher,
  ActionRegistry,
  RuntimeEventBus,
  StateStore,
  LlmClient,
  LlmGenerateInput,
  LlmGenerateResult,
} from "../ai";
import { resolveLlmProviderConfigFromEnv } from "../ai/llm/config";

export interface RuntimeChatService {
  listToolNames: () => string[];
  generateText: (input: LlmGenerateInput) => Promise<LlmGenerateResult>;
  stream: (messages: UIMessage[], input?: { headers?: HeadersInit }) => Promise<Response>;
}

interface RuntimeChatServiceDeps {
  dispatcher: ActionDispatcher;
  registry: ActionRegistry;
  eventBus: RuntimeEventBus;
  stateStore: StateStore;
  llm: LlmClient | null;
}

interface RuntimeChatServiceOverrides {
  resolveStreamingModel?: () => LanguageModel;
  convertToModelMessages?: typeof convertToModelMessages;
  streamText?: typeof streamText;
}

const trimOrUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const resolveStreamingModel = (): LanguageModel => {
  const gatewayApiKey = trimOrUndefined(process.env.AI_GATEWAY_API_KEY);
  if (gatewayApiKey) {
    const gateway = createGateway({ apiKey: gatewayApiKey });
    return gateway(trimOrUndefined(process.env.TRENCHCLAW_AI_MODEL) ?? "anthropic/claude-sonnet-4.5");
  }

  const llmConfig = resolveLlmProviderConfigFromEnv();
  if (!llmConfig) {
    throw new Error("No model provider configured. Set AI_GATEWAY_API_KEY or TRENCHCLAW_* provider env vars.");
  }

  const openai = createOpenAI({
    apiKey: llmConfig.apiKey,
    baseURL: llmConfig.baseURL,
  });
  return openai.responses(llmConfig.model);
};

const buildSystemPrompt = (deps: RuntimeChatServiceDeps, toolNames: string[]): string => {
  const base = deps.llm?.defaultSystemPrompt ?? "You are TrenchClaw's runtime assistant.";
  const toolCatalog = toolNames.length > 0 ? toolNames.join(", ") : "none";
  return [
    base,
    "Use tools for real execution. Do not claim execution unless a tool call confirms success.",
    `Available runtime tools: ${toolCatalog}`,
  ].join("\n\n");
};

const toToolDescription = (actionName: string, category: string, subcategory?: string): string =>
  `Dispatch runtime action "${actionName}" (${category}${subcategory ? `/${subcategory}` : ""}).`;

const buildTools = (deps: RuntimeChatServiceDeps): Record<string, any> => {
  const tools: Record<string, any> = {};

  for (const registered of deps.registry.list()) {
    const action = deps.registry.get(registered.name);
    if (!action || !action.inputSchema) {
      continue;
    }

    tools[action.name] = tool({
      description: toToolDescription(action.name, action.category, action.subcategory),
      inputSchema: action.inputSchema as z.ZodTypeAny,
      execute: async (rawInput: unknown) => {
        const dispatchResult = await deps.dispatcher.dispatchStep(
          createActionContext({
            actor: "user",
            eventBus: deps.eventBus,
            stateStore: deps.stateStore,
          }),
          {
            actionName: action.name,
            input: rawInput,
          },
        );

        const result = dispatchResult.results[0];
        if (!result) {
          return {
            ok: false,
            error: `Action "${action.name}" returned no dispatcher result`,
            retryable: false,
            policyHits: dispatchResult.policyHits,
          };
        }

        return {
          ok: result.ok,
          error: result.error ?? null,
          retryable: result.retryable,
          txSignature: result.txSignature ?? null,
          idempotencyKey: result.idempotencyKey,
          data: result.data ?? null,
          policyHits: dispatchResult.policyHits,
        };
      },
    });
  }

  return tools;
};

export const createRuntimeChatService = (
  deps: RuntimeChatServiceDeps,
  overrides: RuntimeChatServiceOverrides = {},
): RuntimeChatService => {
  const resolveModel = overrides.resolveStreamingModel ?? resolveStreamingModel;
  const convertMessages = overrides.convertToModelMessages ?? convertToModelMessages;
  const streamWithModel = overrides.streamText ?? streamText;

  const listToolNames = (): string[] =>
    deps.registry
      .list()
      .filter((entry) => Boolean(deps.registry.get(entry.name)?.inputSchema))
      .map((entry) => entry.name)
      .toSorted((a, b) => a.localeCompare(b));

  const generateText = async (input: LlmGenerateInput): Promise<LlmGenerateResult> => {
    if (!deps.llm) {
      return {
        text: "LLM is not configured. Set provider credentials to enable live chat responses.",
        finishReason: "llm-disabled",
      };
    }

    return deps.llm.generate(input);
  };

  const stream = async (messages: UIMessage[], input?: { headers?: HeadersInit }): Promise<Response> => {
    const model = resolveModel();
    const toolNames = listToolNames();
    const tools = buildTools(deps);
    const result = streamWithModel({
      model,
      system: buildSystemPrompt(deps, toolNames),
      messages: await convertMessages(messages),
      stopWhen: stepCountIs(8),
      tools,
    });

    return result.toUIMessageStreamResponse({
      headers: input?.headers,
    });
  };

  return {
    listToolNames,
    generateText,
    stream,
  };
};
