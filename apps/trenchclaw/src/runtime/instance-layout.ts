import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

import { ensureVaultFileExists, resolveInstanceVaultPath } from "../ai/llm/vault-file";
import { resolveInstanceTradingSettingsPath, writeInstanceTradingSettings } from "./load/trading-settings";
import { resolveInstanceDirectoryPath } from "./instance-state";
import { assertInstanceSystemWritePath } from "./security/write-scope";

const INSTANCE_LAYOUT_DIRECTORIES = [
  "keypairs",
  "settings",
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

  return {
    instanceRoot,
    createdDirectories,
    createdFiles,
  };
};
