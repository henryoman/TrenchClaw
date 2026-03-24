import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const BRAIN_SOURCE_ROOT = "src/ai/brain";
const RUNTIME_STATE_CONTRACT_ROOT = ".runtime-state";
const DEFAULT_WORKSPACE_RUNTIME_STATE_DIRECTORY = ".trenchclaw-dev-runtime";

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
    existsSync(path.join(candidate, "src/runtime/load/loader.ts"))) ||
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

const resolveDefaultWorkspaceRuntimeStateRoot = (): string =>
  path.join(process.env.HOME || process.env.USERPROFILE || os.homedir(), DEFAULT_WORKSPACE_RUNTIME_STATE_DIRECTORY);

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
export const RUNTIME_INSTANCE_ROOT = path.join(RUNTIME_STATE_ROOT, "instances");
export const RUNTIME_TEMPLATE_ROOT = path.join(CORE_APP_ROOT, ".runtime");

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
