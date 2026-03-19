import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

import { ensureAiSettingsFileExists } from "../ai/llm/ai-settings-file";
import { ensureCompatibilitySettingsFileExists } from "../ai/llm/user-settings-loader";
import { ensureVaultFileExists, resolveInstanceVaultPath } from "../ai/llm/vault-file";
import {
  resolveInstanceAiSettingsPath,
  resolveInstanceCacheRoot,
  resolveInstanceDataRoot,
  resolveInstanceLiveLogsRoot,
  resolveInstanceMemoryRoot,
  resolveInstanceSecretsRoot,
  resolveInstanceSessionsRoot,
  resolveInstanceShellHomeRoot,
  resolveInstanceSummariesRoot,
  resolveInstanceSystemLogsRoot,
  resolveInstanceTmpRoot,
  resolveInstanceToolBinRoot,
  resolveInstanceCompatibilitySettingsPath,
} from "./instance-paths";
import {
  INSTANCE_WORKSPACE_LAYOUT_DIRECTORIES,
  resolveInstanceWorkspaceRoot,
} from "./instance-workspace";
import { resolveInstanceTradingSettingsPath, writeInstanceTradingSettings } from "./load/trading-settings";
import { resolveInstanceDirectoryPath } from "./instance-state";
import { assertInstanceSystemWritePath } from "./security/write-scope";

const INSTANCE_LAYOUT_DIRECTORIES = [
  "secrets",
  "data",
  "logs",
  "cache",
  "keypairs",
  "settings",
  "workspace",
  "shell-home",
  "tmp",
  "tool-bin",
] as const;

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
    INSTANCE_LAYOUT_DIRECTORIES.map(async (directoryName) => {
      const directoryPath = path.join(instanceRoot, directoryName);
      assertInstanceSystemWritePath(directoryPath, `initialize instance ${directoryName} directory`);
      const existed = await directoryExists(directoryPath);
      await mkdir(directoryPath, { recursive: true });
      return existed ? null : directoryPath;
    }),
  )).filter((directoryPath): directoryPath is string => directoryPath != null);

  const workspaceRoot = resolveInstanceWorkspaceRoot(instanceId);
  const createdWorkspaceDirectories = (await Promise.all(
    INSTANCE_WORKSPACE_LAYOUT_DIRECTORIES.map(async (directoryName) => {
      const directoryPath = path.join(workspaceRoot, directoryName);
      assertInstanceSystemWritePath(directoryPath, `initialize instance workspace ${directoryName} directory`);
      const existed = await directoryExists(directoryPath);
      await mkdir(directoryPath, { recursive: true });
      return existed ? null : directoryPath;
    }),
  )).filter((directoryPath): directoryPath is string => directoryPath != null);

  const nestedInstanceDirectories = [
    resolveInstanceSecretsRoot(instanceId),
    resolveInstanceDataRoot(instanceId),
    resolveInstanceLiveLogsRoot(instanceId),
    resolveInstanceSessionsRoot(instanceId),
    resolveInstanceSummariesRoot(instanceId),
    resolveInstanceSystemLogsRoot(instanceId),
    resolveInstanceMemoryRoot(instanceId),
    resolveInstanceCacheRoot(instanceId),
    resolveInstanceShellHomeRoot(instanceId),
    resolveInstanceTmpRoot(instanceId),
    resolveInstanceToolBinRoot(instanceId),
  ];
  const createdNestedDirectories = (await Promise.all(
    nestedInstanceDirectories.map(async (directoryPath) => {
      assertInstanceSystemWritePath(directoryPath, "initialize nested instance directory");
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
    createdDirectories: [...createdDirectories, ...createdWorkspaceDirectories, ...createdNestedDirectories],
    createdFiles,
  };
};
