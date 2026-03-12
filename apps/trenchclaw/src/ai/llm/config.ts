import { z } from "zod";
import { loadAiSettings, LLM_PROVIDERS, type LlmProvider } from "./ai-settings-file";
import { loadVaultLayers, readVaultString } from "./vault-file";

export interface LlmProviderConfig {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  baseURL?: string;
}

const defaultModelByProvider: Record<LlmProvider, string> = {
  openai: "gpt-4.1-mini",
  openrouter: "stepfun/step-3.5-flash:free",
  "openai-compatible": "gpt-4.1-mini",
};

const providerSchema = z.enum(LLM_PROVIDERS);
const resolveProvider = (rawProvider: string | undefined): LlmProvider =>
  providerSchema.parse(rawProvider?.trim() || "openrouter");

export const resolveLlmProviderConfigFromEnv = (): LlmProviderConfig | null => {
  // LLM credentials are vault-only to avoid env-vs-vault drift in local GUI testing.
  return null;
};

export const resolveLlmProviderConfigFromVault = async (): Promise<LlmProviderConfig | null> => {
  const aiSettingsPayload = await loadAiSettings();
  const { mergedVaultData } = await loadVaultLayers();
  const tryProvider = (provider: LlmProvider): LlmProviderConfig | null => {
    if (provider === "openai") {
      const apiKey = readVaultString(mergedVaultData, "llm/openai/api-key");
      if (!apiKey) {
        return null;
      }
      return {
        provider,
        apiKey,
        model: aiSettingsPayload.settings.model || defaultModelByProvider.openai,
        baseURL: aiSettingsPayload.settings.baseURL || undefined,
      };
    }

    if (provider === "openrouter") {
      const apiKey = readVaultString(mergedVaultData, "llm/openrouter/api-key");
      if (!apiKey) {
        return null;
      }
      return {
        provider,
        apiKey,
        model: aiSettingsPayload.settings.model || defaultModelByProvider.openrouter,
        baseURL: aiSettingsPayload.settings.baseURL || "https://openrouter.ai/api/v1",
      };
    }

    const apiKey = readVaultString(mergedVaultData, "llm/openai-compatible/api-key");
    const baseURL = aiSettingsPayload.settings.baseURL;
    if (!apiKey || !baseURL) {
      return null;
    }
    return {
      provider,
      apiKey,
      baseURL: z.string().url().parse(baseURL),
      model: aiSettingsPayload.settings.model || defaultModelByProvider["openai-compatible"],
    };
  };

  return tryProvider(resolveProvider(aiSettingsPayload.settings.provider));
};

export const resolveLlmProviderConfig = async (): Promise<LlmProviderConfig | null> => {
  return resolveLlmProviderConfigFromVault();
};

export const resolveGatewayConfig = async (): Promise<{ apiKey: string; model: string } | null> => {
  const { mergedVaultData } = await loadVaultLayers();
  const apiKey = readVaultString(mergedVaultData, "llm/gateway/api-key");
  if (!apiKey) {
    return null;
  }
  return {
    apiKey,
    model: readVaultString(mergedVaultData, "llm/gateway/model") ?? "anthropic/claude-sonnet-4.5",
  };
};
