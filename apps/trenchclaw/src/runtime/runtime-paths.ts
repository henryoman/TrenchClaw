import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const LEGACY_BRAIN_ROOT = "src/ai/brain";
const RUNTIME_STATE_CONTRACT_ROOT = ".runtime-state";

const normalizeEnvPath = (value: string): string =>
  path.isAbsolute(value) ? path.resolve(value) : path.resolve(process.cwd(), value);

const normalizeContractPath = (value: string): string => value.trim().replaceAll("\\", "/").replace(/\/+$/, "");

const isCoreAppRoot = (candidate: string): boolean =>
  (existsSync(path.join(candidate, "src/runtime/bootstrap.ts")) &&
    existsSync(path.join(candidate, "src/runtime/load/loader.ts"))) ||
  existsSync(path.join(candidate, "src/ai/brain"));

export const resolveCoreAppRoot = (): string => {
  const envRoot = process.env.TRENCHCLAW_APP_ROOT?.trim();
  const releaseRoot = process.env.TRENCHCLAW_RELEASE_ROOT?.trim();
  const candidates = [
    envRoot ? normalizeEnvPath(envRoot) : null,
    releaseRoot ? path.join(normalizeEnvPath(releaseRoot), "core") : null,
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
export const BUNDLED_BRAIN_ROOT = path.join(CORE_APP_ROOT, LEGACY_BRAIN_ROOT);

const isWorkspaceCoreAppRoot = (candidate: string): boolean =>
  existsSync(path.join(candidate, "package.json"))
  && existsSync(path.join(candidate, "..", "frontends", "gui"));

const resolveDefaultRuntimeStateRoot = (): string => {
  if (isWorkspaceCoreAppRoot(CORE_APP_ROOT)) {
    return path.join(CORE_APP_ROOT, ".runtime-state");
  }

  return path.join(os.homedir(), ".trenchclaw");
};

export const DEFAULT_RUNTIME_STATE_ROOT = resolveDefaultRuntimeStateRoot();

export const resolveRuntimeStateRoot = (): string => {
  const configuredRoot = process.env.TRENCHCLAW_RUNTIME_STATE_ROOT?.trim();
  if (!configuredRoot) {
    return DEFAULT_RUNTIME_STATE_ROOT;
  }

  return normalizeEnvPath(configuredRoot);
};

export const RUNTIME_STATE_ROOT = resolveRuntimeStateRoot();
export const RUNTIME_DB_ROOT = path.join(RUNTIME_STATE_ROOT, "db");
export const RUNTIME_USER_ROOT = path.join(RUNTIME_STATE_ROOT, "user");
export const RUNTIME_INSTANCE_ROOT = path.join(RUNTIME_STATE_ROOT, "instances");
export const RUNTIME_GENERATED_ROOT = path.join(RUNTIME_STATE_ROOT, "generated");
export const RUNTIME_WORKSPACE_ROOT = path.join(RUNTIME_USER_ROOT, "workspace");
export const RUNTIME_WORKSPACE_ROUTINES_ROOT = path.join(RUNTIME_WORKSPACE_ROOT, "routines");
export const RUNTIME_PROTECTED_ROOT = path.join(RUNTIME_STATE_ROOT, "protected");
export const RUNTIME_NO_READ_ROOT = RUNTIME_USER_ROOT;
export const RUNTIME_KEYPAIRS_ROOT = path.join(RUNTIME_PROTECTED_ROOT, "keypairs");

export const resolveCoreRelativePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(CORE_APP_ROOT, targetPath);

export const resolveBundledBrainPath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(BUNDLED_BRAIN_ROOT, targetPath);

export const resolveRuntimeStatePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(RUNTIME_STATE_ROOT, targetPath);

const LEGACY_RUNTIME_PATH_MAPPINGS = [
  {
    from: `${LEGACY_BRAIN_ROOT}/db`,
    to: "db",
  },
  {
    from: `${LEGACY_BRAIN_ROOT}/protected/instance`,
    to: "instances",
  },
  {
    from: `${LEGACY_BRAIN_ROOT}/protected/no-read`,
    to: "user",
  },
  {
    from: `${LEGACY_BRAIN_ROOT}/protected/context`,
    to: "generated",
  },
  {
    from: `${LEGACY_BRAIN_ROOT}/workspace`,
    to: "user/workspace",
  },
  {
    from: `${LEGACY_BRAIN_ROOT}/knowledge/KNOWLEDGE_MANIFEST.md`,
    to: "generated/knowledge-manifest.md",
  },
] as const;

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
  for (const mapping of LEGACY_RUNTIME_PATH_MAPPINGS) {
    if (normalized === mapping.from) {
      return resolveRuntimeStatePath(mapping.to);
    }
    if (normalized.startsWith(`${mapping.from}/`)) {
      return resolveRuntimeStatePath(`${mapping.to}/${normalized.slice(`${mapping.from}/`.length)}`);
    }
  }
  if (normalized === LEGACY_BRAIN_ROOT) {
    return RUNTIME_STATE_ROOT;
  }
  if (normalized.startsWith(`${LEGACY_BRAIN_ROOT}/`)) {
    return resolveRuntimeStatePath(normalized.slice(`${LEGACY_BRAIN_ROOT}/`.length));
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
