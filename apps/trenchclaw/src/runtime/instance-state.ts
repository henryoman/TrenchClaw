import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { GuiInstanceProfileView } from "@trenchclaw/types";

import { assertInstanceSystemWritePath } from "./security/write-scope";
import { RUNTIME_INSTANCE_ROOT } from "./runtime-paths";

const ACTIVE_INSTANCE_STATE_FILE = path.join(RUNTIME_INSTANCE_ROOT, "active-instance.json");
const INSTANCE_ID_PATTERN = /^\d{2}$/u;
const INSTANCE_DIRECTORY_PATTERN = /^\d{2}$/u;
const INSTANCE_PROFILE_FILE_NAME = "instance.json";

const isPersistedInstanceView = (value: unknown): value is GuiInstanceProfileView => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<GuiInstanceProfileView>;
  return (
    typeof candidate.fileName === "string"
    && typeof candidate.localInstanceId === "string"
    && typeof candidate.name === "string"
    && typeof candidate.safetyProfile === "string"
    && typeof candidate.userPinRequired === "boolean"
    && typeof candidate.createdAt === "string"
    && typeof candidate.updatedAt === "string"
  );
};

const normalizeInstanceId = (localInstanceId: string): string => {
  const normalized = localInstanceId.trim();
  if (!normalized || !INSTANCE_ID_PATTERN.test(normalized)) {
    throw new Error(`Invalid instance id: ${localInstanceId}`);
  }
  return normalized;
};

const getInstanceProfileFilePath = (localInstanceId: string): string =>
  path.join(RUNTIME_INSTANCE_ROOT, normalizeInstanceId(localInstanceId), INSTANCE_PROFILE_FILE_NAME);

const hasStoredInstance = (localInstanceId: string): boolean => existsSync(getInstanceProfileFilePath(localInstanceId));

const resolveStoredInstanceId = (localInstanceId: string): string | null => {
  const normalized = normalizeInstanceId(localInstanceId);
  return hasStoredInstance(normalized) ? normalized : null;
};

const parsePersistedActiveInstance = (raw: string): GuiInstanceProfileView | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPersistedInstanceView(parsed)) {
      return null;
    }

    if (!hasStoredInstance(parsed.localInstanceId)) {
      return null;
    }

    return {
      ...parsed,
      localInstanceId: normalizeInstanceId(parsed.localInstanceId),
    };
  } catch {
    return null;
  }
};

const readSingleAvailableInstanceSync = (): GuiInstanceProfileView | null => {
  try {
    const instanceIds = new Set<string>();
    for (const entry of readdirSync(RUNTIME_INSTANCE_ROOT, { withFileTypes: true })) {
      if (entry.isDirectory() && INSTANCE_DIRECTORY_PATTERN.test(entry.name)) {
        instanceIds.add(entry.name);
      }
    }

    const [localInstanceId] = [...instanceIds].toSorted((left, right) => left.localeCompare(right));
    if (instanceIds.size !== 1 || !localInstanceId) {
      return null;
    }

    const fileName = INSTANCE_PROFILE_FILE_NAME;
    const profilePath = getInstanceProfileFilePath(localInstanceId);
    if (existsSync(profilePath)) {
      const content = readFileSync(profilePath, "utf8");
      const parsed = JSON.parse(content) as {
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

      if (name && parsedInstanceId) {
        return {
          fileName,
          localInstanceId: parsedInstanceId,
          name,
          safetyProfile,
          userPinRequired: parsed.instance?.userPin !== null && parsed.instance?.userPin !== undefined,
          createdAt,
          updatedAt,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
};

export const readPersistedActiveInstanceSync = (): GuiInstanceProfileView | null => {
  if (existsSync(ACTIVE_INSTANCE_STATE_FILE)) {
    try {
      const persisted = parsePersistedActiveInstance(readFileSync(ACTIVE_INSTANCE_STATE_FILE, "utf8"));
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

export const persistActiveInstance = async (instance: GuiInstanceProfileView | null): Promise<void> => {
  assertInstanceSystemWritePath(ACTIVE_INSTANCE_STATE_FILE, "persist active instance state");
  await mkdir(RUNTIME_INSTANCE_ROOT, { recursive: true });

  if (instance === null) {
    delete process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID;
    await rm(ACTIVE_INSTANCE_STATE_FILE, { force: true });
    return;
  }

  const localInstanceId = normalizeInstanceId(instance.localInstanceId);
  process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = localInstanceId;
  await writeFile(
    ACTIVE_INSTANCE_STATE_FILE,
    `${JSON.stringify(
      {
        ...instance,
        localInstanceId,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
};

export const resolveInstanceDirectoryPath = (localInstanceId: string): string => {
  const instanceDirectoryPath = path.resolve(RUNTIME_INSTANCE_ROOT, normalizeInstanceId(localInstanceId));
  assertInstanceSystemWritePath(instanceDirectoryPath, "resolve instance directory");
  return instanceDirectoryPath;
};
