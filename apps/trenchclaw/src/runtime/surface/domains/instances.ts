import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  RuntimeApiCreateInstanceRequest,
  RuntimeApiCreateInstanceResponse,
  RuntimeApiInstanceProfileView,
  RuntimeApiInstancesResponse,
  RuntimeApiSignInInstanceRequest,
  RuntimeApiSignInInstanceResponse,
  RuntimeApiSignOutInstanceResponse,
} from "@trenchclaw/types";
import {
  assertInstanceSystemWritePath,
} from "../../security/writeScope";
import { ensureInstanceLayout } from "../../instance/layout";
import { isRecord } from "../../shared/objectUtils";
import { persistActiveInstance } from "../../instance/state";
import { INSTANCE_DIRECTORY } from "../constants";
import type { RuntimeTransportContext } from "../contracts";

type RuntimeSafetyProfile = "safe" | "dangerous" | "veryDangerous";

interface InstanceDocument {
  instance: {
    name: string;
    localInstanceId: string;
    userPin: string | null;
  };
  runtime: {
    safetyProfile: RuntimeSafetyProfile;
    createdAt: string;
    updatedAt: string;
  };
}

const INSTANCE_DIRECTORY_REGEX = /^(\d{2})$/u;
const INSTANCE_PROFILE_FILE_NAME = "instance.json";
const formatInstanceNumber = (value: number): string => String(value).padStart(2, "0");
const formatInstanceId = (value: number): string => formatInstanceNumber(value);
const getInstanceNumber = (value: string): number | null => {
  const directoryMatch = INSTANCE_DIRECTORY_REGEX.exec(value);
  if (directoryMatch?.[1]) {
    return Number(directoryMatch[1]);
  }

  return null;
};

const compareInstanceIds = (left: string, right: string): number => {
  const leftNumber = getInstanceNumber(left);
  const rightNumber = getInstanceNumber(right);
  if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
};

const normalizeInstanceId = (value: string): string => {
  const trimmed = value.trim();
  if (!/^\d{2}$/u.test(trimmed)) {
    throw new Error(`Invalid instance id: ${value}`);
  }
  return trimmed;
};

const getInstanceProfilePath = (localInstanceId: string): string =>
  path.join(INSTANCE_DIRECTORY, localInstanceId, INSTANCE_PROFILE_FILE_NAME);

const toInstanceView = (fileName: string, document: InstanceDocument): RuntimeApiInstanceProfileView => ({
  fileName,
  localInstanceId: document.instance.localInstanceId,
  name: document.instance.name,
  safetyProfile: document.runtime.safetyProfile,
  userPinRequired: document.instance.userPin !== null,
  createdAt: document.runtime.createdAt,
  updatedAt: document.runtime.updatedAt,
});

const parseInstanceDocument = (raw: string): InstanceDocument | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.instance) || !isRecord(parsed.runtime)) {
      return null;
    }
    const instanceName = typeof parsed.instance.name === "string" ? parsed.instance.name.trim() : "";
    const localInstanceId = typeof parsed.instance.localInstanceId === "string"
      ? normalizeInstanceId(parsed.instance.localInstanceId)
      : "";
    const userPin = parsed.instance.userPin === null || typeof parsed.instance.userPin === "string" ? parsed.instance.userPin : null;
    const safetyProfile =
      parsed.runtime.safetyProfile === "safe" ||
      parsed.runtime.safetyProfile === "dangerous" ||
      parsed.runtime.safetyProfile === "veryDangerous"
        ? parsed.runtime.safetyProfile
        : "dangerous";
    const createdAt = typeof parsed.runtime.createdAt === "string" ? parsed.runtime.createdAt : new Date().toISOString();
    const updatedAt = typeof parsed.runtime.updatedAt === "string" ? parsed.runtime.updatedAt : createdAt;

    if (!instanceName || !localInstanceId) {
      return null;
    }

    return {
      instance: {
        name: instanceName,
        localInstanceId,
        userPin: userPin ?? null,
      },
      runtime: {
        safetyProfile,
        createdAt,
        updatedAt,
      },
    };
  } catch {
    return null;
  }
};

const readInstanceFiles = async (): Promise<Array<{ fileName: string; document: InstanceDocument }>> => {
  assertInstanceSystemWritePath(INSTANCE_DIRECTORY, "initialize instance profile directory");
  await mkdir(INSTANCE_DIRECTORY, { recursive: true });
  const entries = await readdir(INSTANCE_DIRECTORY, { withFileTypes: true, encoding: "utf8" });
  const instanceEntries = new Map<string, { directoryName: string }>();

  for (const entry of entries) {
    if (entry.isDirectory() && INSTANCE_DIRECTORY_REGEX.test(entry.name)) {
      instanceEntries.set(entry.name, { directoryName: entry.name });
    }
  }

  const localInstanceIds = [...instanceEntries.keys()].toSorted(compareInstanceIds);

  const loaded = await Promise.all(
    localInstanceIds.map(async (localInstanceId) => {
      const entry = instanceEntries.get(localInstanceId);
      if (!entry) {
        return null;
      }

      try {
        const absolutePath = getInstanceProfilePath(entry.directoryName);
        const content = await readFile(absolutePath, "utf8");
        const document = parseInstanceDocument(content);
        if (document) {
          return { fileName: INSTANCE_PROFILE_FILE_NAME, document };
        }
      } catch {
        // Fall back to null below.
      }

      return null;
    }),
  );

  return loaded.filter((entry): entry is { fileName: string; document: InstanceDocument } => entry !== null);
};

