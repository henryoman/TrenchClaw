import { createGateway, type LanguageModel } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { loadAiSettings } from "./ai-settings-file";
import { supportsAiModelProvider } from "./model-catalog";
import { loadVaultData, readVaultString } from "./vault-file";

export const LLM_PROVIDERS = ["gateway", "openrouter"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export interface LlmProviderConfig {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  baseURL: string;
}

const defaultBaseUrlByProvider: Record<LlmProvider, string> = {
  gateway: "https://ai-gateway.vercel.sh/v3/ai",
  openrouter: "https://openrouter.ai/api/v1",
};

const resolveProviderConfig = (
  provider: LlmProvider,
  vaultData: Record<string, unknown>,
  model: string,
): LlmProviderConfig | null => {
  const apiKey = readVaultString(vaultData, `llm/${provider}/api-key`);
  if (!apiKey) {
    return null;
  }

  if (!supportsAiModelProvider(provider, model)) {
    return null;
  }

  return {
    provider,
    apiKey,
    model,
    baseURL: defaultBaseUrlByProvider[provider],
  };
};

export const resolveLlmProviderConfigFromEnv = (): LlmProviderConfig | null => {
  // LLM credentials are vault-only to avoid env-vs-vault drift in local GUI testing.
  return null;
};

export const listLlmProviderConfigsFromVault = async (): Promise<LlmProviderConfig[]> => {
  const [{ settings }, { vaultData }] = await Promise.all([loadAiSettings(), loadVaultData()]);
  const model = settings.model.trim();

  const resolved = resolveProviderConfig(settings.provider, vaultData, model);
  return resolved ? [resolved] : [];
};

export const resolveLlmProviderConfigFromVault = async (): Promise<LlmProviderConfig | null> => {
  const configuredProviders = await listLlmProviderConfigsFromVault();
  return configuredProviders[0] ?? null;
};

export const resolveLlmProviderConfig = async (): Promise<LlmProviderConfig | null> => resolveLlmProviderConfigFromVault();

export const createLanguageModel = (config: Pick<LlmProviderConfig, "provider" | "apiKey" | "model" | "baseURL">): LanguageModel => {
  if (config.provider === "gateway") {
    const gateway = createGateway({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    return gateway(config.model);
  }

  const openrouter = createOpenRouter({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
  return openrouter(config.model);
};
