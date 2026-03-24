import { readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const INSTANCE_DIRECTORY_PATTERN = /^\d{2}$/u;
const IGNORED_VAULT_STRING_VALUES = new Set(["custom"]);
const WALLET_LIBRARY_FILE_NAME = "wallet-library.jsonl";
const WALLET_LABEL_FILE_SUFFIX = ".label.json";

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

export const resolveHomeDirectory = (env: NodeJS.ProcessEnv = process.env): string =>
  env.HOME?.trim() || env.USERPROFILE?.trim() || os.homedir();

export const resolveDefaultWorkspaceRuntimeStateRoot = (env: NodeJS.ProcessEnv = process.env): string =>
  path.join(resolveHomeDirectory(env), ".trenchclaw-dev-runtime");

export const resolveLegacyWorkspaceRuntimeStateRoot = (env: NodeJS.ProcessEnv = process.env): string =>
  path.join(resolveHomeDirectory(env), "trenchclaw-dev-runtime");

export const resolveRepoLocalRuntimeStateRoot = (coreAppRoot: string): string =>
  path.join(path.resolve(coreAppRoot), ".runtime-state");

const listInstanceIdsSync = (runtimeRoot: string): string[] => {
  const instancesRoot = path.join(runtimeRoot, "instances");
  if (!isDirectorySync(instancesRoot)) {
    return [];
  }

  return readdirSync(instancesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && INSTANCE_DIRECTORY_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
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
  const repoLocalRoot = resolveRepoLocalRuntimeStateRoot(input.coreAppRoot);
  const legacyRoot = resolveLegacyWorkspaceRuntimeStateRoot(env);

  if (runtimeRootHasMaterialStateSync(defaultRoot)) {
    return defaultRoot;
  }
  if (runtimeRootHasMaterialStateSync(repoLocalRoot)) {
    return repoLocalRoot;
  }
  if (runtimeRootHasMaterialStateSync(legacyRoot)) {
    return legacyRoot;
  }

  return defaultRoot;
};
