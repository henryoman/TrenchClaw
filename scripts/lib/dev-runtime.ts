import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  INSTANCE_LAYOUT_DIRECTORY_PATHS,
  INSTANCE_LAYOUT_FILE_PATHS,
} from "../../apps/trenchclaw/src/runtime/instance/layoutSchema";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CORE_APP_ROOT = path.join(REPO_ROOT, "apps", "trenchclaw");
const RUNTIME_SEED_ROOT = path.join(CORE_APP_ROOT, ".runtime");
const REPO_LOCAL_RUNTIME_ROOT = path.join(CORE_APP_ROOT, ".runtime-state");
const TEMPLATE_INSTANCE_ID = "00";
const INSTANCE_ID_PATTERN = /^\d{2}$/u;
const INSTANCE_DIRECTORY_PATTERN = /^\d{2}$/u;
const GITIGNORE_MARKER_START = "# >>> trenchclaw dev runtime >>>";
const GITIGNORE_MARKER_END = "# <<< trenchclaw dev runtime <<<";
const DEFAULT_INSTANCE_NAME = "default";
const IGNORED_VAULT_STRING_VALUES = new Set(["custom"]);
const WALLET_LIBRARY_FILE_NAME = "wallet-library.jsonl";
const WALLET_LABEL_FILE_SUFFIX = ".label.json";

const DEV_RUNTIME_GITIGNORE_BLOCK = [
  GITIGNORE_MARKER_START,
  "/.backups/",
  "/instances/*/secrets/vault.json",
  "/instances/*/keypairs/",
  "/instances/*/data/",
  "/instances/*/logs/",
  "/instances/*/cache/",
  "/instances/*/tmp/",
  "/instances/*/shell-home/",
  "/instances/*/tool-bin/",
  GITIGNORE_MARKER_END,
].join("\n");

export const DEV_INSTANCE_CLONE_PARTS = ["profile", "settings", "wallets", "db", "logs", "workspace", "all"] as const;

export type DevInstanceClonePart = typeof DEV_INSTANCE_CLONE_PARTS[number];

export interface DeveloperRuntimeInitInput {
  runtimeRoot?: string;
  generatedRoot?: string;
  instanceId?: string;
  instanceName?: string;
  writeGitignore?: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface DeveloperRuntimeInitResult {
  runtimeRoot: string;
  generatedRoot: string;
  instanceId: string;
  instanceRoot: string;
}

export interface CloneDeveloperInstanceInput {
  fromRoot: string;
  toRoot: string;
  fromInstanceId?: string;
  toInstanceId?: string;
  parts?: DevInstanceClonePart[];
  setActive?: boolean;
}

export interface CloneDeveloperInstanceResult {
  fromRoot: string;
  toRoot: string;
  fromInstanceId: string;
  toInstanceId: string;
  parts: DevInstanceClonePart[];
  copiedPaths: string[];
}

const resolveAbsolutePath = (value: string, label: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} must not be empty.`);
  }
  return path.resolve(trimmed);
};

const resolveHomeDirectory = (env: NodeJS.ProcessEnv = process.env): string =>
  env.HOME?.trim() || env.USERPROFILE?.trim() || os.homedir();

const resolveDefaultDeveloperRuntimeRoot = (env: NodeJS.ProcessEnv = process.env): string =>
  path.join(resolveHomeDirectory(env), ".trenchclaw-dev-runtime");

const normalizeInstanceId = (value: string | undefined, fallback = TEMPLATE_INSTANCE_ID): string => {
  const candidate = (value ?? fallback).trim();
  if (!INSTANCE_ID_PATTERN.test(candidate)) {
    throw new Error(`Instance id must be two digits. Received "${value ?? fallback}".`);
  }
  return candidate;
};

const fileExists = async (targetPath: string): Promise<boolean> => {
  try {
    return (await stat(targetPath)).isFile();
  } catch {
    return false;
  }
};

const directoryExists = async (targetPath: string): Promise<boolean> => {
  try {
    return (await stat(targetPath)).isDirectory();
  } catch {
    return false;
  }
};

const ensureDirectory = async (targetPath: string): Promise<void> => {
  await mkdir(targetPath, { recursive: true });
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

const copyFileIfExists = async (sourcePath: string, destinationPath: string): Promise<boolean> => {
  if (!(await fileExists(sourcePath))) {
    return false;
  }
  await ensureDirectory(path.dirname(destinationPath));
  await cp(sourcePath, destinationPath);
  return true;
};

const copyFileIfMissing = async (sourcePath: string, destinationPath: string): Promise<boolean> => {
  if (!(await fileExists(sourcePath)) || (await fileExists(destinationPath))) {
    return false;
  }
  await ensureDirectory(path.dirname(destinationPath));
  await cp(sourcePath, destinationPath);
  return true;
};

const copyDirectoryIfExists = async (sourcePath: string, destinationPath: string): Promise<boolean> => {
  if (!(await directoryExists(sourcePath))) {
    return false;
  }
  await ensureDirectory(path.dirname(destinationPath));
  await rm(destinationPath, { recursive: true, force: true });
  await cp(sourcePath, destinationPath, { recursive: true });
  return true;
};

const writeJson = async (targetPath: string, value: unknown): Promise<void> => {
  await ensureDirectory(path.dirname(targetPath));
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const writeJsonIfMissing = async (targetPath: string, value: unknown): Promise<boolean> => {
  if (await fileExists(targetPath)) {
    return false;
  }
  await writeJson(targetPath, value);
  return true;
};

const updateGitignoreBlock = async (targetPath: string): Promise<void> => {
  let existing = "";
  if (await fileExists(targetPath)) {
    existing = await readFile(targetPath, "utf8");
  }

  const blockPattern = new RegExp(
    `${GITIGNORE_MARKER_START}[\\s\\S]*?${GITIGNORE_MARKER_END}\\n?`,
    "u",
  );
  const normalizedExisting = existing.replace(blockPattern, "").replace(/\s*$/u, "");
  const next = normalizedExisting.length > 0
    ? `${normalizedExisting}\n\n${DEV_RUNTIME_GITIGNORE_BLOCK}\n`
    : `${DEV_RUNTIME_GITIGNORE_BLOCK}\n`;
  await writeFile(targetPath, next, "utf8");
};

const writeRuntimeReadme = async (runtimeRoot: string, generatedRoot: string, instanceId: string): Promise<void> => {
  const readmePath = path.join(runtimeRoot, "README.md");
  const content = [
    "# TrenchClaw Developer Runtime",
    "",
    "This directory is an external developer runtime root.",
    "",
    "Use it with:",
    "",
    "```bash",
    `export TRENCHCLAW_RUNTIME_STATE_ROOT="${runtimeRoot}"`,
    "bun run scripts/dev-bootstrap.ts",
    "```",
    "",
    `Active developer instance: ${instanceId}`,
    `Generated artifacts: ${generatedRoot}`,
    "",
    "The runtime format matches the shipped product layout under instances/<id>/...,",
    "including generated prompt-support artifacts under instances/<id>/cache/generated/.",
    "This root is intentionally separate from the main repository.",
  ].join("\n");
  await writeFile(readmePath, `${content}\n`, "utf8");
};

