import path from "node:path";
import type { RuntimeActor } from "../../ai/contracts/types/context";
import {
  resolveCoreRelativePath,
  resolveRuntimeContractPath,
  resolveRuntimeStateRoot,
  toRuntimeContractRelativePath,
} from "../runtime-paths";
import { resolveCurrentActiveInstanceIdSync } from "../instance/state";
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

export interface FilesystemPolicySummary {
  subject: FilesystemSubject;
  defaultPermission: FilesystemPermission;
  readPaths: string[];
  writePaths: string[];
  blockedPaths: string[];
}

const MANIFEST_PATH_FROM_MODULE = resolveCoreRelativePath("src/runtime/security/filesystem-manifest.json");

const DEFAULT_MANIFEST_CANDIDATE_PATHS = [
  MANIFEST_PATH_FROM_MODULE,
];
const MANIFEST_PATH_ENV = "TRENCHCLAW_FILESYSTEM_MANIFEST_FILE";
const ACTIVE_INSTANCE_TOKEN = "<active-instance>";
const INSTANCE_ID_PATTERN = /^\d{2}$/u;

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

const resolveManifestRulePath = (rawPath: string): string => {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    throw new Error("Filesystem manifest rule path must be a non-empty string");
  }

  if (!trimmed.includes(ACTIVE_INSTANCE_TOKEN)) {
    return resolveRuntimeContractPath(trimmed);
  }

  const activeInstanceId = resolveCurrentActiveInstanceIdSync()
    ?? (() => {
      const candidate = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID?.trim();
      return candidate && INSTANCE_ID_PATTERN.test(candidate) ? candidate : null;
    })();
  if (!activeInstanceId) {
    throw new Error(
      `Filesystem manifest rule path "${trimmed}" requires an active instance, but none is selected.`,
    );
  }

  const replacedPath = trimmed.replaceAll(ACTIVE_INSTANCE_TOKEN, activeInstanceId);
  if (replacedPath === ".runtime-state") {
    return resolveRuntimeStateRoot();
  }
  if (replacedPath.startsWith(".runtime-state/")) {
    const relativePath = replacedPath.slice(".runtime-state/".length);
    return path.join(resolveRuntimeStateRoot(), relativePath);
  }

  return resolveRuntimeContractPath(replacedPath);
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
      absolutePath: resolveManifestRulePath(rule.path),
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
let cachedManifestContextKey: string | null = null;
let cachedManifest: FilesystemManifest | null = null;

const resolveManifestContextKey = (): string =>
  JSON.stringify({
    runtimeStateRoot: process.env.TRENCHCLAW_RUNTIME_STATE_ROOT?.trim() ?? "",
    activeInstanceId:
      resolveCurrentActiveInstanceIdSync()
      ?? process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID?.trim()
      ?? "",
  });

const loadManifest = async (): Promise<FilesystemManifest> => {
  const manifestPath = await resolveManifestPath();
  const manifestContextKey = resolveManifestContextKey();
  if (
    cachedManifest
    && cachedManifestPath === manifestPath
    && cachedManifestContextKey === manifestContextKey
  ) {
    return cachedManifest;
  }

  const file = Bun.file(manifestPath);
  if (!(await file.exists())) {
    throw new Error(`Filesystem manifest does not exist: "${manifestPath}"`);
  }

  const parsed = parseManifest(await parseStructuredFile(manifestPath));
  cachedManifestPath = manifestPath;
  cachedManifestContextKey = manifestContextKey;
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
  const summary = await summarizeFilesystemPolicy({
    actor: input.actor,
    maxPathsPerBucket: input.maxPathsPerBucket,
  });
  return [
    `Filesystem policy for ${summary.subject} (enforced by manifest):`,
    `- default permission: ${summary.defaultPermission}`,
    `- write paths: ${summary.writePaths.length > 0 ? summary.writePaths.join(", ") : "none"}`,
    `- read-only paths: ${summary.readPaths.length > 0 ? summary.readPaths.join(", ") : "none"}`,
    `- blocked paths: ${summary.blockedPaths.length > 0 ? summary.blockedPaths.join(", ") : "none"}`,
    "- never assume access outside allowed paths; request user help if blocked.",
  ].join("\n");
};

export const summarizeFilesystemPolicy = async (input: {
  actor?: RuntimeActor;
  maxPathsPerBucket?: number;
} = {}): Promise<FilesystemPolicySummary> => {
  const subject = toSubject(input.actor);
  const maxPaths = Math.max(1, Math.trunc(input.maxPathsPerBucket ?? 8));
  const manifest = await loadManifest();

  return {
    subject,
    defaultPermission: manifest.defaults[subject],
    writePaths: manifest.rules
      .filter((rule) => rule[subject] === "write")
      .map((rule) => toRelativePath(rule.absolutePath))
      .slice(0, maxPaths),
    readPaths: manifest.rules
      .filter((rule) => rule[subject] === "read")
      .map((rule) => toRelativePath(rule.absolutePath))
      .slice(0, maxPaths),
    blockedPaths: manifest.rules
      .filter((rule) => rule[subject] === "none")
      .map((rule) => toRelativePath(rule.absolutePath))
      .slice(0, maxPaths),
  };
};

export const resetFilesystemManifestCacheForTests = (): void => {
  cachedManifestPath = null;
  cachedManifestContextKey = null;
  cachedManifest = null;
};
