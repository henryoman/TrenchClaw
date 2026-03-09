import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { GuiInstanceProfileView } from "@trenchclaw/types";

import { assertInstanceSystemWritePath } from "./security/write-scope";
import { RUNTIME_INSTANCE_ROOT } from "./runtime-paths";

const ACTIVE_INSTANCE_STATE_FILE = path.join(RUNTIME_INSTANCE_ROOT, "active-instance.json");
const INSTANCE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/u;

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

export const readPersistedActiveInstanceSync = (): GuiInstanceProfileView | null => {
  if (!existsSync(ACTIVE_INSTANCE_STATE_FILE)) {
    return null;
  }

  try {
    return parsePersistedActiveInstance(readFileSync(ACTIVE_INSTANCE_STATE_FILE, "utf8"));
  } catch {
    return null;
  }
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
