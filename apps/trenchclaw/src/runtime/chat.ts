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
import {
  createWorkspaceBashTools,
  WORKSPACE_BASH_TOOL_NAME,
  WORKSPACE_READ_FILE_TOOL_NAME,
  WORKSPACE_WRITE_FILE_TOOL_NAME,
} from "./workspace-bash";
import { buildFilesystemPolicyPrompt } from "./security/filesystem-manifest";

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
  workspaceToolsEnabled?: boolean;
  workspaceRootDirectory?: string;
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

const trimOrUndefinedValue = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const extractUiMessageText = (message: UIMessage): string => {
  const text = message.parts
    .filter((part): part is Extract<(typeof message.parts)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text.trim())
    .filter((part) => part.length > 0)
    .join("\n");

  if (text.length > 0) {
    return text;
  }

  return JSON.stringify(message.parts);
};

const normalizeUiMessages = (messages: UIMessage[]): UIMessage[] => {
  const normalized: UIMessage[] = [];

  for (const message of messages) {
    const sourceRole = message.role;
    if (sourceRole !== "system" && sourceRole !== "user" && sourceRole !== "assistant") {
      continue;
    }

    const text = message.parts
      .map((part) => {
        if (part.type === "text") {
          return part.text ?? "";
        }
        return JSON.stringify(part);
      })
      .join("\n")
      .trim();

    if (!text) {
      continue;
    }

    const role = sourceRole === "assistant" ? "user" : sourceRole;
    const normalizedText = sourceRole === "assistant" ? `[assistant]\n${text}` : text;

    normalized.push({
      id: trimOrUndefinedValue(message.id) ?? `msg-${crypto.randomUUID()}`,
      role,
      parts: [{ type: "text", text: normalizedText }],
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
  const workspaceToolsEnabled = deps.workspaceToolsEnabled ?? (process.env.TRENCHCLAW_ENABLE_WORKSPACE_BASH ?? "1") !== "0";
  const workspaceRootDirectory = deps.workspaceRootDirectory ?? DEFAULT_WORKSPACE_ROOT_DIRECTORY;
  let workspaceToolPromise: Promise<Record<string, unknown>> | null = null;

  const listToolNames = (): string[] =>
    [
      ...deps.registry
      .list()
      .filter((entry) => Boolean(deps.registry.get(entry.name)?.inputSchema))
      .map((entry) => entry.name)
      .toSorted((a, b) => a.localeCompare(b)),
      ...(workspaceToolsEnabled
        ? [WORKSPACE_BASH_TOOL_NAME, WORKSPACE_READ_FILE_TOOL_NAME, WORKSPACE_WRITE_FILE_TOOL_NAME]
        : []),
    ].toSorted((a, b) => a.localeCompare(b));

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
    const normalizedMessages = normalizeUiMessages(messages);
    const model = resolveModel();
    const toolNames = listToolNames();
    const tools: Record<string, any> = buildActionTools(deps);
    const chatId = resolveChatId(input?.chatId);
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
      workspaceToolPromise ??= createWorkspaceBashTools({
        workspaceRootDirectory,
        actor: "agent",
      });
      Object.assign(tools, await workspaceToolPromise);
    }
    const result = streamWithModel({
      model,
      system: await buildSystemPrompt(deps, toolNames),
      messages: await convertMessages(normalizedMessages),
      stopWhen: stepCountIs(12),
      tools,
    });

    return result.toUIMessageStreamResponse({
      headers: withChatHeaders(input?.headers, chatId),
      originalMessages: normalizedMessages,
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
          deps.stateStore.saveChatMessage({
            id: trimOrUndefinedValue(message.id) ?? `msg-${chatId}-${updatedAt + index}-${crypto.randomUUID()}`,
            conversationId: chatId,
            role: message.role,
            content: extractUiMessageText(message),
            metadata:
              message.metadata && typeof message.metadata === "object"
                ? (message.metadata as Record<string, unknown>)
                : undefined,
            createdAt: updatedAt + index,
          });
        }
      },
    });
  };

  return {
    listToolNames,
    generateText,
    stream,
  };
};
