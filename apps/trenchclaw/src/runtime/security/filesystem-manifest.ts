import path from "node:path";
import type { RuntimeActor } from "../../ai/runtime/types/context";
import {
  resolveCoreRelativePath,
  resolveRuntimeContractPath,
  toRuntimeContractRelativePath,
} from "../runtime-paths";
import { parseStructuredFile } from "../../ai/llm/shared";

type FilesystemSubject = "model" | "user" | "system";
type FilesystemPermission = "none" | "read" | "write";
type FilesystemOperation = "read" | "write";

interface FilesystemRuleInput {
  path: string;
  model?: FilesystemPermission;
  user?: FilesystemPermission;
  system?: FilesystemPermission;
}

interface FilesystemManifestInput {
  version: number;
  defaults?: {
    model?: FilesystemPermission;
    user?: FilesystemPermission;
    system?: FilesystemPermission;
  };
  rules?: FilesystemRuleInput[];
}

interface FilesystemRule {
  absolutePath: string;
  model: FilesystemPermission;
  user: FilesystemPermission;
  system: FilesystemPermission;
}

interface FilesystemManifest {
  version: 1;
  defaults: {
    model: FilesystemPermission;
    user: FilesystemPermission;
    system: FilesystemPermission;
  };
  rules: FilesystemRule[];
}

const MANIFEST_PATH_FROM_MODULE = resolveCoreRelativePath("src/ai/config/filesystem-manifest.json");

const DEFAULT_MANIFEST_CANDIDATE_PATHS = [
  MANIFEST_PATH_FROM_MODULE,
];
const MANIFEST_PATH_ENV = "TRENCHCLAW_FILESYSTEM_MANIFEST_FILE";

const normalizePermission = (value: unknown, fallback: FilesystemPermission): FilesystemPermission => {
  if (value === "none" || value === "read" || value === "write") {
    return value;
  }
  return fallback;
};

const toSubject = (actor: RuntimeActor | undefined): FilesystemSubject => {
  if (actor === "agent") {
    return "model";
  }
  if (actor === "user") {
    return "user";
  }
  return "system";
};

const toRelativePath = (absolutePath: string): string => toRuntimeContractRelativePath(absolutePath);

const resolveManifestPath = async (): Promise<string> => {
  const configured = process.env[MANIFEST_PATH_ENV]?.trim();
  if (!configured) {
    const existenceResults = await Promise.all(
      DEFAULT_MANIFEST_CANDIDATE_PATHS.map(async (candidatePath) => ({
        candidatePath,
        exists: await Bun.file(candidatePath).exists(),
      })),
    );
    const firstExisting = existenceResults.find((candidate) => candidate.exists)?.candidatePath;
    if (firstExisting) {
      return firstExisting;
    }
    return DEFAULT_MANIFEST_CANDIDATE_PATHS[0] ?? MANIFEST_PATH_FROM_MODULE;
  }
  return path.isAbsolute(configured) ? configured : resolveRuntimeContractPath(configured);
};

const canPerform = (permission: FilesystemPermission, operation: FilesystemOperation): boolean => {
  if (permission === "write") {
    return true;
  }
  if (permission === "read") {
    return operation === "read";
  }
  return false;
};

const parseManifest = (raw: unknown): FilesystemManifest => {
  const input = (raw ?? {}) as FilesystemManifestInput;
  if (input.version !== 1) {
    throw new Error("Filesystem manifest must define version: 1");
  }

  const defaults = {
    model: normalizePermission(input.defaults?.model, "none"),
    user: normalizePermission(input.defaults?.user, "write"),
    system: normalizePermission(input.defaults?.system, "write"),
  };

  const rules = (input.rules ?? []).map((rule): FilesystemRule => {
    if (!rule || typeof rule.path !== "string" || rule.path.trim().length === 0) {
      throw new Error("Filesystem manifest rule path must be a non-empty string");
    }
    return {
      absolutePath: resolveRuntimeContractPath(rule.path.trim()),
      model: normalizePermission(rule.model, defaults.model),
      user: normalizePermission(rule.user, defaults.user),
      system: normalizePermission(rule.system, defaults.system),
    };
  });

  return {
    version: 1,
    defaults,
    rules,
  };
};

