import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { runtimeStatePath } from "./corePaths";

export const createPersistedTestInstance = async (
  instanceId: string,
  input?: {
    markActive?: boolean;
    name?: string;
  },
): Promise<string> => {
  const instanceRoot = runtimeStatePath("instances", instanceId);
  await mkdir(path.join(instanceRoot, "settings"), { recursive: true });
  await mkdir(path.join(instanceRoot, "secrets"), { recursive: true });
  await mkdir(path.join(instanceRoot, "keypairs"), { recursive: true });
  await mkdir(path.join(instanceRoot, "workspace"), { recursive: true });
  await mkdir(path.join(instanceRoot, "cache"), { recursive: true });
  await mkdir(path.join(instanceRoot, "data"), { recursive: true });
  await mkdir(path.join(instanceRoot, "logs"), { recursive: true });

  await writeFile(
    path.join(instanceRoot, "instance.json"),
    `${JSON.stringify({
      instance: {
        name: input?.name ?? `instance-${instanceId}`,
        localInstanceId: instanceId,
        userPin: null,
      },
      runtime: {
        safetyProfile: "dangerous",
        createdAt: "2026-03-19T00:00:00.000Z",
        updatedAt: "2026-03-19T00:00:00.000Z",
      },
    }, null, 2)}\n`,
    "utf8",
  );

  if (input?.markActive) {
    await writeFile(
      runtimeStatePath("instances", "active-instance.json"),
      `${JSON.stringify({
        localInstanceId: instanceId,
      }, null, 2)}\n`,
      "utf8",
    );
  }

  return instanceRoot;
};
