import type { LlmProvider } from "./config";

export interface LlmGenerateInput {
  prompt: string;
  system?: string;
  mode?: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface LlmGenerateResult {
  text: string;
  finishReason: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface LlmStreamInput extends LlmGenerateInput {}

export interface LlmStreamResult {
  textStream: AsyncIterable<string>;
  consumeText: () => Promise<string>;
}

export interface LlmClient {
  readonly provider: LlmProvider;
  readonly model: string;
  readonly defaultSystemPrompt: string;
  readonly defaultMode?: string;
  generate: (input: LlmGenerateInput) => Promise<LlmGenerateResult>;
  stream: (input: LlmStreamInput) => Promise<LlmStreamResult>;
}

export interface LlmClientConfig {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  baseURL: string;
  defaultSystemPrompt: string;
  defaultMode?: string;
  defaultTemperature?: number | null;
  defaultMaxOutputTokens?: number | null;
}
