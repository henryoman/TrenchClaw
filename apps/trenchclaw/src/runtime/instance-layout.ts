import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { ensureAiSettingsFileExists } from "../ai/llm/ai-settings-file";
import { ensureCompatibilitySettingsFileExists } from "../ai/llm/user-settings-loader";
import { ensureVaultFileExists, resolveInstanceVaultPath } from "../ai/llm/vault-file";
import {
  resolveInstanceAiSettingsPath,
  resolveInstanceTradingSettingsPath,
  resolveInstanceCompatibilitySettingsPath,
} from "./instance-paths";
import { ensureInstanceNewsFeedRegistryExists } from "./news-feed-registry";
import { ensureInstanceTrackerRegistryExists } from "./tracker-registry";
import { writeInstanceTradingSettings } from "./load/trading-settings";
import { resolveInstanceDirectoryPath } from "./instance-state";
import { RUNTIME_TEMPLATE_ROOT } from "./runtime-paths";
import { assertInstanceSystemWritePath } from "./security/write-scope";
import { INSTANCE_LAYOUT_DIRECTORY_PATHS } from "./instance-layout-schema";

export interface EnsuredInstanceLayout {
  instanceRoot: string;
  createdDirectories: string[];
  createdFiles: string[];
}

const TEMPLATE_INSTANCE_ID = "01";

const templateInstancePath = (...segments: string[]): string =>
  path.join(RUNTIME_TEMPLATE_ROOT, "instances", TEMPLATE_INSTANCE_ID, ...segments);

const defaultInstanceName = (instanceId: string): string =>
  instanceId === TEMPLATE_INSTANCE_ID ? "default" : `instance-${instanceId}`;

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
};

const directoryExists = async (directoryPath: string): Promise<boolean> => {
  try {
    return (await stat(directoryPath)).isDirectory();
  } catch {
    return false;
  }
};

const syncTemplateInstanceMissingEntries = async (instanceId: string): Promise<string[]> => {
  const sourceRoot = templateInstancePath();
  if (!(await directoryExists(sourceRoot))) {
    return [];
  }

  const destinationRoot = resolveInstanceDirectoryPath(instanceId);
  const createdFiles: string[] = [];

  const walk = async (sourcePath: string, destinationPath: string): Promise<void> => {
    const entries = await readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      const nextSourcePath = path.join(sourcePath, entry.name);
      const nextDestinationPath = path.join(destinationPath, entry.name);
      const relativePath = path.relative(sourceRoot, nextSourcePath);

      if (entry.isDirectory()) {
        await mkdir(nextDestinationPath, { recursive: true });
        await walk(nextSourcePath, nextDestinationPath);
        continue;
      }

      if (!entry.isFile() || relativePath === "instance.json" || (await fileExists(nextDestinationPath))) {
        continue;
      }

      assertInstanceSystemWritePath(nextDestinationPath, `seed instance template file ${relativePath}`);
      await mkdir(path.dirname(nextDestinationPath), { recursive: true });
      await writeFile(nextDestinationPath, await readFile(nextSourcePath));
      createdFiles.push(nextDestinationPath);
    }
  };

  await mkdir(destinationRoot, { recursive: true });
  await walk(sourceRoot, destinationRoot);
  return createdFiles;
};

const ensureInstanceProfileFile = async (instanceId: string): Promise<string | null> => {
  const instanceProfilePath = path.join(resolveInstanceDirectoryPath(instanceId), "instance.json");
  if (await fileExists(instanceProfilePath)) {
    return null;
  }

  let templatePayload: {
    instance?: { name?: string; localInstanceId?: string; userPin?: string | null };
    runtime?: Record<string, unknown>;
  } = {};

  if (await fileExists(templateInstancePath("instance.json"))) {
    try {
      templatePayload = JSON.parse(await readFile(templateInstancePath("instance.json"), "utf8")) as typeof templatePayload;
    } catch {
      templatePayload = {};
    }
  }

  const nextPayload = {
    ...templatePayload,
    instance: {
      ...(templatePayload.instance ?? {}),
      name: defaultInstanceName(instanceId),
      localInstanceId: instanceId,
      userPin: templatePayload.instance?.userPin ?? null,
    },
  };

  assertInstanceSystemWritePath(instanceProfilePath, "initialize instance profile");
  await mkdir(path.dirname(instanceProfilePath), { recursive: true });
  await writeFile(instanceProfilePath, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf8");
  return instanceProfilePath;
};

export const ensureInstanceLayout = async (instanceId: string): Promise<EnsuredInstanceLayout> => {
  const instanceRoot = resolveInstanceDirectoryPath(instanceId);
  assertInstanceSystemWritePath(instanceRoot, "initialize instance root");
  await mkdir(instanceRoot, { recursive: true });

  const directoryExists = async (directoryPath: string): Promise<boolean> => {
    try {
      return (await stat(directoryPath)).isDirectory();
    } catch {
      return false;
    }
  };

  const createdDirectories = (await Promise.all(
    INSTANCE_LAYOUT_DIRECTORY_PATHS.map(async (relativePath) => {
      const directoryPath = path.join(instanceRoot, relativePath);
      assertInstanceSystemWritePath(directoryPath, `initialize instance directory ${relativePath}`);
      const existed = await directoryExists(directoryPath);
      await mkdir(directoryPath, { recursive: true });
      return existed ? null : directoryPath;
    }),
  )).filter((directoryPath): directoryPath is string => directoryPath != null);

  const createdFiles: string[] = [];
  createdFiles.push(...await syncTemplateInstanceMissingEntries(instanceId));

  const createdInstanceProfile = await ensureInstanceProfileFile(instanceId);
  if (createdInstanceProfile) {
    createdFiles.push(createdInstanceProfile);
  }

  const vaultPath = resolveInstanceVaultPath(instanceId);
  assertInstanceSystemWritePath(vaultPath, "initialize instance vault");
  const ensuredVault = await ensureVaultFileExists({ vaultPath });
  if (ensuredVault.initializedFromTemplate) {
    createdFiles.push(vaultPath);
  }

  const tradingSettingsPath = resolveInstanceTradingSettingsPath(instanceId);
  if (!(await Bun.file(tradingSettingsPath).exists())) {
    createdFiles.push(await writeInstanceTradingSettings(instanceId, {}));
  }

  const aiSettingsPath = resolveInstanceAiSettingsPath(instanceId);
  const ensuredAiSettings = await ensureAiSettingsFileExists({ filePath: aiSettingsPath });
  if (ensuredAiSettings.initializedFromTemplate) {
    createdFiles.push(aiSettingsPath);
  }

  const compatibilitySettingsPath = resolveInstanceCompatibilitySettingsPath(instanceId);
  const compatibilitySettingsFile = Bun.file(compatibilitySettingsPath);
  const compatibilitySettingsExisted = await compatibilitySettingsFile.exists();
  await ensureCompatibilitySettingsFileExists(compatibilitySettingsPath);
  if (!compatibilitySettingsExisted) {
    createdFiles.push(compatibilitySettingsPath);
  }

  const ensuredNewsFeedRegistry = await ensureInstanceNewsFeedRegistryExists(instanceId);
  if (ensuredNewsFeedRegistry.initialized) {
    createdFiles.push(ensuredNewsFeedRegistry.filePath);
  }

  const ensuredTrackerRegistry = await ensureInstanceTrackerRegistryExists(instanceId);
  if (ensuredTrackerRegistry.initialized) {
    createdFiles.push(ensuredTrackerRegistry.filePath);
  }

  return {
    instanceRoot,
    createdDirectories,
    createdFiles,
  };
};
