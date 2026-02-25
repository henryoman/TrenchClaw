import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI_PACKAGE_ROOT = fileURLToPath(new URL(".", import.meta.url));

const normalizeEnvPath = (value: string): string =>
  path.isAbsolute(value) ? path.resolve(value) : path.resolve(process.cwd(), value);

const isCoreAppRoot = (candidate: string): boolean =>
  existsSync(path.join(candidate, "src/runtime/bootstrap.ts")) && existsSync(path.join(candidate, "src/runtime/load/loader.ts"));

export const resolveCoreAppRoot = (): string => {
  const envRoot = process.env.TRENCHCLAW_APP_ROOT?.trim();
  const candidates = [
    envRoot ? normalizeEnvPath(envRoot) : null,
    path.resolve(CLI_PACKAGE_ROOT, "../../trenchclaw"),
    path.resolve(process.cwd(), "apps/trenchclaw"),
    path.resolve(process.cwd(), "../../trenchclaw"),
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
