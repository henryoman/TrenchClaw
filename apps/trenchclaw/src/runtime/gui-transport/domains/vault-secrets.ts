import { readFile, writeFile } from "node:fs/promises";
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
import {
  ensureVaultFileExists,
  parseVaultJsonText,
  resolveRequiredVaultFile,
  sanitizeVaultData,
} from "../../../ai/llm/vault-file";
import { assertInstanceSystemWritePath } from "../../security/write-scope";
import { PUBLIC_RPC_OPTIONS, SECRET_OPTIONS } from "../constants";
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

const resolveManagedVaultTarget = async () => {
  const resolved = resolveRequiredVaultFile();
  if (!resolved.explicitVaultPath) {
    assertInstanceSystemWritePath(resolved.vaultPath, "access instance vault");
  }
  const ensured = await ensureVaultFileExists({
    vaultPath: resolved.vaultPath,
    templatePath: resolved.templatePath,
  });
  return {
    ...resolved,
    initializedFromTemplate: ensured.initializedFromTemplate,
  };
};

const serializeVaultData = (vaultData: Record<string, unknown>): string => `${JSON.stringify(vaultData, null, 2)}\n`;

const loadManagedVaultData = async () => {
  const target = await resolveManagedVaultTarget();
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

export const getVault = async (): Promise<GuiVaultResponse> => {
  const { target, vaultData } = await loadManagedVaultData();
  return {
    filePath: target.vaultPath,
    templatePath: target.templatePath,
    initializedFromTemplate: target.initializedFromTemplate,
    content: serializeVaultData(vaultData),
  };
};

export const updateVault = async (
  context: RuntimeGuiDomainContext,
  payload: GuiUpdateVaultRequest,
): Promise<GuiUpdateVaultResponse> => {
  const target = await resolveManagedVaultTarget();
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

export const getSecrets = async (): Promise<GuiSecretsResponse> => {
  const { target, vaultData } = await loadManagedVaultData();
  const entries = SECRET_OPTIONS_INTERNAL.map((option) => toSecretEntry(vaultData, option));
  return {
    filePath: target.vaultPath,
    templatePath: target.templatePath,
    initializedFromTemplate: target.initializedFromTemplate,
    options: SECRET_OPTIONS,
    entries,
    publicRpcOptions: PUBLIC_RPC_OPTIONS,
  };
};

export const upsertSecret = async (
  context: RuntimeGuiDomainContext,
  payload: GuiUpsertSecretRequest,
): Promise<GuiUpsertSecretResponse> => {
  const { target, vaultData } = await loadManagedVaultData();

  const option = SECRET_OPTION_BY_ID.get(payload.optionId);
  if (!option) {
    throw new Error(`Unsupported secret option: ${payload.optionId}`);
  }

  const trimmedValue = payload.value.trim();
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
  context: RuntimeGuiDomainContext,
  payload: GuiDeleteSecretRequest,
): Promise<GuiDeleteSecretResponse> => {
  const { target, vaultData } = await loadManagedVaultData();

  const option = SECRET_OPTION_BY_ID.get(payload.optionId);
  if (!option) {
    throw new Error(`Unsupported secret option: ${payload.optionId}`);
  }

  setByPath(vaultData, option.pathSegments, "");
  if (option.supportsPublicRpc) {
    setByPath(vaultData, ["rpc", "default", "source"], "custom");
    setByPath(vaultData, ["rpc", "default", "public-id"], "");
  }

  const serialized = serializeVaultData(vaultData);
  await writeFile(target.vaultPath, serialized, { encoding: "utf8", mode: 0o600 });
  context.addActivity("runtime", `Secret cleared: ${option.label}`);
  return {
    filePath: target.vaultPath,
    savedAt: new Date().toISOString(),
  };
};
