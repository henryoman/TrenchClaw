import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const BRAIN_SOURCE_ROOT = "src/ai/brain";
const RUNTIME_STATE_CONTRACT_ROOT = ".runtime-state";
const DEFAULT_WORKSPACE_RUNTIME_STATE_DIRECTORY = ".trenchclaw-dev-runtime";
const INSTANCE_DIRECTORY_PATTERN = /^\d{2}$/u;
const IGNORED_VAULT_STRING_VALUES = new Set(["custom"]);
const WALLET_LIBRARY_FILE_NAME = "wallet-library.jsonl";
const WALLET_LABEL_FILE_SUFFIX = ".label.json";

const resolveAbsoluteEnvPath = (envKey: string, value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${envKey} must not be empty when set.`);
  }
  if (!path.isAbsolute(trimmed)) {
    throw new Error(`${envKey} must be an absolute path. Received "${trimmed}".`);
  }
  return path.resolve(trimmed);
};

const normalizeContractPath = (value: string): string => value.trim().replaceAll("\\", "/").replace(/\/+$/, "");

const isCoreAppRoot = (candidate: string): boolean =>
  (existsSync(path.join(candidate, "src/runtime/bootstrap.ts")) &&
    existsSync(path.join(candidate, "src/runtime/settings/runtimeLoader.ts"))) ||
  existsSync(path.join(candidate, BRAIN_SOURCE_ROOT));

export const resolveCoreAppRoot = (): string => {
  const envRoot = process.env.TRENCHCLAW_APP_ROOT?.trim();
  const releaseRoot = process.env.TRENCHCLAW_RELEASE_ROOT?.trim();
  const candidates = [
    envRoot ? resolveAbsoluteEnvPath("TRENCHCLAW_APP_ROOT", envRoot) : null,
    releaseRoot ? path.join(resolveAbsoluteEnvPath("TRENCHCLAW_RELEASE_ROOT", releaseRoot), "core") : null,
    path.join(path.dirname(process.execPath), "core"),
    path.resolve(RUNTIME_DIRECTORY, "../.."),
    path.resolve(process.cwd(), "apps/trenchclaw"),
  ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);

  for (const candidate of candidates) {
    if (isCoreAppRoot(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to resolve TrenchClaw app root. Checked: ${candidates.join(", ")}. Set TRENCHCLAW_APP_ROOT explicitly.`,
  );
};

export const CORE_APP_ROOT = resolveCoreAppRoot();

const isWorkspaceCoreAppRoot = (candidate: string): boolean =>
  existsSync(path.join(candidate, "package.json"))
  && existsSync(path.join(candidate, "..", "frontends", "gui"));

export const resolveHomeDirectory = (env: NodeJS.ProcessEnv = process.env): string =>
  env.HOME?.trim() || env.USERPROFILE?.trim() || os.homedir();

export const resolveDefaultWorkspaceRuntimeStateRoot = (env: NodeJS.ProcessEnv = process.env): string =>
  path.join(resolveHomeDirectory(env), DEFAULT_WORKSPACE_RUNTIME_STATE_DIRECTORY);

const resolveDefaultRuntimeStateRoot = (): string => {
  if (isWorkspaceCoreAppRoot(CORE_APP_ROOT)) {
    return resolveDefaultWorkspaceRuntimeStateRoot();
  }

  return path.join(os.homedir(), ".trenchclaw");
};

export const DEFAULT_RUNTIME_STATE_ROOT = resolveDefaultRuntimeStateRoot();

export const resolveRuntimeStateRoot = (): string => {
  const configuredRoot = process.env.TRENCHCLAW_RUNTIME_STATE_ROOT?.trim();
  if (!configuredRoot) {
    return DEFAULT_RUNTIME_STATE_ROOT;
  }

  return resolveAbsoluteEnvPath("TRENCHCLAW_RUNTIME_STATE_ROOT", configuredRoot);
};
export const RUNTIME_STATE_ROOT = resolveRuntimeStateRoot();
export const resolveRuntimeInstanceRoot = (): string => path.join(resolveRuntimeStateRoot(), "instances");
export const resolveActiveInstanceStateFile = (): string => path.join(resolveRuntimeInstanceRoot(), "active-instance.json");
export const RUNTIME_INSTANCE_ROOT = path.join(RUNTIME_STATE_ROOT, "instances");
export const RUNTIME_SEED_ROOT = path.join(CORE_APP_ROOT, ".runtime");
export const RUNTIME_SEED_INSTANCE_ID = "00";
export const resolveRuntimeSeedInstanceRoot = (): string =>
  path.join(RUNTIME_SEED_ROOT, "instances", RUNTIME_SEED_INSTANCE_ID);
export const resolveRuntimeSeedInstancePath = (...segments: string[]): string =>
  path.join(resolveRuntimeSeedInstanceRoot(), ...segments);

export const resolveCoreRelativePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(CORE_APP_ROOT, targetPath);

export const resolveRuntimeStatePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(RUNTIME_STATE_ROOT, targetPath);

