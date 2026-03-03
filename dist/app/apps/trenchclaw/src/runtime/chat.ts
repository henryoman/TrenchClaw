import { createOpenAI } from "@ai-sdk/openai";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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
import { buildRuntimeChatToolNameCatalog } from "../ai/tools";
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
import { resolveGatewayConfig, resolveLlmProviderConfig } from "../ai/llm/config";
import {
  createWorkspaceBashTools,
} from "./workspace-bash";
import { buildFilesystemPolicyPrompt } from "./security/filesystem-manifest";
import type { RuntimeLogger } from "./logging";

export interface RuntimeChatService {
  listToolNames: () => string[];
  generateText: (input: LlmGenerateInput) => Promise<LlmGenerateResult>;
  stream: (
    messages: UIMessage[],
    input?: { headers?: HeadersInit; chatId?: string; sessionId?: string; conversationTitle?: string },
  ) => Promise<Response>;
}

interface RuntimeChatServiceDeps {
  dispatcher: ActionDispatcher;
  registry: ActionRegistry;
  eventBus: RuntimeEventBus;
  stateStore: StateStore;
  llm: LlmClient | null;
  logger?: RuntimeLogger;
  workspaceToolsEnabled?: boolean;
  workspaceRootDirectory?: string;
}

interface RuntimeChatServiceOverrides {
  resolveStreamingModel?: () => LanguageModel | Promise<LanguageModel>;
  convertToModelMessages?: typeof convertToModelMessages;
  streamText?: typeof streamText;
}

const resolveStreamingModel = async (): Promise<LanguageModel> => {
  const llmConfig = await resolveLlmProviderConfig();
  if (llmConfig) {
    const openai = createOpenAI({
      apiKey: llmConfig.apiKey,
      baseURL: llmConfig.baseURL,
    });
    const baseURL = llmConfig.baseURL?.toLowerCase() ?? "";
    const useChatApi = llmConfig.provider === "openrouter" || baseURL.includes("openrouter.ai");
    return useChatApi ? openai.chat(llmConfig.model) : openai.responses(llmConfig.model);
  }

  const gatewayConfig = await resolveGatewayConfig();
  if (gatewayConfig) {
    const gateway = createGateway({ apiKey: gatewayConfig.apiKey });
    return gateway(gatewayConfig.model);
  }

  throw new Error("No model provider configured. Set vault llm api keys or TRENCHCLAW_* provider env vars.");
};

const buildSystemPrompt = async (deps: RuntimeChatServiceDeps, toolNames: string[]): Promise<string> => {
  const base = deps.llm?.defaultSystemPrompt ?? "You are TrenchClaw's runtime assistant.";
  const toolCatalog = toolNames.length > 0 ? toolNames.join(", ") : "none";
  let filesystemPolicy = "Filesystem policy is enforced server-side; if a path is blocked, ask for an allowed target path.";
  try {
    filesystemPolicy = await buildFilesystemPolicyPrompt({ actor: "agent" });
  } catch {
    // Keep runtime chat available even if manifest cannot be loaded.
  }
  const generatedCatalogs = await loadGeneratedContextCatalogs();
  return [
    base,
    "Use tools for real execution. Do not claim execution unless a tool call confirms success.",
    "Always return at least one non-empty plain-text assistant response. Never end with reasoning-only output.",
    "For data-heavy questions, use multi-step retrieval: query/search first, inspect results, then follow-up tool calls.",
    `Available runtime tools: ${toolCatalog}`,
    filesystemPolicy,
    generatedCatalogs,
  ].join("\n\n");
};

const toToolDescription = (actionName: string, category: string, subcategory?: string): string =>
  `Dispatch runtime action "${actionName}" (${category}${subcategory ? `/${subcategory}` : ""}).`;

const DEFAULT_WORKSPACE_ROOT_DIRECTORY = fileURLToPath(new URL("../ai/brain/workspace", import.meta.url));
const GENERATED_CONTEXT_SNAPSHOT_FILE = fileURLToPath(
  new URL("../ai/brain/protected/context/workspace-and-schema.md", import.meta.url),
);
const DEFAULT_CHAT_ID_PREFIX = "chat";
const DEFAULT_CHAT_MAX_OUTPUT_TOKENS = 1200;

