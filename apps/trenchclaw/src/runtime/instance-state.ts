import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { GuiInstanceProfileView } from "@trenchclaw/types";

import { assertInstanceSystemWritePath } from "./security/write-scope";
import { RUNTIME_INSTANCE_ROOT } from "./runtime-paths";

const ACTIVE_INSTANCE_STATE_FILE = path.join(RUNTIME_INSTANCE_ROOT, "active-instance.json");
const INSTANCE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/u;
const INSTANCE_FILE_PATTERN = /^i-\d+\.json$/u;

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
  path.join(RUNTIME_INSTANCE_ROOT, `${normalizeInstanceId(localInstanceId)}.json`);

const parsePersistedActiveInstance = (raw: string): GuiInstanceProfileView | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPersistedInstanceView(parsed)) {
      return null;
    }

    const profilePath = getInstanceProfileFilePath(parsed.localInstanceId);
    if (!existsSync(profilePath)) {
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
    const files = readdirSync(RUNTIME_INSTANCE_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isFile() && INSTANCE_FILE_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .toSorted((left, right) => left.localeCompare(right));

    if (files.length !== 1) {
      return null;
    }

    const fileName = files[0];
    if (!fileName) {
      return null;
    }

    const content = readFileSync(path.join(RUNTIME_INSTANCE_ROOT, fileName), "utf8");
    const parsed = JSON.parse(content) as {
      instance?: { name?: unknown; localInstanceId?: unknown; userPin?: unknown };
      runtime?: { safetyProfile?: unknown; createdAt?: unknown; updatedAt?: unknown };
    };

    const name = typeof parsed.instance?.name === "string" ? parsed.instance.name.trim() : "";
    const localInstanceId =
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

    if (!name || !localInstanceId) {
      return null;
    }

    return {
      fileName,
      localInstanceId,
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
    return normalizeInstanceId(fromEnv);
  }

  return readPersistedActiveInstanceSync()?.localInstanceId ?? null;
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
