import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import { loadDefaultSystemPrompt } from "./prompt-loader";
import type {
  LlmClient,
  LlmClientConfig,
  LlmGenerateInput,
  LlmGenerateResult,
  LlmStreamInput,
  LlmStreamResult,
} from "./types";

const DEFAULT_MODEL = "gpt-4.1-mini";

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
  const openai = createOpenAI({ apiKey: config.apiKey });
  const model = openai.responses(config.model);

  const generate = async (input: LlmGenerateInput): Promise<LlmGenerateResult> => {
    const system = withTemporalContext(input.system ?? config.defaultSystemPrompt);
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
    const system = withTemporalContext(input.system ?? config.defaultSystemPrompt);
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
    provider: "openai",
    model: config.model,
    defaultSystemPrompt: config.defaultSystemPrompt,
    generate,
    stream,
  };
};

export const createLlmClientFromEnv = async (): Promise<LlmClient | null> => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const model = process.env.TRENCHCLAW_LLM_MODEL?.trim() || DEFAULT_MODEL;
  const defaultSystemPrompt = await loadDefaultSystemPrompt();

  return createLlmClient({
    apiKey,
    model,
    defaultSystemPrompt,
  });
};