let cachedManifestPath: string | null = null;
let cachedManifest: FilesystemManifest | null = null;

const loadManifest = async (): Promise<FilesystemManifest> => {
  const manifestPath = await resolveManifestPath();
  if (cachedManifest && cachedManifestPath === manifestPath) {
    return cachedManifest;
  }

  const file = Bun.file(manifestPath);
  if (!(await file.exists())) {
    throw new Error(`Filesystem manifest does not exist: "${manifestPath}"`);
  }

  const parsed = parseManifest(await parseStructuredFile(manifestPath));
  cachedManifestPath = manifestPath;
  cachedManifest = parsed;
  return parsed;
};

const findBestRule = (manifest: FilesystemManifest, absoluteTargetPath: string): FilesystemRule | null => {
  const normalizedTarget = path.resolve(absoluteTargetPath);
  let best: FilesystemRule | null = null;
  for (const rule of manifest.rules) {
    const ruleRoot = path.resolve(rule.absolutePath);
    const isMatch =
      normalizedTarget === ruleRoot ||
      normalizedTarget.startsWith(`${ruleRoot}${path.sep}`);
    if (!isMatch) {
      continue;
    }
    if (!best || ruleRoot.length > best.absolutePath.length) {
      best = rule;
    }
  }
  return best;
};

export class FilesystemPermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilesystemPermissionDeniedError";
  }
}

export const assertFilesystemAccessAllowed = async (input: {
  actor?: RuntimeActor;
  targetPath: string;
  operation: FilesystemOperation;
  reason: string;
}): Promise<void> => {
  const subject = toSubject(input.actor);
  const absoluteTargetPath = path.resolve(input.targetPath);
  const manifest = await loadManifest();
  const matchedRule = findBestRule(manifest, absoluteTargetPath);
  const permission = matchedRule ? matchedRule[subject] : manifest.defaults[subject];

  if (!canPerform(permission, input.operation)) {
    throw new FilesystemPermissionDeniedError(
      `Blocked ${input.reason}: subject="${subject}" cannot ${input.operation} "${absoluteTargetPath}" (permission=${permission})`,
    );
  }
};

export const assertModelFilesystemWriteAllowed = async (input: {
  targetPath: string;
  reason: string;
  actor?: RuntimeActor;
}): Promise<void> => {
  await assertFilesystemAccessAllowed({
    actor: input.actor,
    targetPath: input.targetPath,
    operation: "write",
    reason: input.reason,
  });
};

export const assertModelFilesystemReadAllowed = async (input: {
  targetPath: string;
  reason: string;
  actor?: RuntimeActor;
}): Promise<void> => {
  await assertFilesystemAccessAllowed({
    actor: input.actor,
    targetPath: input.targetPath,
    operation: "read",
    reason: input.reason,
  });
};

export const buildFilesystemPolicyPrompt = async (input: {
  actor?: RuntimeActor;
  maxPathsPerBucket?: number;
} = {}): Promise<string> => {
  const subject = toSubject(input.actor);
  const maxPaths = Math.max(1, Math.trunc(input.maxPathsPerBucket ?? 8));
  const manifest = await loadManifest();

  const writePaths = manifest.rules
    .filter((rule) => rule[subject] === "write")
    .map((rule) => toRelativePath(rule.absolutePath))
    .slice(0, maxPaths);
  const readPaths = manifest.rules
    .filter((rule) => rule[subject] === "read")
    .map((rule) => toRelativePath(rule.absolutePath))
    .slice(0, maxPaths);

  const defaultPermission = manifest.defaults[subject];
  return [
    `Filesystem policy for ${subject} (enforced by manifest):`,
    `- default permission: ${defaultPermission}`,
    `- write paths: ${writePaths.length > 0 ? writePaths.join(", ") : "none"}`,
    `- read-only paths: ${readPaths.length > 0 ? readPaths.join(", ") : "none"}`,
    "- never assume access outside allowed paths; request user help if blocked.",
  ].join("\n");
};

export const resetFilesystemManifestCacheForTests = (): void => {
  cachedManifestPath = null;
  cachedManifest = null;
};
