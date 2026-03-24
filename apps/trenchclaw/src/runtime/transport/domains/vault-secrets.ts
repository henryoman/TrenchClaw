import { readFile, writeFile } from "node:fs/promises";
import type {
  RuntimeApiDeleteSecretRequest,
  RuntimeApiDeleteSecretResponse,
  RuntimeApiSecretEntryView,
  RuntimeApiSecretOptionView,
  RuntimeApiSecretsResponse,
  RuntimeApiUpdateVaultRequest,
  RuntimeApiUpdateVaultResponse,
  RuntimeApiUpsertSecretRequest,
  RuntimeApiUpsertSecretResponse,
  RuntimeApiVaultResponse,
} from "@trenchclaw/types";
import {
  ensureVaultFileExists,
  parseVaultJsonText,
  resolveRequiredVaultFile,
  sanitizeVaultData,
} from "../../../ai/llm/vault-file";
import { isRecord } from "../../object-utils";
import { assertInstanceSystemWritePath } from "../../security/write-scope";
import { PUBLIC_RPC_OPTIONS, RPC_PROVIDER_OPTIONS, SECRET_OPTIONS } from "../constants";
import type { RuntimeTransportContext } from "../contracts";

interface SecretOptionInternal extends RuntimeApiSecretOptionView {
  pathSegments: string[];
}

const SECRET_OPTIONS_INTERNAL: SecretOptionInternal[] = SECRET_OPTIONS.map((option) => ({
  ...option,
  pathSegments: option.vaultPath.split("/").filter(Boolean),
}));

const SECRET_OPTION_BY_ID = new Map(SECRET_OPTIONS_INTERNAL.map((option) => [option.id, option]));
const RPC_PROVIDER_BY_ID = new Map(RPC_PROVIDER_OPTIONS.map((option) => [option.id, option]));
const SOLANA_RPC_OPTION_ID = "solana-rpc-url";
const DEFAULT_RPC_PROVIDER_ID = RPC_PROVIDER_OPTIONS[0]?.id ?? "helius";

const trimString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const getByPath = (root: unknown, pathSegments: string[]): unknown => {
  let current = root;
  for (const segment of pathSegments) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
};

const setByPath = (root: Record<string, unknown>, pathSegments: string[], value: unknown): void => {
  if (pathSegments.length === 0) {
    return;
  }
  let current: Record<string, unknown> = root;
  for (let index = 0; index < pathSegments.length - 1; index += 1) {
    const key = pathSegments[index];
    if (!key) {
      continue;
    }
    const next = current[key];
    if (!isRecord(next)) {
      const replacement: Record<string, unknown> = {};
      current[key] = replacement;
      current = replacement;
      continue;
    }
    current = next;
  }
  const leafKey = pathSegments[pathSegments.length - 1];
  if (!leafKey) {
    return;
  }
  current[leafKey] = value;
};

const resolveWebsocketUrl = (httpUrl: string): string =>
  httpUrl.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");

const buildPrivateRpcUrls = (providerId: string, credential: string): { httpUrl: string; wsUrl: string } => {
  const trimmedCredential = credential.trim();
  if (!trimmedCredential) {
    throw new Error("RPC credential is required.");
  }

  if (providerId === "helius") {
    return {
      httpUrl: `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(trimmedCredential)}`,
      wsUrl: `wss://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(trimmedCredential)}`,
    };
  }

  if (providerId === "shyft") {
    return {
      httpUrl: `https://rpc.shyft.to/?api_key=${encodeURIComponent(trimmedCredential)}`,
      wsUrl: `wss://rpc.shyft.to/?api_key=${encodeURIComponent(trimmedCredential)}`,
    };
  }

  if (!/^https?:\/\//iu.test(trimmedCredential)) {
    throw new Error("This RPC provider requires the full endpoint URL.");
  }

  return {
    httpUrl: trimmedCredential,
    wsUrl: resolveWebsocketUrl(trimmedCredential),
  };
};

const inferRpcProviderId = (vaultData: Record<string, unknown>): string => {
  const storedProviderId = trimString(getByPath(vaultData, ["rpc", "default", "provider-id"]));
  if (storedProviderId && RPC_PROVIDER_BY_ID.has(storedProviderId)) {
    return storedProviderId;
  }

  const activeHttpUrl = trimString(getByPath(vaultData, ["rpc", "default", "http-url"]));
  if (activeHttpUrl.includes("helius-rpc.com")) {
    return "helius";
  }
  if (activeHttpUrl.includes("rpc.shyft.to")) {
    return "shyft";
  }
  if (activeHttpUrl.includes("quiknode.pro")) {
    return "quicknode";
  }
  if (activeHttpUrl.includes("chainstack")) {
    return "chainstack";
  }

  return DEFAULT_RPC_PROVIDER_ID;
};