const shouldWriteRuntimeReadme = (runtimeRoot: string): boolean =>
  path.resolve(runtimeRoot) !== path.resolve(REPO_LOCAL_RUNTIME_ROOT);

const seedInstancePath = (...segments: string[]): string =>
  path.join(RUNTIME_SEED_ROOT, "instances", TEMPLATE_INSTANCE_ID, ...segments);

const runtimeInstancePath = (runtimeRoot: string, instanceId: string, ...segments: string[]): string =>
  path.join(runtimeRoot, "instances", instanceId, ...segments);

const resolveDefaultGeneratedRoot = (runtimeRoot: string, instanceId: string): string =>
  runtimeInstancePath(runtimeRoot, instanceId, "cache", "generated");

const runtimeBackupsRoot = (runtimeRoot: string): string => path.join(runtimeRoot, ".backups");

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

const runtimeRootHasMaterialStateSync = (runtimeRoot: string): boolean => {
  const instancesRoot = path.join(runtimeRoot, "instances");
  if (!isDirectorySync(instancesRoot)) {
    return false;
  }

  for (const instanceId of listInstanceIdsSync(runtimeRoot)) {
    const instanceRoot = runtimeInstancePath(runtimeRoot, instanceId);
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

const resolvePreferredDeveloperRuntimeRoot = (env: NodeJS.ProcessEnv = process.env): string => {
  const defaultRoot = resolveDefaultDeveloperRuntimeRoot(env);
  if (runtimeRootHasMaterialStateSync(defaultRoot)) {
    return defaultRoot;
  }

  return defaultRoot;
};

const toDefaultInstanceName = (instanceId: string): string =>
  instanceId === TEMPLATE_INSTANCE_ID ? DEFAULT_INSTANCE_NAME : `instance-${instanceId}`;

const syncTemplateInstanceMissingEntries = async (runtimeRoot: string, instanceId: string): Promise<void> => {
  const sourceRoot = seedInstancePath();
  const destinationRoot = runtimeInstancePath(runtimeRoot, instanceId);

  const walk = async (sourcePath: string, destinationPath: string): Promise<void> => {
    const entries = await readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      const nextSourcePath = path.join(sourcePath, entry.name);
      const nextDestinationPath = path.join(destinationPath, entry.name);
      if (entry.isDirectory()) {
        await ensureDirectory(nextDestinationPath);
        await walk(nextSourcePath, nextDestinationPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (path.relative(sourceRoot, nextSourcePath) === "instance.json") {
        continue;
      }

      await copyFileIfMissing(nextSourcePath, nextDestinationPath);
    }
  };

  await ensureDirectory(destinationRoot);
  await walk(sourceRoot, destinationRoot);
};

const materializeDeveloperInstanceLayout = async (runtimeRoot: string, instanceId: string): Promise<void> => {
  const instanceRoot = runtimeInstancePath(runtimeRoot, instanceId);

  await Promise.all(
    INSTANCE_LAYOUT_DIRECTORY_PATHS.map((relativePath) => ensureDirectory(path.join(instanceRoot, relativePath))),
  );

  for (const relativePath of INSTANCE_LAYOUT_FILE_PATHS) {
    if (relativePath === "instance.json") {
      continue;
    }

    const destinationPath = path.join(instanceRoot, relativePath);
    if (await fileExists(destinationPath)) {
      continue;
    }

    const templateSourcePath = seedInstancePath(relativePath);
    if (await copyFileIfMissing(templateSourcePath, destinationPath)) {
      continue;
    }

    if (path.basename(relativePath) === ".gitkeep") {
      await ensureDirectory(path.dirname(destinationPath));
      await writeFile(destinationPath, "", "utf8");
    }
  }
};

const ensureDeveloperInstanceLayout = async (
  runtimeRoot: string,
  instanceId: string,
  instanceName: string,
): Promise<string> => {
  const instanceRoot = runtimeInstancePath(runtimeRoot, instanceId);
  await syncTemplateInstanceMissingEntries(runtimeRoot, instanceId);
  await materializeDeveloperInstanceLayout(runtimeRoot, instanceId);

  const templateInstance = JSON.parse(await readFile(seedInstancePath("instance.json"), "utf8")) as {
    instance?: { name?: string; localInstanceId?: string };
    runtime?: Record<string, unknown>;
  };
  const instanceProfilePath = runtimeInstancePath(runtimeRoot, instanceId, "instance.json");
  const nextInstance = {
    ...templateInstance,
    instance: {
      ...(templateInstance.instance ?? {}),
      name: instanceName,
      localInstanceId: instanceId,
    },
  };
  await writeJsonIfMissing(instanceProfilePath, nextInstance);

  return instanceRoot;
};

const expandCloneParts = (parts: DevInstanceClonePart[] | undefined): DevInstanceClonePart[] => {
  const normalized: DevInstanceClonePart[] = parts && parts.length > 0 ? [...parts] : ["wallets", "settings"];
  if (normalized.includes("all")) {
    return ["profile", "settings", "wallets", "db", "logs", "workspace"];
  }

  return Array.from(new Set<DevInstanceClonePart>(normalized));
};

export const getDefaultDeveloperRuntimeRoots = (input: {
  env?: NodeJS.ProcessEnv;
} = {}): {
  runtimeRoot: string;
  generatedRoot: string;
} => {
  const runtimeRoot = resolvePreferredDeveloperRuntimeRoot(input.env ?? process.env);
  return {
    runtimeRoot,
    generatedRoot: resolveDefaultGeneratedRoot(runtimeRoot, TEMPLATE_INSTANCE_ID),
  };
};

export const resolveDeveloperBootstrapRoots = (input: {
  runtimeRoot?: string;
  generatedRoot?: string;
  env?: NodeJS.ProcessEnv;
} = {}): {
  runtimeRoot: string;
  generatedRoot: string;
} => {
  const env = input.env ?? process.env;
  const defaultRuntimeRoot = resolvePreferredDeveloperRuntimeRoot(env);
  const runtimeRoot = resolveAbsolutePath(
    input.runtimeRoot?.trim() || env.TRENCHCLAW_RUNTIME_STATE_ROOT?.trim() || defaultRuntimeRoot,
    "runtime root",
  );
  return {
    runtimeRoot,
    generatedRoot: resolveAbsolutePath(
      input.generatedRoot?.trim()
      || resolveDefaultGeneratedRoot(runtimeRoot, TEMPLATE_INSTANCE_ID),
      "generated root",
    ),
  };
};

const createBackupSnapshot = async (runtimeRoot: string, destinationPath: string): Promise<void> => {
  const targetStats = await stat(destinationPath).catch(() => null);
  if (!targetStats) {
    return;
  }

  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const relativePath = path.relative(runtimeRoot, destinationPath);
  const backupPath = path.join(runtimeBackupsRoot(runtimeRoot), timestamp, relativePath);
  await ensureDirectory(path.dirname(backupPath));
  await cp(destinationPath, backupPath, { recursive: true });
};

export const initializeDeveloperRuntime = async (input: DeveloperRuntimeInitInput = {}): Promise<DeveloperRuntimeInitResult> => {
  const runtimeRoot = resolveAbsolutePath(
    input.runtimeRoot ?? resolvePreferredDeveloperRuntimeRoot(input.env ?? process.env),
    "runtime root",
  );
  const instanceId = normalizeInstanceId(input.instanceId);
  const generatedRoot = resolveAbsolutePath(
    input.generatedRoot ?? resolveDefaultGeneratedRoot(runtimeRoot, instanceId),
    "generated root",
  );
  const instanceName = input.instanceName?.trim() || toDefaultInstanceName(instanceId);

  await Promise.all([ensureDirectory(runtimeRoot), ensureDirectory(path.join(runtimeRoot, "instances")), ensureDirectory(generatedRoot)]);
  const instanceRoot = await ensureDeveloperInstanceLayout(runtimeRoot, instanceId, instanceName);
  await writeJson(path.join(runtimeRoot, "instances", "active-instance.json"), { localInstanceId: instanceId });
  if (shouldWriteRuntimeReadme(runtimeRoot)) {
    await writeRuntimeReadme(runtimeRoot, generatedRoot, instanceId);
  }
  if (input.writeGitignore !== false) {
    await updateGitignoreBlock(path.join(runtimeRoot, ".gitignore"));
  }

  return {
    runtimeRoot,
    generatedRoot,
    instanceId,
    instanceRoot,
  };
};

export const cloneDeveloperInstance = async (input: CloneDeveloperInstanceInput): Promise<CloneDeveloperInstanceResult> => {
  const fromRoot = resolveAbsolutePath(input.fromRoot, "source runtime root");
  const toRoot = resolveAbsolutePath(input.toRoot, "target runtime root");
  const fromInstanceId = normalizeInstanceId(input.fromInstanceId);
  const toInstanceId = normalizeInstanceId(input.toInstanceId, fromInstanceId);
  const parts = expandCloneParts(input.parts);

  await ensureDirectory(path.join(toRoot, "instances"));
  await ensureDeveloperInstanceLayout(toRoot, toInstanceId, toDefaultInstanceName(toInstanceId));
  if (input.setActive !== false) {
    await writeJson(path.join(toRoot, "instances", "active-instance.json"), { localInstanceId: toInstanceId });
  }

  const copiedPaths: string[] = [];
  const copyPath = async (sourcePath: string, destinationPath: string): Promise<void> => {
    await createBackupSnapshot(toRoot, destinationPath);
    const copiedDirectory = await copyDirectoryIfExists(sourcePath, destinationPath);
    if (copiedDirectory) {
      copiedPaths.push(destinationPath);
      return;
    }

    const copiedFile = await copyFileIfExists(sourcePath, destinationPath);
    if (copiedFile) {
      copiedPaths.push(destinationPath);
    }
  };

  for (const part of parts) {
    switch (part) {
      case "profile":
        await copyPath(
          runtimeInstancePath(fromRoot, fromInstanceId, "instance.json"),
          runtimeInstancePath(toRoot, toInstanceId, "instance.json"),
        );
        break;
      case "settings":
        await copyPath(
          runtimeInstancePath(fromRoot, fromInstanceId, "settings"),
          runtimeInstancePath(toRoot, toInstanceId, "settings"),
        );
        break;
      case "wallets":
        await copyPath(
          runtimeInstancePath(fromRoot, fromInstanceId, "secrets", "vault.json"),
          runtimeInstancePath(toRoot, toInstanceId, "secrets", "vault.json"),
        );
        await copyPath(
          runtimeInstancePath(fromRoot, fromInstanceId, "keypairs"),
          runtimeInstancePath(toRoot, toInstanceId, "keypairs"),
        );
        break;
      case "db":
        await copyPath(
          runtimeInstancePath(fromRoot, fromInstanceId, "data"),
          runtimeInstancePath(toRoot, toInstanceId, "data"),
        );
        break;
      case "logs":
        await copyPath(
          runtimeInstancePath(fromRoot, fromInstanceId, "logs"),
          runtimeInstancePath(toRoot, toInstanceId, "logs"),
        );
        break;
      case "workspace":
        await copyPath(
          runtimeInstancePath(fromRoot, fromInstanceId, "workspace"),
          runtimeInstancePath(toRoot, toInstanceId, "workspace"),
        );
        break;
      default:
        break;
    }
  }

  return {
    fromRoot,
    toRoot,
    fromInstanceId,
    toInstanceId,
    parts,
    copiedPaths,
  };
};
