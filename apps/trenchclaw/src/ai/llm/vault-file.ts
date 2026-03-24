import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveCurrentActiveInstanceIdSync } from "../../runtime/instance/state";
import { resolveInstanceSecretsRoot } from "../../runtime/instance/paths";
import { resolveRuntimeSeedInstancePath } from "../../runtime/runtime-paths";
import { isRecord } from "./shared";

const isBlankValue = (value: unknown): boolean => {
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.every((entry) => isBlankValue(entry));
  }
  if (isRecord(value)) {
    return Object.values(value).every((entry) => isBlankValue(entry));
  }
  return value == null;
};

const deleteByPath = (root: Record<string, unknown>, segments: readonly string[]): boolean => {
  if (segments.length === 0) {
    return false;
  }

  const parents: Array<{ node: Record<string, unknown>; key: string }> = [];
  let current: Record<string, unknown> | undefined = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    if (!key || !current || !isRecord(current[key])) {
      return false;
    }
    parents.push({ node: current, key });
    current = current[key] as Record<string, unknown>;
  }

  const leafKey = segments[segments.length - 1];
  if (!leafKey || !current || !(leafKey in current)) {
    return false;
  }

  delete current[leafKey];

  for (let index = parents.length - 1; index >= 0; index -= 1) {
    const parent = parents[index];
    if (!parent) {
      continue;
    }
    const child = parent.node[parent.key];
    if (!isRecord(child) || Object.keys(child).length > 0) {
      break;
    }
    delete parent.node[parent.key];
  }

  return true;
};

export const sanitizeVaultData = (vaultData: Record<string, unknown>): { changed: boolean } => {
  return { changed: deleteByPath(vaultData, ["wallet", "ultra-signer"]) };
};

const VAULT_FILE_ENV = "TRENCHCLAW_VAULT_FILE";
const VAULT_TEMPLATE_FILE_ENV = "TRENCHCLAW_VAULT_TEMPLATE_FILE";
const INSTANCE_VAULT_FILE_NAME = "vault.json";
const NO_ACTIVE_INSTANCE_VAULT_MESSAGE =
  "No active instance selected. Vaults are instance-scoped. Sign in before accessing secrets.";

export interface ResolvedVaultFile {
  vaultPath: string | null;
  seedPath: string;
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
  path.join(resolveInstanceSecretsRoot(instanceId), INSTANCE_VAULT_FILE_NAME);

export const resolveVaultFile = (input?: {
  activeInstanceId?: string | null;
}): ResolvedVaultFile => {
  const explicitVaultPath = process.env[VAULT_FILE_ENV]?.trim() || null;
  const activeInstanceId = input?.activeInstanceId ?? resolveCurrentActiveInstanceIdSync();
  const seedPath = path.resolve(
    process.env[VAULT_TEMPLATE_FILE_ENV] ?? resolveRuntimeSeedInstancePath("secrets", "vault.json"),
  );

  if (explicitVaultPath) {
    return {
      vaultPath: explicitVaultPath,
      seedPath,
      activeInstanceId,
      explicitVaultPath,
    };
  }

  return {
    vaultPath: activeInstanceId ? resolveInstanceVaultPath(activeInstanceId) : null,
    seedPath,
    activeInstanceId,
    explicitVaultPath: null,
  };
};

const parseVaultFile = async (filePath: string): Promise<Record<string, unknown>> =>
  parseVaultJsonText(await readFile(filePath, "utf8"));

export const ensureVaultFileExists = async (input: {
  vaultPath: string;
  seedPath?: string;
}): Promise<{ created: boolean }> => {
  const targetPath = path.resolve(input.vaultPath);
  try {
    const existing = await stat(targetPath);
    if (!existing.isFile()) {
      throw new Error(`Vault path exists but is not a file: "${targetPath}"`);
    }
    return { created: false };
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  const resolvedSeedPath = path.resolve(input.seedPath ?? resolveRuntimeSeedInstancePath("secrets", "vault.json"));
  const content = await readFile(resolvedSeedPath, "utf8").catch((error) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`Runtime seed is missing vault file: "${resolvedSeedPath}"`);
    }
    throw error;
  });
  await writeFile(targetPath, content, { encoding: "utf8", mode: 0o600 });
  try {
    await chmod(targetPath, 0o600);
  } catch {
    // Best-effort only (for platforms/filesystems without POSIX permission support).
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

export const resolveRequiredVaultFile = (input?: {
  activeInstanceId?: string | null;
}): { vaultPath: string; seedPath: string; activeInstanceId: string | null; explicitVaultPath: string | null } => {
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
  seedPath: string;
  activeInstanceId: string | null;
  explicitVaultPath: string | null;
  vaultData: Record<string, unknown>;
}> => {
  const resolved = resolveVaultFile(input);
  if (!resolved.vaultPath) {
    return {
      ...resolved,
      vaultData: {},
    };
  }

  const ensured = await ensureVaultFileExists({
    vaultPath: resolved.vaultPath,
    seedPath: resolved.seedPath,
  });

  return {
    ...resolved,
    seedPath: resolved.seedPath,
    vaultData: await parseVaultFile(resolved.vaultPath),
  };
};