const resolveStoredRpcCredential = (vaultData: Record<string, unknown>, providerId: string): string => {
  const storedCredential = trimString(getByPath(vaultData, ["rpc", "default", "api-key"]));
  if (storedCredential) {
    return storedCredential;
  }

  const activeHttpUrl = trimString(getByPath(vaultData, ["rpc", "default", "http-url"]));
  const provider = RPC_PROVIDER_BY_ID.get(providerId);
  if (provider?.mode === "endpoint-url" && activeHttpUrl) {
    return activeHttpUrl;
  }

  return "";
};

const updatePrivateRpcVaultState = (
  vaultData: Record<string, unknown>,
  providerId: string,
  credential: string,
): void => {
  const urls = buildPrivateRpcUrls(providerId, credential);
  setByPath(vaultData, ["rpc", "default", "provider-id"], providerId);
  setByPath(vaultData, ["rpc", "default", "api-key"], credential);
  setByPath(vaultData, ["rpc", "default", "http-url"], urls.httpUrl);
  setByPath(vaultData, ["rpc", "default", "ws-url"], urls.wsUrl);
  setByPath(vaultData, ["rpc", providerId, "api-key"], credential);
  setByPath(vaultData, ["rpc", providerId, "http-url"], urls.httpUrl);
  setByPath(vaultData, ["rpc", providerId, "ws-url"], urls.wsUrl);
};

const toSecretEntry = (vaultData: Record<string, unknown>, option: SecretOptionInternal): RuntimeApiSecretEntryView => {
  const rawValue = getByPath(vaultData, option.pathSegments);
  const value = typeof rawValue === "string" ? rawValue : "";

  if (!option.supportsPublicRpc) {
    return {
      optionId: option.id,
      category: option.category,
      label: option.label,
      vaultPath: option.vaultPath,
      value,
      source: "custom",
      publicRpcId: null,
      rpcProviderId: null,
    };
  }

  const sourceRaw = getByPath(vaultData, ["rpc", "default", "source"]);
  const source = sourceRaw === "public" ? "public" : "custom";
  const publicRpcRaw = getByPath(vaultData, ["rpc", "default", "public-id"]);
  const publicRpcId = typeof publicRpcRaw === "string" && publicRpcRaw.trim().length > 0 ? publicRpcRaw : null;
  const rpcProviderId = inferRpcProviderId(vaultData);
  const rpcCredential = resolveStoredRpcCredential(vaultData, rpcProviderId);
  const displayedValue = source === "public" ? rpcCredential : rpcCredential || value;

  return {
    optionId: option.id,
    category: option.category,
    label: option.label,
    vaultPath: option.vaultPath,
    value: displayedValue,
    source,
    publicRpcId,
    rpcProviderId,
  };
};

const resolveManagedVaultTarget = async (context?: RuntimeTransportContext) => {
  const resolved = resolveRequiredVaultFile({
    activeInstanceId: context?.getActiveInstance()?.localInstanceId ?? undefined,
  });
  if (!resolved.explicitVaultPath) {
    assertInstanceSystemWritePath(resolved.vaultPath, "access instance vault");
  }
  await ensureVaultFileExists({
    vaultPath: resolved.vaultPath,
    seedPath: resolved.seedPath,
  });
  return resolved;
};

const serializeVaultData = (vaultData: Record<string, unknown>): string => `${JSON.stringify(vaultData, null, 2)}\n`;

const loadManagedVaultData = async (context?: RuntimeTransportContext) => {
  const target = await resolveManagedVaultTarget(context);
  const content = await readFile(target.vaultPath, "utf8");
  const vaultData = parseVaultJsonText(content);
  const { changed } = sanitizeVaultData(vaultData);
  if (changed) {
    await writeFile(target.vaultPath, serializeVaultData(vaultData), { encoding: "utf8", mode: 0o600 });
  }
  return {
    target,
    vaultData,
  };
};

export const getVault = async (context: RuntimeTransportContext): Promise<RuntimeApiVaultResponse> => {
  const { target, vaultData } = await loadManagedVaultData(context);
  return {
    filePath: target.vaultPath,
    content: serializeVaultData(vaultData),
  };
};

export const updateVault = async (
  context: RuntimeTransportContext,
  payload: RuntimeApiUpdateVaultRequest,
): Promise<RuntimeApiUpdateVaultResponse> => {
  const target = await resolveManagedVaultTarget(context);
  const parsed = parseVaultJsonText(payload.content);
  sanitizeVaultData(parsed);
  const serialized = serializeVaultData(parsed);
  await writeFile(target.vaultPath, serialized, { encoding: "utf8", mode: 0o600 });
  context.addActivity("runtime", "Vault updated");
  return {
    filePath: target.vaultPath,
    savedAt: new Date().toISOString(),
  };
};

