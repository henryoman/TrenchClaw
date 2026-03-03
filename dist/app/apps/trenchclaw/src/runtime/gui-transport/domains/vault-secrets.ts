import { mkdir, readFile, writeFile } from "node:fs/promises";
import type {
  GuiDeleteSecretRequest,
  GuiDeleteSecretResponse,
  GuiSecretEntryView,
  GuiSecretOptionView,
  GuiSecretsResponse,
  GuiUpdateVaultRequest,
  GuiUpdateVaultResponse,
  GuiUpsertSecretRequest,
  GuiUpsertSecretResponse,
  GuiVaultResponse,
} from "@trenchclaw/types";
import { ensureVaultFileExists, parseVaultJsonText } from "../../../ai/llm/vault-file";
import { assertProtectedNoReadWritePath } from "../../security/write-scope";
import { NO_READ_DIRECTORY, PUBLIC_RPC_OPTIONS, SECRET_OPTIONS, VAULT_FILE_PATH, VAULT_TEMPLATE_FILE_PATH } from "../constants";
import { isRecord } from "../parsers";
import type { RuntimeGuiDomainContext } from "../contracts";

interface SecretOptionInternal extends GuiSecretOptionView {
  pathSegments: string[];
}

const SECRET_OPTIONS_INTERNAL: SecretOptionInternal[] = SECRET_OPTIONS.map((option) => ({
  ...option,
  pathSegments: option.vaultPath.split("/").filter(Boolean),
}));

const SECRET_OPTION_BY_ID = new Map(SECRET_OPTIONS_INTERNAL.map((option) => [option.id, option]));

const OPENROUTER_CREDITS_URL = "https://openrouter.ai/api/v1/credits";

const validateOpenRouterApiKey = async (apiKey: string): Promise<void> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(OPENROUTER_CREDITS_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    if (response.ok) {
      return;
    }

    let providerMessage = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as unknown;
      if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
        providerMessage = payload.error.message;
      }
    } catch {
      // Fall back to status text when provider response body cannot be parsed.
      providerMessage = response.statusText || providerMessage;
    }

    throw new Error(`OpenRouter rejected this API key: ${providerMessage}`);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenRouter key validation timed out. Check your network and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

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

const toSecretEntry = (vaultData: Record<string, unknown>, option: SecretOptionInternal): GuiSecretEntryView => {
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
    };
  }

  const sourceRaw = getByPath(vaultData, ["rpc", "default", "source"]);
  const source = sourceRaw === "public" ? "public" : "custom";
  const publicRpcRaw = getByPath(vaultData, ["rpc", "default", "public-id"]);
  const publicRpcId = typeof publicRpcRaw === "string" && publicRpcRaw.trim().length > 0 ? publicRpcRaw : null;

  return {
    optionId: option.id,
    category: option.category,
    label: option.label,
    vaultPath: option.vaultPath,
    value,
    source,
    publicRpcId,
  };
};

export const getVault = async (): Promise<GuiVaultResponse> => {
  assertProtectedNoReadWritePath(NO_READ_DIRECTORY, "initialize vault directory");
  await mkdir(NO_READ_DIRECTORY, { recursive: true, mode: 0o700 });
  const created = await ensureVaultFileExists({
    vaultPath: VAULT_FILE_PATH,
    templatePath: VAULT_TEMPLATE_FILE_PATH,
  });
  assertProtectedNoReadWritePath(VAULT_FILE_PATH, "read vault file");
  const content = await readFile(VAULT_FILE_PATH, "utf8");
  parseVaultJsonText(content);
  return {
    filePath: VAULT_FILE_PATH,
    templatePath: VAULT_TEMPLATE_FILE_PATH,
    initializedFromTemplate: created.initializedFromTemplate,
    content,
  };
};

export const updateVault = async (
  context: RuntimeGuiDomainContext,
  payload: GuiUpdateVaultRequest,
): Promise<GuiUpdateVaultResponse> => {
  assertProtectedNoReadWritePath(NO_READ_DIRECTORY, "initialize vault directory");
  await mkdir(NO_READ_DIRECTORY, { recursive: true, mode: 0o700 });
  await ensureVaultFileExists({
    vaultPath: VAULT_FILE_PATH,
    templatePath: VAULT_TEMPLATE_FILE_PATH,
  });
  const parsed = parseVaultJsonText(payload.content);
  const serialized = `${JSON.stringify(parsed, null, 2)}\n`;
  assertProtectedNoReadWritePath(VAULT_FILE_PATH, "write vault file");
  await writeFile(VAULT_FILE_PATH, serialized, { encoding: "utf8", mode: 0o600 });
  context.addActivity("runtime", "Vault updated");
  return {
    filePath: VAULT_FILE_PATH,
    savedAt: new Date().toISOString(),
  };
};

