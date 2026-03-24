import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RuntimeApiInstanceProfileView } from "@trenchclaw/types";

import { assertInstanceSystemWritePath } from "./security/write-scope";
import { resolveActiveInstanceStateFile, resolveRuntimeInstanceRoot } from "./runtime-paths";

const INSTANCE_ID_PATTERN = /^\d{2}$/u;
const INSTANCE_DIRECTORY_PATTERN = /^\d{2}$/u;
const INSTANCE_PROFILE_FILE_NAME = "instance.json";

const normalizeInstanceId = (localInstanceId: string): string => {
  const normalized = localInstanceId.trim();
  if (!normalized || !INSTANCE_ID_PATTERN.test(normalized)) {
    throw new Error(`Invalid instance id: ${localInstanceId}`);
  }
  return normalized;
};

const getInstanceProfileFilePath = (localInstanceId: string): string =>
  path.join(resolveRuntimeInstanceRoot(), normalizeInstanceId(localInstanceId), INSTANCE_PROFILE_FILE_NAME);

const hasStoredInstance = (localInstanceId: string): boolean => existsSync(getInstanceProfileFilePath(localInstanceId));

const hasInstanceDirectory = (localInstanceId: string): boolean => {
  try {
    return statSync(path.join(resolveRuntimeInstanceRoot(), normalizeInstanceId(localInstanceId))).isDirectory();
  } catch {
    return false;
  }
};

const resolveStoredInstanceId = (localInstanceId: string): string | null => {
  const normalized = normalizeInstanceId(localInstanceId);
  return hasStoredInstance(normalized) || hasInstanceDirectory(normalized) ? normalized : null;
};

const toPersistedActiveInstanceId = (value: unknown): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as { localInstanceId?: unknown };
  return typeof candidate.localInstanceId === "string" ? candidate.localInstanceId.trim() : null;
};

const readStoredInstanceProfileSync = (localInstanceId: string): RuntimeApiInstanceProfileView | null => {
  try {
    const normalizedInstanceId = normalizeInstanceId(localInstanceId);
    const profilePath = getInstanceProfileFilePath(normalizedInstanceId);
    if (!existsSync(profilePath)) {
      return null;
    }

    const parsed = JSON.parse(readFileSync(profilePath, "utf8")) as {
      instance?: { name?: unknown; localInstanceId?: unknown; userPin?: unknown };
      runtime?: { safetyProfile?: unknown; createdAt?: unknown; updatedAt?: unknown };
    };
    const name = typeof parsed.instance?.name === "string" ? parsed.instance.name.trim() : "";
    const parsedInstanceId =
      typeof parsed.instance?.localInstanceId === "string" ? normalizeInstanceId(parsed.instance.localInstanceId) : "";
    const safetyProfile =
      parsed.runtime?.safetyProfile === "safe"
      || parsed.runtime?.safetyProfile === "dangerous"
      || parsed.runtime?.safetyProfile === "veryDangerous"
        ? parsed.runtime.safetyProfile
        : "dangerous";
    const createdAt =
      typeof parsed.runtime?.createdAt === "string" ? parsed.runtime.createdAt : new Date(0).toISOString();
    const updatedAt = typeof parsed.runtime?.updatedAt === "string" ? parsed.runtime.updatedAt : createdAt;

    if (!name || !parsedInstanceId) {
      return null;
    }

    return {
      fileName: INSTANCE_PROFILE_FILE_NAME,
      localInstanceId: parsedInstanceId,
      name,
      safetyProfile,
      userPinRequired: parsed.instance?.userPin !== null && parsed.instance?.userPin !== undefined,
      createdAt,
      updatedAt,
    };
  } catch {
    return null;
  }
};

const parsePersistedActiveInstance = (raw: string): RuntimeApiInstanceProfileView | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const localInstanceId = toPersistedActiveInstanceId(parsed);
    if (!localInstanceId) {
      return null;
    }
    return readStoredInstanceProfileSync(localInstanceId);
  } catch {
    return null;
  }
};

const readSingleAvailableInstanceSync = (): RuntimeApiInstanceProfileView | null => {
  try {
    const instanceIds = new Set<string>();
    for (const entry of readdirSync(resolveRuntimeInstanceRoot(), { withFileTypes: true })) {
      if (entry.isDirectory() && INSTANCE_DIRECTORY_PATTERN.test(entry.name)) {
        instanceIds.add(entry.name);
      }
    }

    const [localInstanceId] = [...instanceIds].toSorted((left, right) => left.localeCompare(right));
    if (instanceIds.size !== 1 || !localInstanceId) {
      return null;
    }

    return readStoredInstanceProfileSync(localInstanceId);
  } catch {
    return null;
  }
};

export const readPersistedActiveInstanceSync = (): RuntimeApiInstanceProfileView | null => {
  const activeInstanceStateFile = resolveActiveInstanceStateFile();
  if (existsSync(activeInstanceStateFile)) {
    try {
      const persisted = parsePersistedActiveInstance(readFileSync(activeInstanceStateFile, "utf8"));
      if (persisted) {
        process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = persisted.localInstanceId;
        return persisted;
      }
    } catch {
      // Fall through to single-instance restore below.
    }
  }

  const restored = readSingleAvailableInstanceSync();
  if (restored) {
    process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = restored.localInstanceId;
  }
  return restored;
};

export const resolveCurrentActiveInstanceIdSync = (): string | null => {
  const fromEnv = process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID?.trim();
  if (fromEnv) {
    const resolvedFromEnv = resolveStoredInstanceId(fromEnv);
    if (resolvedFromEnv) {
      return resolvedFromEnv;
    }
    delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
  }

  return readPersistedActiveInstanceSync()?.localInstanceId ?? null;
};

export const resolveRequiredActiveInstanceIdSync = (
  errorMessage = "No active instance selected. Sign in before accessing instance-scoped runtime state.",
): string => {
  const activeInstanceId = resolveCurrentActiveInstanceIdSync();
  if (!activeInstanceId) {
    throw new Error(errorMessage);
  }
  return activeInstanceId;
};

export const persistActiveInstance = async (instance: RuntimeApiInstanceProfileView | null): Promise<void> => {
  const runtimeInstanceRoot = resolveRuntimeInstanceRoot();
  const activeInstanceStateFile = resolveActiveInstanceStateFile();
  assertInstanceSystemWritePath(activeInstanceStateFile, "persist active instance state");
  await mkdir(runtimeInstanceRoot, { recursive: true });

  if (instance === null) {
    delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
    await rm(activeInstanceStateFile, { force: true });
    return;
  }

  const localInstanceId = normalizeInstanceId(instance.localInstanceId);
  process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = localInstanceId;
  await writeFile(
    activeInstanceStateFile,
    `${JSON.stringify(
      {
        localInstanceId,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
};

export const resolveInstanceDirectoryPath = (localInstanceId: string): string => {
  const instanceDirectoryPath = path.resolve(resolveRuntimeInstanceRoot(), normalizeInstanceId(localInstanceId));
  assertInstanceSystemWritePath(instanceDirectoryPath, "resolve instance directory");
  return instanceDirectoryPath;
};