export const getSecrets = async (context: RuntimeTransportContext): Promise<RuntimeApiSecretsResponse> => {
  const { target, vaultData } = await loadManagedVaultData(context);
  const entries = SECRET_OPTIONS_INTERNAL.map((option) => toSecretEntry(vaultData, option));
  return {
    filePath: target.vaultPath,
    options: SECRET_OPTIONS,
    entries,
    publicRpcOptions: PUBLIC_RPC_OPTIONS,
    rpcProviderOptions: RPC_PROVIDER_OPTIONS,
  };
};

export const upsertSecret = async (
  context: RuntimeTransportContext,
  payload: RuntimeApiUpsertSecretRequest,
): Promise<RuntimeApiUpsertSecretResponse> => {
  const { target, vaultData } = await loadManagedVaultData(context);

  const option = SECRET_OPTION_BY_ID.get(payload.optionId);
  if (!option) {
    throw new Error(`Unsupported secret option: ${payload.optionId}`);
  }

  const trimmedValue = payload.value.trim();

  if (option.supportsPublicRpc) {
    const source = payload.source === "public" ? "public" : "custom";
    const rpcProviderId = trimString(payload.rpcProviderId) || inferRpcProviderId(vaultData);
    if (!RPC_PROVIDER_BY_ID.has(rpcProviderId)) {
      throw new Error("rpcProviderId must reference a supported private RPC provider");
    }
    setByPath(vaultData, ["rpc", "default", "source"], source);
    setByPath(vaultData, ["rpc", "default", "provider-id"], rpcProviderId);
    if (source === "public") {
      const existingCredential = resolveStoredRpcCredential(vaultData, rpcProviderId);
      if (trimmedValue || existingCredential) {
        updatePrivateRpcVaultState(vaultData, rpcProviderId, trimmedValue || existingCredential);
      }
      const publicRpcOption = PUBLIC_RPC_OPTIONS.find((entry) => entry.id === payload.publicRpcId);
      if (!publicRpcOption) {
        throw new Error("publicRpcId must reference a supported public Solana RPC option");
      }
      setByPath(vaultData, option.pathSegments, publicRpcOption.url);
      setByPath(vaultData, ["rpc", "default", "public-id"], publicRpcOption.id);
      setByPath(vaultData, ["rpc", "default", "ws-url"], resolveWebsocketUrl(publicRpcOption.url));
    } else {
      updatePrivateRpcVaultState(vaultData, rpcProviderId, trimmedValue);
      setByPath(vaultData, ["rpc", "default", "public-id"], "");
    }
  } else {
    setByPath(vaultData, option.pathSegments, trimmedValue);
  }

  const serialized = serializeVaultData(vaultData);
  await writeFile(target.vaultPath, serialized, { encoding: "utf8", mode: 0o600 });

  const entry = toSecretEntry(vaultData, option);
  context.addActivity("runtime", `Secret updated: ${entry.label}`);
  return {
    filePath: target.vaultPath,
    savedAt: new Date().toISOString(),
    entry,
  };
};

export const deleteSecret = async (
  context: RuntimeTransportContext,
  payload: RuntimeApiDeleteSecretRequest,
): Promise<RuntimeApiDeleteSecretResponse> => {
  const { target, vaultData } = await loadManagedVaultData(context);

  const option = SECRET_OPTION_BY_ID.get(payload.optionId);
  if (!option) {
    throw new Error(`Unsupported secret option: ${payload.optionId}`);
  }

  setByPath(vaultData, option.pathSegments, "");
  if (option.supportsPublicRpc) {
    const defaultPublicRpc = PUBLIC_RPC_OPTIONS.find((rpc) => rpc.id === "solana-mainnet-beta") ?? PUBLIC_RPC_OPTIONS[0];
    setByPath(vaultData, ["rpc", "default", "source"], "public");
    setByPath(vaultData, ["rpc", "default", "public-id"], defaultPublicRpc?.id ?? "");
    setByPath(vaultData, ["rpc", "default", "provider-id"], "");
    setByPath(vaultData, ["rpc", "default", "api-key"], "");
    setByPath(vaultData, ["rpc", "default", "ws-url"], defaultPublicRpc ? resolveWebsocketUrl(defaultPublicRpc.url) : "");
    if (defaultPublicRpc) {
      setByPath(vaultData, option.pathSegments, defaultPublicRpc.url);
    }
    for (const provider of RPC_PROVIDER_OPTIONS) {
      setByPath(vaultData, ["rpc", provider.id, "api-key"], "");
      if (option.id === SOLANA_RPC_OPTION_ID) {
        setByPath(vaultData, ["rpc", provider.id, "http-url"], "");
        setByPath(vaultData, ["rpc", provider.id, "ws-url"], "");
      }
    }
  }

  const serialized = serializeVaultData(vaultData);
  await writeFile(target.vaultPath, serialized, { encoding: "utf8", mode: 0o600 });
  context.addActivity("runtime", `Secret cleared: ${option.label}`);
  return {
    filePath: target.vaultPath,
    savedAt: new Date().toISOString(),
  };
};
