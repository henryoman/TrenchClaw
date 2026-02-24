export interface LlmGenerateInput {
  prompt: string;
  system?: string;
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
  readonly provider: "openai";
  readonly model: string;
  readonly defaultSystemPrompt: string;
  generate: (input: LlmGenerateInput) => Promise<LlmGenerateResult>;
  stream: (input: LlmStreamInput) => Promise<LlmStreamResult>;
}

export interface LlmClientConfig {
  apiKey: string;
  model: string;
  defaultSystemPrompt: string;
}
