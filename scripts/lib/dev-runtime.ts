import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CORE_APP_ROOT = path.join(REPO_ROOT, "apps", "trenchclaw");
const RUNTIME_TEMPLATE_ROOT = path.join(CORE_APP_ROOT, ".runtime");
const REPO_LOCAL_RUNTIME_ROOT = path.join(CORE_APP_ROOT, ".runtime-state");
const TEMPLATE_INSTANCE_ID = "01";
const INSTANCE_ID_PATTERN = /^\d{2}$/u;
const GITIGNORE_MARKER_START = "# >>> trenchclaw dev runtime >>>";
const GITIGNORE_MARKER_END = "# <<< trenchclaw dev runtime <<<";
const DEFAULT_DEV_RUNTIME_ROOT = path.join(os.homedir(), "trenchclaw-dev-runtime");
const DEFAULT_INSTANCE_NAME = "default";
const LEGACY_AUTO_INSTANCE_NAME_PATTERN = /^dev[- ](\d{2})$/u;

const DEV_RUNTIME_GITIGNORE_BLOCK = [
  GITIGNORE_MARKER_START,
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

const templateInstancePath = (...segments: string[]): string =>
  path.join(RUNTIME_TEMPLATE_ROOT, "instances", TEMPLATE_INSTANCE_ID, ...segments);

const runtimeInstancePath = (runtimeRoot: string, instanceId: string, ...segments: string[]): string =>
  path.join(runtimeRoot, "instances", instanceId, ...segments);

const resolveDefaultGeneratedRoot = (runtimeRoot: string, instanceId: string): string =>
  runtimeInstancePath(runtimeRoot, instanceId, "cache", "generated");

const toDefaultInstanceName = (instanceId: string): string =>
  instanceId === TEMPLATE_INSTANCE_ID ? DEFAULT_INSTANCE_NAME : `instance-${instanceId}`;

const isLegacyAutoInstanceName = (value: string, instanceId: string): boolean => {
  const match = LEGACY_AUTO_INSTANCE_NAME_PATTERN.exec(value.trim());
  return match?.[1] === instanceId;
};

const migrateLegacyInstanceProfileName = async (
  instanceProfilePath: string,
  instanceId: string,
  instanceName: string,
): Promise<void> => {
  if (!(await fileExists(instanceProfilePath))) {
    return;
  }

  try {
    const parsed = JSON.parse(await readFile(instanceProfilePath, "utf8")) as {
      instance?: { name?: unknown; localInstanceId?: unknown };
    } & Record<string, unknown>;
    const storedName = typeof parsed.instance?.name === "string" ? parsed.instance.name.trim() : "";
    const storedInstanceId = typeof parsed.instance?.localInstanceId === "string" ? parsed.instance.localInstanceId.trim() : "";

    if (!storedName || storedInstanceId !== instanceId || !isLegacyAutoInstanceName(storedName, instanceId)) {
      return;
    }

    await writeJson(instanceProfilePath, {
      ...parsed,
      instance: {
        ...(parsed.instance ?? {}),
        name: instanceName,
        localInstanceId: instanceId,
      },
    });
  } catch {
    // Preserve invalid custom files as-is; init only migrates the known legacy auto-name shape.
  }
};

const syncTemplateInstanceMissingEntries = async (runtimeRoot: string, instanceId: string): Promise<void> => {
  const sourceRoot = templateInstancePath();
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

const ensureDeveloperInstanceLayout = async (
  runtimeRoot: string,
  instanceId: string,
  instanceName: string,
): Promise<string> => {
  const instanceRoot = runtimeInstancePath(runtimeRoot, instanceId);
  await syncTemplateInstanceMissingEntries(runtimeRoot, instanceId);

  const templateInstance = JSON.parse(await readFile(templateInstancePath("instance.json"), "utf8")) as {
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
  await migrateLegacyInstanceProfileName(instanceProfilePath, instanceId, instanceName);

  return instanceRoot;
};

const expandCloneParts = (parts: DevInstanceClonePart[] | undefined): DevInstanceClonePart[] => {
  const normalized: DevInstanceClonePart[] = parts && parts.length > 0 ? [...parts] : ["wallets", "settings"];
  if (normalized.includes("all")) {
    return ["profile", "settings", "wallets", "db", "logs", "workspace"];
  }

  return Array.from(new Set<DevInstanceClonePart>(normalized));
};

export const getDefaultDeveloperRuntimeRoots = (): {
  runtimeRoot: string;
  generatedRoot: string;
} => ({
  runtimeRoot: DEFAULT_DEV_RUNTIME_ROOT,
  generatedRoot: resolveDefaultGeneratedRoot(DEFAULT_DEV_RUNTIME_ROOT, TEMPLATE_INSTANCE_ID),
});

export const resolveDeveloperBootstrapRoots = (input: {
  runtimeRoot?: string;
  generatedRoot?: string;
  env?: NodeJS.ProcessEnv;
} = {}): {
  runtimeRoot: string;
  generatedRoot: string;
} => {
  const defaults = getDefaultDeveloperRuntimeRoots();
  const env = input.env ?? process.env;
  const runtimeRoot = resolveAbsolutePath(
    input.runtimeRoot?.trim() || env.TRENCHCLAW_RUNTIME_STATE_ROOT?.trim() || defaults.runtimeRoot,
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

export const initializeDeveloperRuntime = async (input: DeveloperRuntimeInitInput = {}): Promise<DeveloperRuntimeInitResult> => {
  const runtimeRoot = resolveAbsolutePath(input.runtimeRoot ?? DEFAULT_DEV_RUNTIME_ROOT, "runtime root");
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
