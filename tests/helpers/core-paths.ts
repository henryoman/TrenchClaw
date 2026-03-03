import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

const normalize = (value: string): string => path.resolve(value);

const candidateCoreRoots = (): string[] => {
  const fromEnv = process.env.TRENCHCLAW_APP_ROOT?.trim();
  return [
    fromEnv && fromEnv.length > 0 ? normalize(fromEnv) : null,
    path.resolve(REPO_ROOT, "apps/trenchclaw"),
    path.resolve(process.cwd(), "apps/trenchclaw"),
    path.resolve(process.cwd()),
  ].filter((value): value is string => Boolean(value));
};

const isCoreRoot = (candidate: string): boolean =>
  existsSync(path.join(candidate, "src/runtime/bootstrap.ts"))
  && existsSync(path.join(candidate, "package.json"));

export const CORE_APP_ROOT = candidateCoreRoots().find(isCoreRoot) ?? path.resolve(REPO_ROOT, "apps/trenchclaw");

export const coreAppPath = (...segments: string[]): string => path.join(CORE_APP_ROOT, ...segments);
