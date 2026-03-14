import { generateText, streamText, type LanguageModel } from "ai";
import { loadAiSettings } from "./ai-settings-file";
import { createLanguageModel, resolveLlmProviderConfig } from "./config";
import { loadSystemPromptPayload } from "./prompt-loader";
import type {
  LlmClient,
  LlmClientConfig,
  LlmGenerateInput,
  LlmGenerateResult,
  LlmStreamInput,
  LlmStreamResult,
} from "./types";

const LLM_GENERATE_TIMEOUT = {
  totalMs: 30_000,
  stepMs: 30_000,
} as const;

const LLM_STREAM_TIMEOUT = {
  totalMs: 45_000,
  stepMs: 25_000,
  chunkMs: 12_000,
} as const;

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

export interface ResolvedLlmRuntimeBinding {
  client: LlmClient | null;
  provider: string | null;
  model: string | null;
  languageModel: LanguageModel | null;
}

export const createLlmClient = (config: LlmClientConfig): LlmClient => {
  const model = createLanguageModel(config);
  const resolveSystemPrompt = async (input: LlmGenerateInput | LlmStreamInput): Promise<string> => {
    if (input.system) {
      return input.system;
    }

    const payload = await loadSystemPromptPayload(input.mode?.trim() || config.defaultMode);
    return payload.systemPrompt;
  };

  const generate = async (input: LlmGenerateInput): Promise<LlmGenerateResult> => {
    const system = withTemporalContext(await resolveSystemPrompt(input));
    const result = await generateText({
      model,
      system,
      prompt: input.prompt,
      timeout: LLM_GENERATE_TIMEOUT,
      maxOutputTokens: input.maxOutputTokens ?? config.defaultMaxOutputTokens ?? undefined,
      temperature: input.temperature ?? config.defaultTemperature ?? undefined,
    });

    return toGenerateResult(result);
  };

  const stream = async (input: LlmStreamInput): Promise<LlmStreamResult> => {
    const system = withTemporalContext(await resolveSystemPrompt(input));
    const result = streamText({
      model,
      system,
      prompt: input.prompt,
      timeout: LLM_STREAM_TIMEOUT,
      maxOutputTokens: input.maxOutputTokens ?? config.defaultMaxOutputTokens ?? undefined,
      temperature: input.temperature ?? config.defaultTemperature ?? undefined,
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

export const resolveLlmRuntimeBinding = async (): Promise<ResolvedLlmRuntimeBinding> => {
  const providerConfig = await resolveLlmProviderConfig();
  if (!providerConfig) {
    return {
      client: null,
      provider: null,
      model: null,
      languageModel: null,
    };
  }
  const aiSettingsPayload = await loadAiSettings();
  const defaultPromptPayload = await loadSystemPromptPayload(
    process.env.TRENCHCLAW_AGENT_MODE ?? aiSettingsPayload.settings.defaultMode,
  );

  return {
    client: createLlmClient({
      ...providerConfig,
      defaultSystemPrompt: defaultPromptPayload.systemPrompt,
      defaultMode: aiSettingsPayload.settings.defaultMode || defaultPromptPayload.mode,
      defaultTemperature: aiSettingsPayload.settings.temperature,
      defaultMaxOutputTokens: aiSettingsPayload.settings.maxOutputTokens,
    }),
    provider: providerConfig.provider,
    model: providerConfig.model,
    languageModel: createLanguageModel(providerConfig),
  };
};