const nextInstanceNumberFromFiles = (instanceIds: string[]): number => {
  const numbers = instanceIds
    .map((instanceId) => getInstanceNumber(instanceId))
    .filter((value): value is number => value !== null)
    .filter((value) => Number.isInteger(value) && value >= 0);

  if (numbers.length === 0) {
    return 0;
  }

  return Math.max(...numbers) + 1;
};

export const listInstances = async (): Promise<RuntimeApiInstancesResponse> => {
  const instances = (await readInstanceFiles()).map((entry) => toInstanceView(entry.fileName, entry.document));
  return { instances };
};

export const createInstance = async (
  context: RuntimeTransportContext,
  payload: RuntimeApiCreateInstanceRequest,
): Promise<RuntimeApiCreateInstanceResponse> => {
  assertInstanceSystemWritePath(INSTANCE_DIRECTORY, "initialize instance profile directory");
  await mkdir(INSTANCE_DIRECTORY, { recursive: true });
  const existing = await readInstanceFiles();
  const nextNumber = nextInstanceNumberFromFiles(existing.map((entry) => entry.document.instance.localInstanceId));
  const localInstanceId = formatInstanceId(nextNumber);
  const fileName = INSTANCE_PROFILE_FILE_NAME;
  const nowIso = new Date().toISOString();
  const safetyProfile = payload.safetyProfile ?? "dangerous";

  const document: InstanceDocument = {
    instance: {
      name: payload.name.trim(),
      localInstanceId,
      userPin: payload.userPin?.trim() ? payload.userPin.trim() : null,
    },
    runtime: {
      safetyProfile,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  };

  const nextInstanceFilePath = getInstanceProfilePath(localInstanceId);
  assertInstanceSystemWritePath(nextInstanceFilePath, "write instance profile");
  await mkdir(path.dirname(nextInstanceFilePath), { recursive: true });
  await writeFile(nextInstanceFilePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await ensureInstanceLayout(localInstanceId);
  const instance = toInstanceView(fileName, document);
  context.setActiveInstance(instance);
  context.setActiveChatId(null);
  await persistActiveInstance(instance);
  process.env.TRENCHCLAW_OPERATOR_ALIAS = instance.name;
  process.env.TRENCHCLAW_PROFILE = instance.safetyProfile;
  process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instance.localInstanceId;
  context.addActivity("runtime", `Instance created: ${instance.name} (${instance.localInstanceId})`);
  return { instance };
};

export const signInInstance = async (
  context: RuntimeTransportContext,
  payload: RuntimeApiSignInInstanceRequest,
): Promise<RuntimeApiSignInInstanceResponse> => {
  const instances = await readInstanceFiles();
  const target = instances.find((entry) => entry.document.instance.localInstanceId === payload.localInstanceId);

  if (!target) {
    throw new Error(`Instance not found: ${payload.localInstanceId}`);
  }

  const requiredPin = target.document.instance.userPin;
  if (requiredPin !== null && requiredPin !== (payload.userPin ?? "")) {
    throw new Error("Invalid PIN");
  }

  const instance = toInstanceView(target.fileName, target.document);
  await ensureInstanceLayout(instance.localInstanceId);
  context.setActiveInstance(instance);
  context.setActiveChatId(null);
  await persistActiveInstance(instance);
  process.env.TRENCHCLAW_OPERATOR_ALIAS = instance.name;
  process.env.TRENCHCLAW_PROFILE = instance.safetyProfile;
  process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instance.localInstanceId;
  context.addActivity("runtime", `Instance signed in: ${instance.name} (${instance.localInstanceId})`);
  return { instance };
};

export const signOutInstance = async (
  context: RuntimeTransportContext,
): Promise<RuntimeApiSignOutInstanceResponse> => {
  const activeInstance = context.getActiveInstance();
  context.setActiveInstance(null);
  context.setActiveChatId(null);
  await persistActiveInstance(null);
  delete process.env.TRENCHCLAW_OPERATOR_ALIAS;
  delete process.env.TRENCHCLAW_PROFILE;
  context.addActivity(
    "runtime",
    activeInstance
      ? `Instance signed out: ${activeInstance.name} (${activeInstance.localInstanceId})`
      : "Instance signed out",
  );
  return { ok: true };
};