export const getSecrets = async (): Promise<GuiSecretsResponse> => {
  assertProtectedNoReadWritePath(NO_READ_DIRECTORY, "initialize vault directory");
  await mkdir(NO_READ_DIRECTORY, { recursive: true, mode: 0o700 });
  const created = await ensureVaultFileExists({
    vaultPath: VAULT_FILE_PATH,
    templatePath: VAULT_TEMPLATE_FILE_PATH,
  });
  assertProtectedNoReadWritePath(VAULT_FILE_PATH, "read vault file");
  const content = await readFile(VAULT_FILE_PATH, "utf8");
  const vaultData = parseVaultJsonText(content);
  const entries = SECRET_OPTIONS_INTERNAL.map((option) => toSecretEntry(vaultData, option));
  return {
    filePath: VAULT_FILE_PATH,
    templatePath: VAULT_TEMPLATE_FILE_PATH,
    initializedFromTemplate: created.initializedFromTemplate,
    options: SECRET_OPTIONS,
    entries,
    publicRpcOptions: PUBLIC_RPC_OPTIONS,
  };
};

export const upsertSecret = async (
  context: RuntimeGuiDomainContext,
  payload: GuiUpsertSecretRequest,
): Promise<GuiUpsertSecretResponse> => {
  assertProtectedNoReadWritePath(NO_READ_DIRECTORY, "initialize vault directory");
  await mkdir(NO_READ_DIRECTORY, { recursive: true, mode: 0o700 });
  await ensureVaultFileExists({
    vaultPath: VAULT_FILE_PATH,
    templatePath: VAULT_TEMPLATE_FILE_PATH,
  });

  const option = SECRET_OPTION_BY_ID.get(payload.optionId);
  if (!option) {
    throw new Error(`Unsupported secret option: ${payload.optionId}`);
  }

  assertProtectedNoReadWritePath(VAULT_FILE_PATH, "read vault file");
  const content = await readFile(VAULT_FILE_PATH, "utf8");
  const vaultData = parseVaultJsonText(content);
  const trimmedValue = payload.value.trim();
  if (option.id === "openrouter-api-key" && trimmedValue.length > 0) {
    await validateOpenRouterApiKey(trimmedValue);
  }
  setByPath(vaultData, option.pathSegments, trimmedValue);

  if (option.supportsPublicRpc) {
    const source = payload.source === "public" ? "public" : "custom";
    setByPath(vaultData, ["rpc", "default", "source"], source);
    if (source === "public") {
      const publicRpcOption = PUBLIC_RPC_OPTIONS.find((entry) => entry.id === payload.publicRpcId);
      if (!publicRpcOption) {
        throw new Error("publicRpcId must reference a supported public Solana RPC option");
      }
      setByPath(vaultData, option.pathSegments, publicRpcOption.url);
      setByPath(vaultData, ["rpc", "default", "public-id"], publicRpcOption.id);
    } else {
      setByPath(vaultData, ["rpc", "default", "public-id"], "");
    }
  }

  const serialized = `${JSON.stringify(vaultData, null, 2)}\n`;
  assertProtectedNoReadWritePath(VAULT_FILE_PATH, "write vault file");
  await writeFile(VAULT_FILE_PATH, serialized, { encoding: "utf8", mode: 0o600 });

  const entry = toSecretEntry(vaultData, option);
  context.addActivity("runtime", `Secret updated: ${entry.label}`);
  return {
    filePath: VAULT_FILE_PATH,
    savedAt: new Date().toISOString(),
    entry,
  };
};

export const deleteSecret = async (
  context: RuntimeGuiDomainContext,
  payload: GuiDeleteSecretRequest,
): Promise<GuiDeleteSecretResponse> => {
  assertProtectedNoReadWritePath(NO_READ_DIRECTORY, "initialize vault directory");
  await mkdir(NO_READ_DIRECTORY, { recursive: true, mode: 0o700 });
  await ensureVaultFileExists({
    vaultPath: VAULT_FILE_PATH,
    templatePath: VAULT_TEMPLATE_FILE_PATH,
  });

  const option = SECRET_OPTION_BY_ID.get(payload.optionId);
  if (!option) {
    throw new Error(`Unsupported secret option: ${payload.optionId}`);
  }

  assertProtectedNoReadWritePath(VAULT_FILE_PATH, "read vault file");
  const content = await readFile(VAULT_FILE_PATH, "utf8");
  const vaultData = parseVaultJsonText(content);
  setByPath(vaultData, option.pathSegments, "");
  if (option.supportsPublicRpc) {
    setByPath(vaultData, ["rpc", "default", "source"], "custom");
    setByPath(vaultData, ["rpc", "default", "public-id"], "");
  }

  const serialized = `${JSON.stringify(vaultData, null, 2)}\n`;
  assertProtectedNoReadWritePath(VAULT_FILE_PATH, "write vault file");
  await writeFile(VAULT_FILE_PATH, serialized, { encoding: "utf8", mode: 0o600 });
  context.addActivity("runtime", `Secret cleared: ${option.label}`);
  return {
    filePath: VAULT_FILE_PATH,
    savedAt: new Date().toISOString(),
  };
};
