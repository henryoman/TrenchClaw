import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveCurrentActiveInstanceIdSync } from "../../runtime/instance-state";
import { RUNTIME_INSTANCE_ROOT } from "../../runtime/runtime-paths";
import { isRecord, resolvePathFromModule, resolvePreferredPathFromModule } from "./shared";

export const DEFAULT_VAULT_JSON = {
  rpc: {
    default: {
      "http-url": "",
      source: "custom",
      "public-id": "",
    },
    helius: {
      "http-url": "",
      "ws-url": "",
      "api-key": "",
    },
    quicknode: {
      "http-url": "",
      "ws-url": "",
      "api-key": "",
    },
    "solana-vibestation": {
      "api-key": "",
    },
    chainstack: {
      "api-key": "",
    },
    temporal: {
      "api-key": "",
    },
  },
  llm: {
    openrouter: {
      "api-key": "",
    },
    openai: {
      "api-key": "",
    },
    "openai-compatible": {
      "api-key": "",
    },
    gateway: {
      "api-key": "",
      model: "anthropic/claude-sonnet-4.5",
    },
    anthropic: {
      "api-key": "",
    },
    google: {
      "api-key": "",
    },
  },
  integrations: {
    dexscreener: {
      "api-key": "",
    },
    jupiter: {
      "api-key": "",
    },
  },
  wallet: {
    "ultra-signer": {
      "private-key": "",
      "private-key-encoding": "base64",
    },
  },
} as const;

const DEFAULT_RUNTIME_VAULT_FILE = "../../../.runtime-state/runtime/vault.json";
const LEGACY_VAULT_FILE = "../../../.runtime-state/user/vault.json";
const DEFAULT_VAULT_TEMPLATE_FILE = "../config/vault.template.json";
const VAULT_FILE_ENV = "TRENCHCLAW_VAULT_FILE";
const VAULT_TEMPLATE_FILE_ENV = "TRENCHCLAW_VAULT_TEMPLATE_FILE";
const INSTANCE_VAULT_FILE_NAME = "vault.json";
const INSTANCE_SCOPED_VAULT_PATH_PREFIXES = [
  "wallet/ultra-signer",
] as const;

export interface ResolvedVaultPaths {
  runtimeVaultPath: string;
  instanceVaultPath: string | null;
  templatePath: string;
  activeInstanceId: string | null;
  explicitVaultPath: string | null;
}

export interface LoadedVaultLayers extends ResolvedVaultPaths {
  runtimeInitializedFromTemplate: boolean;
  runtimeVaultData: Record<string, unknown>;
  instanceVaultData: Record<string, unknown>;
  mergedVaultData: Record<string, unknown>;
}

const deepMergeRecords = (
  baseValue: Record<string, unknown>,
  overlayValue: Record<string, unknown>,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...baseValue };
  for (const [key, value] of Object.entries(overlayValue)) {
    const currentValue = merged[key];
    if (isRecord(currentValue) && isRecord(value)) {
      merged[key] = deepMergeRecords(currentValue, value);
      continue;
    }
    merged[key] = value;
  }
  return merged;
};

const toPathSegments = (refPath: string): string[] => refPath.split("/").map((segment) => segment.trim()).filter(Boolean);

const hasPath = (root: unknown, segments: string[]): boolean => {
  let current = root;
  for (const segment of segments) {
    if (!isRecord(current) || !(segment in current)) {
      return false;
    }
    current = current[segment];
  }
  return true;
};

export const getByPath = (root: unknown, segments: string[]): unknown => {
  let current = root;
  for (const segment of segments) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
};

export const readVaultString = (root: unknown, refPath: string): string | undefined => {
  const value = getByPath(root, toPathSegments(refPath));
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
};

export const resolveInstanceVaultPath = (instanceId: string): string =>
  path.join(RUNTIME_INSTANCE_ROOT, instanceId, INSTANCE_VAULT_FILE_NAME);

export const isInstanceScopedVaultRef = (refPath: string): boolean =>
  INSTANCE_SCOPED_VAULT_PATH_PREFIXES.some((prefix) => refPath === prefix || refPath.startsWith(`${prefix}/`));

