import { z } from "zod";
import { parseStructuredFile, resolvePathFromModule } from "./shared";
import { ensureVaultFileExists } from "./vault-file";

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
  openrouter: "stepfun/step-3.5-flash:free",
  "openai-compatible": "gpt-4.1-mini",
};

const providerSchema = z.enum(LLM_PROVIDERS);
const DEFAULT_VAULT_FILE = "../brain/protected/no-read/vault.json";
const DEFAULT_VAULT_TEMPLATE_FILE = "../brain/protected/no-read/vault.template.json";
const VAULT_FILE_ENV = "TRENCHCLAW_VAULT_FILE";
const VAULT_TEMPLATE_FILE_ENV = "TRENCHCLAW_VAULT_TEMPLATE_FILE";

const trimOrUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const ensureApiKey = (name: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(`Missing API key for provider "${name}".`);
  }
  return value;
};

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

export const resolveLlmProviderConfigFromVault = async (): Promise<LlmProviderConfig | null> => {
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
        model: readVaultString(vaultData, "llm/openai/model") ?? defaultModelByProvider.openai,
        baseURL: readVaultString(vaultData, "llm/openai/base-url"),
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
        model: readVaultString(vaultData, "llm/openrouter/model") ?? defaultModelByProvider.openrouter,
        baseURL: readVaultString(vaultData, "llm/openrouter/base-url") ?? "https://openrouter.ai/api/v1",
      };
    }

    const apiKey = readVaultString(vaultData, "llm/openai-compatible/api-key");
    const baseURL = readVaultString(vaultData, "llm/openai-compatible/base-url");
    if (!apiKey || !baseURL) {
      return null;
    }
    return {
      provider,
      apiKey,
      baseURL: z.string().url().parse(baseURL),
      model: readVaultString(vaultData, "llm/openai-compatible/model") ?? defaultModelByProvider["openai-compatible"],
    };
  };

  const envProviderRaw = trimOrUndefined(process.env.TRENCHCLAW_AI_PROVIDER);
  const vaultProviderRaw = readVaultString(vaultData, "llm/provider");
  const preferredProviders: LlmProvider[] = [];

  if (envProviderRaw) {
    preferredProviders.push(resolveProvider(envProviderRaw));
  }
  if (vaultProviderRaw) {
    const resolved = resolveProvider(vaultProviderRaw);
    if (!preferredProviders.includes(resolved)) {
      preferredProviders.push(resolved);
    }
  }

  for (const fallbackProvider of LLM_PROVIDERS) {
    if (!preferredProviders.includes(fallbackProvider)) {
      preferredProviders.push(fallbackProvider);
    }
  }

  for (const provider of preferredProviders) {
    const config = tryProvider(provider);
    if (config) {
      return config;
    }
  }

  return null;
};

export const resolveLlmProviderConfig = async (): Promise<LlmProviderConfig | null> => {
  const fromVault = await resolveLlmProviderConfigFromVault();
  if (fromVault) {
    return fromVault;
  }
  return resolveLlmProviderConfigFromEnv();
};

export const resolveGatewayConfig = async (): Promise<{ apiKey: string; model: string } | null> => {
  const envApiKey = trimOrUndefined(process.env.AI_GATEWAY_API_KEY);
  const envModel = trimOrUndefined(process.env.TRENCHCLAW_AI_MODEL) ?? "anthropic/claude-sonnet-4.5";
  if (envApiKey) {
    return { apiKey: envApiKey, model: envModel };
  }

  const vaultData = await readVaultData();
  const apiKey = readVaultString(vaultData, "llm/gateway/api-key");
  if (!apiKey) {
    return null;
  }
  return {
    apiKey,
    model: readVaultString(vaultData, "llm/gateway/model") ?? envModel,
  };
};
