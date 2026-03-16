import { loadVaultData, readVaultString } from "../../../ai/llm/vault-file";
import { HELIUS_GATEWAY_HTTP_URL } from "./urls";

const HELIUS_API_KEY_QUERY_PARAM = "api-key";
const HELIUS_HOST_SUFFIX = "helius-rpc.com";
const HELIUS_PLACEHOLDER_API_KEY = "YOUR_API_KEY";

const trimToNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const tryParseUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

export const isHeliusRpcUrl = (value?: string | null): boolean => {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return false;
  }

  const parsed = tryParseUrl(trimmed);
  return parsed?.hostname.endsWith(HELIUS_HOST_SUFFIX) ?? false;
};

const readHeliusApiKeyFromUrl = (value?: string | null): string | null => {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return null;
  }

  const parsed = tryParseUrl(trimmed);
  const apiKey = parsed?.searchParams.get(HELIUS_API_KEY_QUERY_PARAM);
  return apiKey && apiKey !== HELIUS_PLACEHOLDER_API_KEY ? apiKey : null;
};

const injectHeliusApiKey = (value: string, apiKey: string | null): string => {
  const parsed = tryParseUrl(value);
  if (!parsed) {
    return value;
  }

  const currentApiKey = parsed.searchParams.get(HELIUS_API_KEY_QUERY_PARAM);
  if (apiKey && (!currentApiKey || currentApiKey === HELIUS_PLACEHOLDER_API_KEY)) {
    parsed.searchParams.set(HELIUS_API_KEY_QUERY_PARAM, apiKey);
  }

  return parsed.toString();
};

const buildGatewayHeliusRpcUrl = (apiKey: string): string =>
  HELIUS_GATEWAY_HTTP_URL.replace(HELIUS_PLACEHOLDER_API_KEY, encodeURIComponent(apiKey));

export interface ResolvedHeliusRpcConfig {
  apiKey: string | null;
  rpcUrl: string | null;
  source: "context-rpc" | "default-rpc" | "legacy-helius" | "api-key-only" | null;
  selected: boolean;
}

export const resolveHeliusRpcConfig = async (input?: {
  activeInstanceId?: string | null;
  rpcUrl?: string;
  requireSelectedProvider?: boolean;
}): Promise<ResolvedHeliusRpcConfig> => {
  const contextRpcUrl = trimToNull(input?.rpcUrl);
  const contextIsHelius = isHeliusRpcUrl(contextRpcUrl);

  const { vaultData } = await loadVaultData({
    activeInstanceId: input?.activeInstanceId,
  });

  const defaultProviderId = readVaultString(vaultData, "rpc/default/provider-id");
  const defaultRpcUrl = readVaultString(vaultData, "rpc/default/http-url");
  const defaultApiKey = readVaultString(vaultData, "rpc/default/api-key");
  const legacyHeliusRpcUrl = readVaultString(vaultData, "rpc/helius/http-url");
  const legacyHeliusApiKey = readVaultString(vaultData, "rpc/helius/api-key");
  const legacyHeliusConfigured = Boolean(legacyHeliusRpcUrl || legacyHeliusApiKey);

  const apiKey =
    readHeliusApiKeyFromUrl(contextRpcUrl)
    ?? defaultApiKey
    ?? legacyHeliusApiKey
    ?? readHeliusApiKeyFromUrl(defaultRpcUrl)
    ?? readHeliusApiKeyFromUrl(legacyHeliusRpcUrl);

  const selected =
    contextIsHelius
    || defaultProviderId === "helius"
    || isHeliusRpcUrl(defaultRpcUrl)
    || (!defaultProviderId && !defaultRpcUrl && legacyHeliusConfigured);

  if (input?.requireSelectedProvider && !selected) {
    return {
      apiKey,
      rpcUrl: null,
      source: null,
      selected: false,
    };
  }

  if (contextIsHelius && contextRpcUrl) {
    return {
      apiKey,
      rpcUrl: injectHeliusApiKey(contextRpcUrl, apiKey),
      source: "context-rpc",
      selected,
    };
  }

  if (defaultRpcUrl && isHeliusRpcUrl(defaultRpcUrl)) {
    return {
      apiKey,
      rpcUrl: injectHeliusApiKey(defaultRpcUrl, apiKey),
      source: "default-rpc",
      selected,
    };
  }

  if (legacyHeliusRpcUrl) {
    return {
      apiKey,
      rpcUrl: injectHeliusApiKey(legacyHeliusRpcUrl, apiKey),
      source: "legacy-helius",
      selected,
    };
  }

  if (apiKey && !input?.requireSelectedProvider) {
    return {
      apiKey,
      rpcUrl: buildGatewayHeliusRpcUrl(apiKey),
      source: "api-key-only",
      selected,
    };
  }

  return {
    apiKey,
    rpcUrl: null,
    source: null,
    selected,
  };
};