export const resolveRuntimeContractPath = (targetPath: string): string => {
  if (path.isAbsolute(targetPath)) {
    return path.resolve(targetPath);
  }

  const normalized = normalizeContractPath(targetPath);
  if (normalized === RUNTIME_STATE_CONTRACT_ROOT) {
    return RUNTIME_STATE_ROOT;
  }
  if (normalized.startsWith(`${RUNTIME_STATE_CONTRACT_ROOT}/`)) {
    return resolveRuntimeStatePath(normalized.slice(`${RUNTIME_STATE_CONTRACT_ROOT}/`.length));
  }

  return resolveCoreRelativePath(targetPath);
};

export const toRuntimeContractRelativePath = (absolutePath: string): string => {
  const normalized = path.resolve(absolutePath);
  if (normalized === RUNTIME_STATE_ROOT || normalized.startsWith(`${RUNTIME_STATE_ROOT}${path.sep}`)) {
    const relative = path.relative(RUNTIME_STATE_ROOT, normalized).split(path.sep).join("/");
    return relative.length > 0 ? `${RUNTIME_STATE_CONTRACT_ROOT}/${relative}` : RUNTIME_STATE_CONTRACT_ROOT;
  }

  return path.relative(CORE_APP_ROOT, normalized).split(path.sep).join("/") || ".";
};

const isDirectorySync = (targetPath: string): boolean => {
  try {
    return statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
};

const isFileSync = (targetPath: string): boolean => {
  try {
    return statSync(targetPath).isFile();
  } catch {
    return false;
  }
};

const listInstanceIdsSync = (runtimeRoot: string): string[] => {
  const instancesRoot = path.join(runtimeRoot, "instances");
  if (!isDirectorySync(instancesRoot)) {
    return [];
  }

  return readdirSync(instancesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && INSTANCE_DIRECTORY_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .toSorted((left, right) => left.localeCompare(right));
};

const readNonEmptyVaultStringCountSync = (vaultPath: string): number => {
  if (!isFileSync(vaultPath)) {
    return 0;
  }

  try {
    const parsed = JSON.parse(readFileSync(vaultPath, "utf8")) as unknown;
    let count = 0;
    const walk = (value: unknown): void => {
      if (typeof value === "string") {
        const normalized = value.trim();
        if (normalized.length > 0 && !IGNORED_VAULT_STRING_VALUES.has(normalized)) {
          count += 1;
        }
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (value && typeof value === "object") {
        Object.values(value as Record<string, unknown>).forEach(walk);
      }
    };
    walk(parsed);
    return count;
  } catch {
    return 0;
  }
};

const directoryHasManagedWalletFilesSync = (directoryPath: string): boolean => {
  if (!isDirectorySync(directoryPath)) {
    return false;
  }

  const walk = (currentPath: string): boolean => {
    const entries = readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (walk(absolutePath)) {
          return true;
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (entry.name === ".gitkeep" || entry.name === ".keep") {
        continue;
      }

      if (entry.name === WALLET_LIBRARY_FILE_NAME && statSync(absolutePath).size > 0) {
        return true;
      }

      if (entry.name.endsWith(".json") && !entry.name.endsWith(WALLET_LABEL_FILE_SUFFIX)) {
        return true;
      }
    }
    return false;
  };

  return walk(directoryPath);
};

const directoryHasUserFilesSync = (directoryPath: string): boolean => {
  if (!isDirectorySync(directoryPath)) {
    return false;
  }

  const walk = (currentPath: string): boolean => {
    const entries = readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (walk(absolutePath)) {
          return true;
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (entry.name === ".gitkeep" || entry.name === ".keep") {
        continue;
      }

      return true;
    }
    return false;
  };

  return walk(directoryPath);
};

export const runtimeRootHasMaterialStateSync = (runtimeRoot: string): boolean => {
  const instancesRoot = path.join(runtimeRoot, "instances");
  if (!isDirectorySync(instancesRoot)) {
    return false;
  }

  for (const instanceId of listInstanceIdsSync(runtimeRoot)) {
    const instanceRoot = path.join(runtimeRoot, "instances", instanceId);
    if (directoryHasManagedWalletFilesSync(path.join(instanceRoot, "keypairs"))) {
      return true;
    }
    if (readNonEmptyVaultStringCountSync(path.join(instanceRoot, "secrets", "vault.json")) > 0) {
      return true;
    }
    if (directoryHasUserFilesSync(path.join(instanceRoot, "workspace"))) {
      return true;
    }
  }

  return false;
};

export const resolvePreferredWorkspaceRuntimeStateRoot = (input: {
  coreAppRoot: string;
  env?: NodeJS.ProcessEnv;
}): string => {
  const env = input.env ?? process.env;
  const defaultRoot = resolveDefaultWorkspaceRuntimeStateRoot(env);

  if (runtimeRootHasMaterialStateSync(defaultRoot)) {
    return defaultRoot;
  }

  return defaultRoot;
};