const trimOrUndefinedValue = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const extractUiMessageText = (message: UIMessage): string => {
  const text = message.parts
    .map((part) => {
      if (part.type === "text") {
        return part.text.trim();
      }
      if ("errorText" in part && typeof part.errorText === "string") {
        return `Runtime error: ${part.errorText}`.trim();
      }
      return "";
    })
    .filter((part) => part.length > 0)
    .join("\n");

  if (text.length > 0) {
    return text;
  }

  return "";
};

const normalizeUiMessages = (messages: UIMessage[]): UIMessage[] => {
  const normalized: UIMessage[] = [];

  for (const message of messages) {
    const sourceRole = message.role;
    if (sourceRole !== "system" && sourceRole !== "user" && sourceRole !== "assistant") {
      continue;
    }

    const normalizedParts = message.parts.filter(
      (part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
        part.type === "text" && (part.text ?? "").trim().length > 0,
    );

    if (normalizedParts.length === 0) {
      continue;
    }

    normalized.push({
      id: trimOrUndefinedValue(message.id) ?? `msg-${crypto.randomUUID()}`,
      role: sourceRole,
      parts: normalizedParts,
    });
  }

  return normalized;
};

const sanitizeConversationTitle = (title: string | undefined, fallbackMessages: UIMessage[]): string | undefined => {
  const explicit = trimOrUndefinedValue(title);
  if (explicit) {
    return explicit.slice(0, 120);
  }

  const firstUserText = fallbackMessages
    .filter((message) => message.role === "user")
    .map((message) => extractUiMessageText(message))
    .find((text) => text.length > 0);
  if (!firstUserText) {
    return undefined;
  }
  return firstUserText.slice(0, 120);
};

const resolveChatId = (chatId: string | undefined): string =>
  trimOrUndefinedValue(chatId) ?? `${DEFAULT_CHAT_ID_PREFIX}-${crypto.randomUUID()}`;

const resolveChatMaxOutputTokens = (): number => {
  const raw = trimOrUndefinedValue(process.env.TRENCHCLAW_CHAT_MAX_OUTPUT_TOKENS);
  if (!raw) {
    return DEFAULT_CHAT_MAX_OUTPUT_TOKENS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return DEFAULT_CHAT_MAX_OUTPUT_TOKENS;
  }
  return parsed;
};

const withChatHeaders = (headers: HeadersInit | undefined, chatId: string): Headers => {
  const merged = new Headers(headers);
  merged.set("x-trenchclaw-chat-id", chatId);
  return merged;
};

const extractSection = (markdown: string, heading: string): string => {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`## ${escaped}\\n([\\s\\S]*?)(?=\\n## |$)`, "m");
  const match = pattern.exec(markdown);
  const body = match?.[1];
  return typeof body === "string" ? `## ${heading}\n${body.trim()}` : "";
};

let cachedGeneratedContextCatalogs: string | null = null;

const loadGeneratedContextCatalogs = async (): Promise<string> => {
  if (cachedGeneratedContextCatalogs !== null) {
    return cachedGeneratedContextCatalogs;
  }
  try {
    const markdown = await readFile(GENERATED_CONTEXT_SNAPSHOT_FILE, "utf8");
    const sections = [
      extractSection(markdown, "Runtime Action Catalog (Generated)"),
      extractSection(markdown, "Runtime Chat Tool Catalog (Generated)"),
      extractSection(markdown, "GUI API Route Catalog (Generated)"),
    ].filter((section) => section.length > 0);
    cachedGeneratedContextCatalogs =
      sections.length > 0 ? `Capability Snapshot (generated at startup):\n\n${sections.join("\n\n")}` : "";
    return cachedGeneratedContextCatalogs;
  } catch {
    cachedGeneratedContextCatalogs = "";
    return cachedGeneratedContextCatalogs;
  }
};

const truncateText = (value: string, maxLength = 1_500): string =>
  value.length > maxLength ? `${value.slice(0, maxLength)}…[truncated]` : value;

const serializeForLog = (value: unknown): string => {
  if (typeof value === "string") {
    return truncateText(value);
  }
  try {
    return truncateText(JSON.stringify(value));
  } catch {
    return "[unserializable]";
  }
};

const toRuntimeChatErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("User not found")) {
    return "LLM authentication failed (OpenRouter: User not found). Update llm/openrouter/api-key in Vault secrets.";
  }
  if (message.includes("401")) {
    return `LLM request rejected with authentication error: ${message}`;
  }
  return message;
};

const buildActionTools = (deps: RuntimeChatServiceDeps): Record<string, any> => {
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
        const dispatchStartedAt = Date.now();
        deps.logger?.info("chat:tool_start", {
          actionName: action.name,
          input: serializeForLog(rawInput),
        });

        const dispatchResult = await deps.dispatcher.dispatchStep(
          createActionContext({
            actor: "agent",
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
          deps.logger?.error("chat:tool_fail", {
            actionName: action.name,
            durationMs: Date.now() - dispatchStartedAt,
            error: `Action "${action.name}" returned no dispatcher result`,
            policyHits: serializeForLog(dispatchResult.policyHits),
          });
          return {
            ok: false,
            error: `Action "${action.name}" returned no dispatcher result`,
            retryable: false,
            policyHits: dispatchResult.policyHits,
          };
        }

        if (!result.ok) {
          deps.logger?.error("chat:tool_fail", {
            actionName: action.name,
            idempotencyKey: result.idempotencyKey,
            durationMs: Date.now() - dispatchStartedAt,
            actionDurationMs: result.durationMs,
            retryable: result.retryable,
            error: result.error ?? "unknown error",
            payload: serializeForLog(result.data ?? null),
            policyHits: serializeForLog(dispatchResult.policyHits),
          });
        } else {
          deps.logger?.info("chat:tool_success", {
            actionName: action.name,
            idempotencyKey: result.idempotencyKey,
            durationMs: Date.now() - dispatchStartedAt,
            actionDurationMs: result.durationMs,
            txSignature: result.txSignature ?? null,
          });
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
  const workspaceToolsEnabled = deps.workspaceToolsEnabled ?? (process.env.TRENCHCLAW_ENABLE_WORKSPACE_BASH ?? "1") !== "0";
  const workspaceRootDirectory = deps.workspaceRootDirectory ?? DEFAULT_WORKSPACE_ROOT_DIRECTORY;
  let workspaceToolPromise: Promise<Record<string, unknown>> | null = null;

  const listToolNames = (): string[] =>
    buildRuntimeChatToolNameCatalog({
      actionNames: deps.registry
        .list()
        .filter((entry) => Boolean(deps.registry.get(entry.name)?.inputSchema))
        .map((entry) => entry.name),
      workspaceToolsEnabled,
    });

  const generateText = async (input: LlmGenerateInput): Promise<LlmGenerateResult> => {
    if (!deps.llm) {
      return {
        text: "LLM is not configured. Set provider credentials to enable live chat responses.",
        finishReason: "llm-disabled",
      };
    }

    return deps.llm.generate(input);
  };

  const stream = async (
    messages: UIMessage[],
    input?: { headers?: HeadersInit; chatId?: string; sessionId?: string; conversationTitle?: string },
  ): Promise<Response> => {
    const streamStartedAt = Date.now();
    const normalizedMessages = normalizeUiMessages(messages);
    const chatId = resolveChatId(input?.chatId);
    deps.logger?.info("chat:stream_start", {
      chatId,
      inputMessageCount: messages.length,
      normalizedMessageCount: normalizedMessages.length,
      sessionId: trimOrUndefinedValue(input?.sessionId) ?? null,
    });

    const modelResolveStartedAt = Date.now();
    const model = await resolveModel();
    deps.logger?.info("chat:model_ready", {
      chatId,
      durationMs: Date.now() - modelResolveStartedAt,
    });

    const toolNames = listToolNames();
    const tools: Record<string, any> = buildActionTools(deps);
    const now = Date.now();
    const existingConversation = deps.stateStore.getConversation(chatId);
    deps.stateStore.saveConversation({
      id: chatId,
      sessionId: trimOrUndefinedValue(input?.sessionId) ?? existingConversation?.sessionId,
      title: sanitizeConversationTitle(input?.conversationTitle, normalizedMessages) ?? existingConversation?.title,
      summary: existingConversation?.summary,
      createdAt: existingConversation?.createdAt ?? now,
      updatedAt: now,
    });

    if (workspaceToolsEnabled) {
      const workspaceToolsStartedAt = Date.now();
      workspaceToolPromise ??= createWorkspaceBashTools({
        workspaceRootDirectory,
        actor: "agent",
      });
      Object.assign(tools, await workspaceToolPromise);
      deps.logger?.info("chat:workspace_tools_ready", {
        chatId,
        durationMs: Date.now() - workspaceToolsStartedAt,
      });
    }
    try {
      const prepareModelInputStartedAt = Date.now();
      const systemPrompt = await buildSystemPrompt(deps, toolNames);
      const modelMessages = await convertMessages(normalizedMessages);
      deps.logger?.info("chat:model_input_ready", {
        chatId,
        durationMs: Date.now() - prepareModelInputStartedAt,
        toolCount: Object.keys(tools).length,
        systemPromptChars: systemPrompt.length,
      });

      const streamBuildStartedAt = Date.now();
      const maxOutputTokens = resolveChatMaxOutputTokens();
      const result = streamWithModel({
        model,
        system: systemPrompt,
        messages: modelMessages,
        maxOutputTokens,
        stopWhen: stepCountIs(12),
        tools,
      });
      deps.logger?.info("chat:model_stream_initialized", {
        chatId,
        durationMs: Date.now() - streamBuildStartedAt,
        maxOutputTokens,
      });

      const response = result.toUIMessageStreamResponse({
        headers: withChatHeaders(input?.headers, chatId),
        originalMessages: normalizedMessages,
        onError: (error) => toRuntimeChatErrorMessage(error),
        onFinish: ({ messages: finalMessages }) => {
          const updatedAt = Date.now();
          const conversation = deps.stateStore.getConversation(chatId);
          deps.stateStore.saveConversation({
            id: chatId,
            sessionId: conversation?.sessionId ?? trimOrUndefinedValue(input?.sessionId),
            title: conversation?.title ?? sanitizeConversationTitle(input?.conversationTitle, finalMessages),
            summary: conversation?.summary,
            createdAt: conversation?.createdAt ?? updatedAt,
            updatedAt,
          });

          for (const [index, message] of finalMessages.entries()) {
            const content = extractUiMessageText(message).trim();
            if (content.length === 0) {
              continue;
            }

            deps.stateStore.saveChatMessage({
              id: trimOrUndefinedValue(message.id) ?? `msg-${chatId}-${updatedAt + index}-${crypto.randomUUID()}`,
              conversationId: chatId,
              role: message.role,
              content,
              metadata:
                message.metadata && typeof message.metadata === "object"
                  ? (message.metadata as Record<string, unknown>)
                  : undefined,
              createdAt: updatedAt + index,
            });
          }

          deps.logger?.info("chat:stream_finish", {
            chatId,
            durationMs: Date.now() - streamStartedAt,
            finalMessageCount: finalMessages.length,
          });
        },
      });

      if (!response.body) {
        return response;
      }

      let firstChunkAt: number | null = null;
      let chunkCount = 0;
      let byteCount = 0;
      const monitoredBody = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform: (chunk, controller) => {
            if (firstChunkAt === null) {
              firstChunkAt = Date.now();
              deps.logger?.info("chat:model_first_chunk", {
                chatId,
                durationMs: firstChunkAt - streamStartedAt,
              });
            }
            chunkCount += 1;
            byteCount += chunk.byteLength;
            controller.enqueue(chunk);
          },
          flush: () => {
            deps.logger?.info("chat:model_stream_closed", {
              chatId,
              durationMs: Date.now() - streamStartedAt,
              chunkCount,
              bytes: byteCount,
            });
          },
        }),
      );

      return new Response(monitoredBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      const errorMessage = toRuntimeChatErrorMessage(error);
      deps.logger?.error("chat:stream_fail", {
        chatId,
        durationMs: Date.now() - streamStartedAt,
        error: errorMessage,
        payload: serializeForLog({
          sessionId: trimOrUndefinedValue(input?.sessionId) ?? null,
          normalizedMessageCount: normalizedMessages.length,
          lastMessage: normalizedMessages.at(-1)?.parts ?? null,
        }),
      });
      throw new Error(errorMessage);
    }
  };

  return {
    listToolNames,
    generateText,
    stream,
  };
};
