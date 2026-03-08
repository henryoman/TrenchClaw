import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const LEGACY_BRAIN_ROOT = "src/ai/brain";

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

export const resolveRuntimeStateRoot = (): string => {
  const configuredRoot = process.env.TRENCHCLAW_RUNTIME_STATE_ROOT?.trim();
  if (!configuredRoot) {
    return BUNDLED_BRAIN_ROOT;
  }

  return normalizeEnvPath(configuredRoot);
};

export const RUNTIME_STATE_ROOT = resolveRuntimeStateRoot();
export const RUNTIME_DB_ROOT = path.join(RUNTIME_STATE_ROOT, "db");
export const RUNTIME_PROTECTED_ROOT = path.join(RUNTIME_STATE_ROOT, "protected");
export const RUNTIME_NO_READ_ROOT = path.join(RUNTIME_PROTECTED_ROOT, "no-read");
export const RUNTIME_INSTANCE_ROOT = path.join(RUNTIME_PROTECTED_ROOT, "instance");
export const RUNTIME_KEYPAIRS_ROOT = path.join(RUNTIME_PROTECTED_ROOT, "keypairs");

export const resolveCoreRelativePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(CORE_APP_ROOT, targetPath);

export const resolveBundledBrainPath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(BUNDLED_BRAIN_ROOT, targetPath);

export const resolveRuntimeStatePath = (targetPath: string): string =>
  path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(RUNTIME_STATE_ROOT, targetPath);

export const resolveRuntimeContractPath = (targetPath: string): string => {
  if (path.isAbsolute(targetPath)) {
    return path.resolve(targetPath);
  }

  const normalized = normalizeContractPath(targetPath);
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
    return relative.length > 0 ? `${LEGACY_BRAIN_ROOT}/${relative}` : LEGACY_BRAIN_ROOT;
  }

  return path.relative(CORE_APP_ROOT, normalized).split(path.sep).join("/") || ".";
};
