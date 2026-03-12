import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  GuiCreateInstanceRequest,
  GuiCreateInstanceResponse,
  GuiInstanceProfileView,
  GuiInstancesResponse,
  GuiSignInInstanceRequest,
  GuiSignInInstanceResponse,
} from "@trenchclaw/types";
import {
  assertInstanceSystemWritePath,
} from "../../security/write-scope";
import { persistActiveInstance } from "../../instance-state";
import { INSTANCE_DIRECTORY } from "../constants";
import { isRecord } from "../parsers";
import type { RuntimeGuiDomainContext } from "../contracts";

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

const INSTANCE_FILE_REGEX = /^i-(\d+)\.json$/u;
const INSTANCE_DIRECTORY_REGEX = /^i-(\d+)$/u;
const INSTANCE_PROFILE_FILE_NAME = "instance.json";
const formatInstanceNumber = (value: number): string => String(value).padStart(2, "0");
const formatInstanceId = (value: number): string => `i-${formatInstanceNumber(value)}`;
const getInstanceNumber = (value: string): number | null => {
  const fileMatch = INSTANCE_FILE_REGEX.exec(value);
  if (fileMatch?.[1]) {
    return Number(fileMatch[1]);
  }

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

const getInstanceProfilePath = (localInstanceId: string): string =>
  path.join(INSTANCE_DIRECTORY, localInstanceId, INSTANCE_PROFILE_FILE_NAME);

const getLegacyInstanceProfilePath = (localInstanceId: string): string =>
  path.join(INSTANCE_DIRECTORY, `${localInstanceId}.json`);

const toInstanceView = (fileName: string, document: InstanceDocument): GuiInstanceProfileView => ({
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
    const localInstanceId = typeof parsed.instance.localInstanceId === "string" ? parsed.instance.localInstanceId.trim() : "";
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

const createRecoveredInstanceDocument = (input: {
  localInstanceId: string;
  createdAt: string;
  updatedAt: string;
}): InstanceDocument => ({
  instance: {
    name: input.localInstanceId,
    localInstanceId: input.localInstanceId,
    userPin: null,
  },
  runtime: {
    safetyProfile: "dangerous",
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  },
});

const resolveRecoveredInstanceDocument = async (directoryName: string): Promise<InstanceDocument> => {
  const absolutePath = path.join(INSTANCE_DIRECTORY, directoryName);
  try {
    const directoryStats = await stat(absolutePath);
    const createdAt = new Date(directoryStats.birthtimeMs || directoryStats.ctimeMs || directoryStats.mtimeMs).toISOString();
    const updatedAt = new Date(directoryStats.mtimeMs || directoryStats.ctimeMs || directoryStats.birthtimeMs).toISOString();
    return createRecoveredInstanceDocument({
      localInstanceId: directoryName,
      createdAt,
      updatedAt,
    });
  } catch {
    const nowIso = new Date().toISOString();
    return createRecoveredInstanceDocument({
      localInstanceId: directoryName,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }
};

const readInstanceFiles = async (): Promise<Array<{ fileName: string; document: InstanceDocument }>> => {
  assertInstanceSystemWritePath(INSTANCE_DIRECTORY, "initialize instance profile directory");
  await mkdir(INSTANCE_DIRECTORY, { recursive: true });
  const entries = await readdir(INSTANCE_DIRECTORY, { withFileTypes: true, encoding: "utf8" });
  const instanceEntries = new Map<string, { fileName: string | null; directoryName: string | null }>();

  for (const entry of entries) {
    if (entry.isFile() && INSTANCE_FILE_REGEX.test(entry.name)) {
      const localInstanceId = entry.name.replace(/\.json$/u, "");
      const existing = instanceEntries.get(localInstanceId) ?? { fileName: null, directoryName: null };
      existing.fileName = entry.name;
      instanceEntries.set(localInstanceId, existing);
      continue;
    }

    if (entry.isDirectory() && INSTANCE_DIRECTORY_REGEX.test(entry.name)) {
      const existing = instanceEntries.get(entry.name) ?? { fileName: null, directoryName: null };
      existing.directoryName = entry.name;
      instanceEntries.set(entry.name, existing);
    }
  }

  const localInstanceIds = [...instanceEntries.keys()].toSorted(compareInstanceIds);

  const loaded = await Promise.all(
    localInstanceIds.map(async (localInstanceId) => {
      const entry = instanceEntries.get(localInstanceId);
      if (!entry) {
        return null;
      }

      if (entry.directoryName) {
        try {
          const profilePath = getInstanceProfilePath(entry.directoryName);
          const content = await readFile(profilePath, "utf8");
          const document = parseInstanceDocument(content);
          if (document) {
            return { fileName: INSTANCE_PROFILE_FILE_NAME, document };
          }
        } catch {
          // Fall back to directory recovery below.
        }

        return {
          fileName: INSTANCE_PROFILE_FILE_NAME,
          document: await resolveRecoveredInstanceDocument(entry.directoryName),
        };
      }

      if (entry.fileName) {
        try {
          const absolutePath = getLegacyInstanceProfilePath(localInstanceId);
          const content = await readFile(absolutePath, "utf8");
          const document = parseInstanceDocument(content);
          if (document) {
            return { fileName: INSTANCE_PROFILE_FILE_NAME, document };
          }
        } catch {
          // Fall back to null below.
        }
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
    .filter((value) => Number.isInteger(value) && value > 0);

  if (numbers.length === 0) {
    return 1;
  }

  return Math.max(...numbers) + 1;
};

export const listInstances = async (): Promise<GuiInstancesResponse> => {
  const instances = (await readInstanceFiles()).map((entry) => toInstanceView(entry.fileName, entry.document));
  return { instances };
};

export const createInstance = async (
  context: RuntimeGuiDomainContext,
  payload: GuiCreateInstanceRequest,
): Promise<GuiCreateInstanceResponse> => {
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
  context: RuntimeGuiDomainContext,
  payload: GuiSignInInstanceRequest,
): Promise<GuiSignInInstanceResponse> => {
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
  context.setActiveInstance(instance);
  context.setActiveChatId(null);
  await persistActiveInstance(instance);
  process.env.TRENCHCLAW_OPERATOR_ALIAS = instance.name;
  process.env.TRENCHCLAW_PROFILE = instance.safetyProfile;
  process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instance.localInstanceId;
  context.addActivity("runtime", `Instance signed in: ${instance.name} (${instance.localInstanceId})`);
  return { instance };
};
