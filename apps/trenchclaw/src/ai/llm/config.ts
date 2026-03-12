import { z } from "zod";
import { loadAiSettings, LLM_PROVIDERS, type LlmProvider } from "./ai-settings-file";
import { parseStructuredFile, resolvePathFromModule } from "./shared";
import { ensureVaultFileExists } from "./vault-file";

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
const DEFAULT_VAULT_FILE = "../brain/protected/no-read/vault.json";
const DEFAULT_VAULT_TEMPLATE_FILE = "../brain/protected/no-read/vault.template.json";
const VAULT_FILE_ENV = "TRENCHCLAW_VAULT_FILE";
const VAULT_TEMPLATE_FILE_ENV = "TRENCHCLAW_VAULT_TEMPLATE_FILE";

const resolveProvider = (rawProvider: string | undefined): LlmProvider =>
  providerSchema.parse(rawProvider?.trim() || "openrouter");

const getByPath = (root: unknown, segments: string[]): unknown => {
  let current = root;
  for (const segment of segments) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

const readVaultString = (root: unknown, refPath: string): string | undefined => {
  const value = getByPath(root, refPath.split("/").filter(Boolean));
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
};

const readVaultData = async (): Promise<unknown> => {
  const vaultPath = resolvePathFromModule(import.meta.url, DEFAULT_VAULT_FILE, process.env[VAULT_FILE_ENV]);
  const vaultTemplatePath = resolvePathFromModule(
    import.meta.url,
    DEFAULT_VAULT_TEMPLATE_FILE,
    process.env[VAULT_TEMPLATE_FILE_ENV],
  );
  await ensureVaultFileExists({
    vaultPath,
    templatePath: vaultTemplatePath,
  });
  return await parseStructuredFile(vaultPath);
};

export const resolveLlmProviderConfigFromEnv = (): LlmProviderConfig | null => {
  // LLM credentials are vault-only to avoid env-vs-vault drift in local GUI testing.
  return null;
};

export const resolveLlmProviderConfigFromVault = async (): Promise<LlmProviderConfig | null> => {
  const aiSettingsPayload = await loadAiSettings();
  const vaultData = await readVaultData();
  const tryProvider = (provider: LlmProvider): LlmProviderConfig | null => {
    if (provider === "openai") {
      const apiKey = readVaultString(vaultData, "llm/openai/api-key");
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
      const apiKey = readVaultString(vaultData, "llm/openrouter/api-key");
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

    const apiKey = readVaultString(vaultData, "llm/openai-compatible/api-key");
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
  const vaultData = await readVaultData();
  const apiKey = readVaultString(vaultData, "llm/gateway/api-key");
  if (!apiKey) {
    return null;
  }
  return {
    apiKey,
    model: readVaultString(vaultData, "llm/gateway/model") ?? "anthropic/claude-sonnet-4.5",
  };
};
