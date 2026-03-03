import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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

const readInstanceFiles = async (): Promise<Array<{ fileName: string; document: InstanceDocument }>> => {
  assertInstanceSystemWritePath(INSTANCE_DIRECTORY, "initialize instance profile directory");
  await mkdir(INSTANCE_DIRECTORY, { recursive: true });
  const entries = await readdir(INSTANCE_DIRECTORY, { withFileTypes: true, encoding: "utf8" });
  const files = entries
    .filter((entry) => entry.isFile() && /^user-\d+\.json$/u.test(entry.name))
    .map((entry) => entry.name)
    .toSorted((a, b) => a.localeCompare(b));

  const loaded = await Promise.all(
    files.map(async (fileName) => {
      const absolutePath = path.join(INSTANCE_DIRECTORY, fileName);
      const content = await readFile(absolutePath, "utf8");
      const document = parseInstanceDocument(content);
      return document ? { fileName, document } : null;
    }),
  );

  return loaded.filter((entry): entry is { fileName: string; document: InstanceDocument } => entry !== null);
};

const nextInstanceNumberFromFiles = (fileNames: string[]): number => {
  const numbers = fileNames
    .map((fileName) => /^user-(\d+)\.json$/u.exec(fileName)?.[1])
    .filter((value): value is string => value !== undefined)
    .map((value) => Number(value))
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
  const nextNumber = nextInstanceNumberFromFiles(existing.map((entry) => entry.fileName));
  const localInstanceId = String(nextNumber).padStart(4, "0");
  const fileName = `user-${nextNumber}.json`;
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

  const nextInstanceFilePath = path.join(INSTANCE_DIRECTORY, fileName);
  assertInstanceSystemWritePath(nextInstanceFilePath, "write instance profile");
  await writeFile(nextInstanceFilePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  const instance = toInstanceView(fileName, document);
  context.setActiveInstance(instance);
  context.setActiveChatId(null);
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
  process.env.TRENCHCLAW_OPERATOR_ALIAS = instance.name;
  process.env.TRENCHCLAW_PROFILE = instance.safetyProfile;
  process.env.TRENCHCLAW_ACTIVE_INSTANCE_ID = instance.localInstanceId;
  context.addActivity("runtime", `Instance signed in: ${instance.name} (${instance.localInstanceId})`);
  return { instance };
};
