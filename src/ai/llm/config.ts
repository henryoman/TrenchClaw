import { z } from "zod";

export const LLM_PROVIDERS = ["openai", "openrouter", "openai-compatible"] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export interface LlmProviderConfig {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  baseURL?: string;
}

const defaultModelByProvider: Record<LlmProvider, string> = {
  openai: "gpt-4.1-mini",
  openrouter: "stepfun-ai/step-3.5-mini:free",
  "openai-compatible": "gpt-4.1-mini",
};

const providerSchema = z.enum(LLM_PROVIDERS);

const trimOrUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const ensureApiKey = (name: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(`Missing API key for provider \"${name}\".`);
  }
  return value;
};

const resolveProvider = (rawProvider: string | undefined): LlmProvider =>
  providerSchema.parse(rawProvider?.trim() || "openrouter");

export const resolveLlmProviderConfigFromEnv = (): LlmProviderConfig | null => {
  const provider = resolveProvider(process.env.TRENCHCLAW_AI_PROVIDER);

  if (provider === "openai") {
    const apiKey = trimOrUndefined(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      return null;
    }

    return {
      provider,
      apiKey,
      model: trimOrUndefined(process.env.TRENCHCLAW_AI_MODEL) ?? defaultModelByProvider.openai,
      baseURL: trimOrUndefined(process.env.TRENCHCLAW_AI_BASE_URL),
    };
  }

  if (provider === "openrouter") {
    const apiKey = trimOrUndefined(process.env.OPENROUTER_API_KEY);
    if (!apiKey) {
      return null;
    }

    return {
      provider,
      apiKey,
      model: trimOrUndefined(process.env.TRENCHCLAW_AI_MODEL) ?? defaultModelByProvider.openrouter,
      baseURL: trimOrUndefined(process.env.TRENCHCLAW_AI_BASE_URL) ?? "https://openrouter.ai/api/v1",
    };
  }

  const baseURL = trimOrUndefined(process.env.TRENCHCLAW_AI_BASE_URL);
  const apiKey = trimOrUndefined(process.env.TRENCHCLAW_AI_API_KEY);

  if (!baseURL && !apiKey) {
    return null;
  }

  return {
    provider,
    baseURL: z.string().url().parse(baseURL),
    apiKey: ensureApiKey(provider, apiKey),
    model: trimOrUndefined(process.env.TRENCHCLAW_AI_MODEL) ?? defaultModelByProvider[provider],
  };
};
