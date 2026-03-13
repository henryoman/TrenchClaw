import { mkdir } from "node:fs/promises";
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

  const createdDirectories: string[] = [];
  for (const directoryName of INSTANCE_LAYOUT_DIRECTORIES) {
    const directoryPath = path.join(instanceRoot, directoryName);
    assertInstanceSystemWritePath(directoryPath, `initialize instance ${directoryName} directory`);
    const existed = await Bun.file(directoryPath).exists();
    await mkdir(directoryPath, { recursive: true });
    if (!existed) {
      createdDirectories.push(directoryPath);
    }
  }

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