export const resolveVaultPaths = async (input?: {
  activeInstanceId?: string | null;
}): Promise<ResolvedVaultPaths> => {
  const explicitVaultPath = process.env[VAULT_FILE_ENV]?.trim() || null;
  const activeInstanceId = input?.activeInstanceId ?? resolveCurrentActiveInstanceIdSync();
  const templatePath = resolvePathFromModule(
    import.meta.url,
    DEFAULT_VAULT_TEMPLATE_FILE,
    process.env[VAULT_TEMPLATE_FILE_ENV],
  );

  if (explicitVaultPath) {
    return {
      runtimeVaultPath: explicitVaultPath,
      instanceVaultPath: null,
      templatePath,
      activeInstanceId,
      explicitVaultPath,
    };
  }

  const runtimeVaultPath = await resolvePreferredPathFromModule({
    moduleUrl: import.meta.url,
    preferredRelativePath: DEFAULT_RUNTIME_VAULT_FILE,
    legacyRelativePaths: [LEGACY_VAULT_FILE],
  });

  return {
    runtimeVaultPath,
    instanceVaultPath: activeInstanceId ? resolveInstanceVaultPath(activeInstanceId) : null,
    templatePath,
    activeInstanceId,
    explicitVaultPath: null,
  };
};

const parseVaultFile = async (filePath: string): Promise<Record<string, unknown>> =>
  parseVaultJsonText(await readFile(filePath, "utf8"));

const readOptionalVaultFile = async (filePath: string | null): Promise<Record<string, unknown>> => {
  if (!filePath) {
    return {};
  }
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return {};
  }
  return parseVaultFile(filePath);
};

export const ensureVaultFileExists = async (input: {
  vaultPath: string;
  templatePath?: string;
}): Promise<{ initializedFromTemplate: boolean }> => {
  const targetPath = path.resolve(input.vaultPath);
  try {
    const existing = await stat(targetPath);
    if (!existing.isFile()) {
      throw new Error(`Vault path exists but is not a file: "${targetPath}"`);
    }
    return { initializedFromTemplate: false };
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  const templatePath = input.templatePath ? path.resolve(input.templatePath) : undefined;

  let content = `${JSON.stringify(DEFAULT_VAULT_JSON, null, 2)}\n`;
  if (templatePath) {
    try {
      content = await readFile(templatePath, "utf8");
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  await writeFile(targetPath, content, { encoding: "utf8", mode: 0o600 });
  try {
    await chmod(targetPath, 0o600);
  } catch {
    // Best-effort only (for platforms/filesystems without POSIX permission support).
  }

  return { initializedFromTemplate: true };
};

export const ensureVaultOverlayFileExists = async (vaultPath: string): Promise<{ created: boolean }> => {
  const targetPath = path.resolve(vaultPath);
  const file = Bun.file(targetPath);
  if (await file.exists()) {
    return { created: false };
  }

  await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  await writeFile(targetPath, "{}\n", { encoding: "utf8", mode: 0o600 });
  try {
    await chmod(targetPath, 0o600);
  } catch {
    // Best-effort only.
  }
  return { created: true };
};

export const parseVaultJsonText = (value: string): Record<string, unknown> => {
  const parsed = JSON.parse(value) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Vault JSON must be an object at the root.");
  }
  return parsed as Record<string, unknown>;
};

export const loadVaultLayers = async (input?: {
  activeInstanceId?: string | null;
}): Promise<LoadedVaultLayers> => {
  const paths = await resolveVaultPaths(input);
  const runtimeEnsured = await ensureVaultFileExists({
    vaultPath: paths.runtimeVaultPath,
    templatePath: paths.templatePath,
  });
  const runtimeVaultData = await parseVaultFile(paths.runtimeVaultPath);
  const instanceVaultData = await readOptionalVaultFile(paths.instanceVaultPath);

  return {
    ...paths,
    runtimeInitializedFromTemplate: runtimeEnsured.initializedFromTemplate,
    runtimeVaultData,
    instanceVaultData,
    mergedVaultData: deepMergeRecords(runtimeVaultData, instanceVaultData),
  };
};

export const resolveVaultRefSourcePath = (layers: LoadedVaultLayers, refPath: string): string => {
  if (layers.instanceVaultPath && hasPath(layers.instanceVaultData, toPathSegments(refPath))) {
    return layers.instanceVaultPath;
  }
  return layers.runtimeVaultPath;
};
