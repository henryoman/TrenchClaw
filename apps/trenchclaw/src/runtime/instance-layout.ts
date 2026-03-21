import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

import { ensureAiSettingsFileExists } from "../ai/llm/ai-settings-file";
import { ensureCompatibilitySettingsFileExists } from "../ai/llm/user-settings-loader";
import { ensureVaultFileExists, resolveInstanceVaultPath } from "../ai/llm/vault-file";
import {
  resolveInstanceAiSettingsPath,
  resolveInstanceTradingSettingsPath,
  resolveInstanceCompatibilitySettingsPath,
} from "./instance-paths";
import { writeInstanceTradingSettings } from "./load/trading-settings";
import { resolveInstanceDirectoryPath } from "./instance-state";
import { assertInstanceSystemWritePath } from "./security/write-scope";
import { INSTANCE_LAYOUT_DIRECTORY_PATHS } from "./instance-layout-schema";

export interface EnsuredInstanceLayout {
  instanceRoot: string;
  createdDirectories: string[];
  createdFiles: string[];
}

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

  return {
    instanceRoot,
    createdDirectories,
    createdFiles,
  };
};
