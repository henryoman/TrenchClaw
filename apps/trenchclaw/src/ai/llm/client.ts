import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import { resolveLlmProviderConfig } from "./config";
import { loadSystemPromptPayload } from "./prompt-loader";
import type {
  LlmClient,
  LlmClientConfig,
  LlmGenerateInput,
  LlmGenerateResult,
  LlmStreamInput,
  LlmStreamResult,
} from "./types";

const buildTemporalContext = (now: Date = new Date()): string => {
  const iso = now.toISOString();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const local = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "long",
    timeZoneName: "short",
  }).format(now);

  return [
    "Runtime temporal context (always current at request time):",
    `- ISO timestamp (UTC): ${iso}`,
    `- Local datetime (${timezone}): ${local}`,
  ].join("\n");
};

const withTemporalContext = (systemPrompt: string): string =>
  `${systemPrompt.trim()}\n\n${buildTemporalContext()}`;

const toGenerateResult = (result: Awaited<ReturnType<typeof generateText>>): LlmGenerateResult => ({
  text: result.text,
  finishReason: String(result.finishReason ?? "unknown"),
  usage: {
    inputTokens: result.usage?.inputTokens,
    outputTokens: result.usage?.outputTokens,
    totalTokens: result.usage?.totalTokens,
  },
});

const toStreamResult = (result: ReturnType<typeof streamText>): LlmStreamResult => ({
  textStream: result.textStream,
  consumeText: async () => {
    let text = "";
    for await (const chunk of result.textStream) {
      text += chunk;
    }
    return text;
  },
});

export const createLlmClient = (config: LlmClientConfig): LlmClient => {
  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
  const model = openai.responses(config.model);
  const resolveSystemPrompt = async (input: LlmGenerateInput | LlmStreamInput): Promise<string> => {
    if (input.system) {
      return input.system;
    }

    const requestedMode = input.mode?.trim();
    if (!requestedMode || requestedMode === config.defaultMode) {
      return config.defaultSystemPrompt;
    }

    const payload = await loadSystemPromptPayload(requestedMode);
    return payload.systemPrompt;
  };

  const generate = async (input: LlmGenerateInput): Promise<LlmGenerateResult> => {
    const system = withTemporalContext(await resolveSystemPrompt(input));
    const result = await generateText({
      model,
      system,
      prompt: input.prompt,
      maxOutputTokens: input.maxOutputTokens,
      temperature: input.temperature,
    });

    return toGenerateResult(result);
  };

  const stream = async (input: LlmStreamInput): Promise<LlmStreamResult> => {
    const system = withTemporalContext(await resolveSystemPrompt(input));
    const result = streamText({
      model,
      system,
      prompt: input.prompt,
      maxOutputTokens: input.maxOutputTokens,
      temperature: input.temperature,
    });

    return toStreamResult(result);
  };

  return {
    provider: config.provider,
    model: config.model,
    defaultSystemPrompt: config.defaultSystemPrompt,
    defaultMode: config.defaultMode,
    generate,
    stream,
  };
};

export const createLlmClientFromEnv = async (): Promise<LlmClient | null> => {
  const providerConfig = await resolveLlmProviderConfig();
  if (!providerConfig) {
    return null;
  }
  const defaultPromptPayload = await loadSystemPromptPayload(process.env.TRENCHCLAW_AGENT_MODE);

  return createLlmClient({
    ...providerConfig,
    defaultSystemPrompt: defaultPromptPayload.systemPrompt,
    defaultMode: defaultPromptPayload.mode,
  });
};
