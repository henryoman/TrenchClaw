import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveCurrentActiveInstanceIdSync } from "../../runtime/instance-state";
import { RUNTIME_INSTANCE_ROOT } from "../../runtime/runtime-paths";
import { isRecord, resolvePathFromModule } from "./shared";

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
    gateway: {
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

const DEFAULT_VAULT_TEMPLATE_FILE = "../config/vault.template.json";
const VAULT_FILE_ENV = "TRENCHCLAW_VAULT_FILE";
const VAULT_TEMPLATE_FILE_ENV = "TRENCHCLAW_VAULT_TEMPLATE_FILE";
const INSTANCE_VAULT_FILE_NAME = "vault.json";
const NO_ACTIVE_INSTANCE_VAULT_MESSAGE =
  "No active instance selected. Vaults are instance-scoped. Sign in before accessing secrets.";

export interface ResolvedVaultFile {
  vaultPath: string | null;
  templatePath: string;
  activeInstanceId: string | null;
  explicitVaultPath: string | null;
}

const toPathSegments = (refPath: string): string[] => refPath.split("/").map((segment) => segment.trim()).filter(Boolean);

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

export const resolveVaultFile = (input?: {
  activeInstanceId?: string | null;
}): ResolvedVaultFile => {
  const explicitVaultPath = process.env[VAULT_FILE_ENV]?.trim() || null;
  const activeInstanceId = input?.activeInstanceId ?? resolveCurrentActiveInstanceIdSync();
  const templatePath = resolvePathFromModule(
    import.meta.url,
    DEFAULT_VAULT_TEMPLATE_FILE,
    process.env[VAULT_TEMPLATE_FILE_ENV],
  );

  if (explicitVaultPath) {
    return {
      vaultPath: explicitVaultPath,
      templatePath,
      activeInstanceId,
      explicitVaultPath,
    };
  }

  return {
    vaultPath: activeInstanceId ? resolveInstanceVaultPath(activeInstanceId) : null,
    templatePath,
    activeInstanceId,
    explicitVaultPath: null,
  };
};

const parseVaultFile = async (filePath: string): Promise<Record<string, unknown>> =>
  parseVaultJsonText(await readFile(filePath, "utf8"));

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

export const parseVaultJsonText = (value: string): Record<string, unknown> => {
  const parsed = JSON.parse(value) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Vault JSON must be an object at the root.");
  }
  return parsed as Record<string, unknown>;
};

export const resolveRequiredVaultFile = (input?: {
  activeInstanceId?: string | null;
}): { vaultPath: string; templatePath: string; activeInstanceId: string | null; explicitVaultPath: string | null } => {
  const resolved = resolveVaultFile(input);
  if (resolved.vaultPath) {
    return {
      ...resolved,
      vaultPath: resolved.vaultPath,
    };
  }
  throw new Error(NO_ACTIVE_INSTANCE_VAULT_MESSAGE);
};

export const loadVaultData = async (input?: {
  activeInstanceId?: string | null;
}): Promise<{
  vaultPath: string | null;
  templatePath: string;
  activeInstanceId: string | null;
  explicitVaultPath: string | null;
  initializedFromTemplate: boolean;
  vaultData: Record<string, unknown>;
}> => {
  const resolved = resolveVaultFile(input);
  if (!resolved.vaultPath) {
    return {
      ...resolved,
      initializedFromTemplate: false,
      vaultData: {},
    };
  }

  const ensured = await ensureVaultFileExists({
    vaultPath: resolved.vaultPath,
    templatePath: resolved.templatePath,
  });

  return {
    ...resolved,
    initializedFromTemplate: ensured.initializedFromTemplate,
    vaultData: await parseVaultFile(resolved.vaultPath),
  };
};
