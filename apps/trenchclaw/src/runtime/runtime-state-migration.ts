import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveInstanceVaultPath } from "../ai/llm/vault-file";
import { resolveInstanceDirectoryPath } from "./instance-state";
import { ensureInstanceLayout } from "./instance-layout";
import { resolveCurrentActiveInstanceIdSync } from "./instance-state";
import { RUNTIME_STATE_ROOT } from "./runtime-paths";

interface RuntimeResetReport {
  targetInstanceId: string;
  movedFiles: number;
  clearedRoots: string[];
}

const LEGACY_RUNTIME_ROOT = path.join(RUNTIME_STATE_ROOT, "runtime");
const LEGACY_DB_ROOT = path.join(RUNTIME_STATE_ROOT, "db");
const LEGACY_USER_ROOT = path.join(RUNTIME_STATE_ROOT, "user");
const LEGACY_PROTECTED_ROOT = path.join(RUNTIME_STATE_ROOT, "protected");

const fileExists = async (targetPath: string): Promise<boolean> => Bun.file(targetPath).exists();

const buffersEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
};

const moveFileIfNeeded = async (input: {
  sourcePath: string;
  destinationPath: string;
}): Promise<number> => {
  if (!(await fileExists(input.sourcePath))) {
    return 0;
  }

  const sourceContent = await readFile(input.sourcePath);
  if (await fileExists(input.destinationPath)) {
    const destinationContent = await readFile(input.destinationPath);
    if (!buffersEqual(sourceContent, destinationContent)) {
      throw new Error(`Refusing to overwrite "${input.destinationPath}" with legacy content from "${input.sourcePath}".`);
    }
    await unlink(input.sourcePath);
    return 0;
  }

  await mkdir(path.dirname(input.destinationPath), { recursive: true });
  await writeFile(input.destinationPath, sourceContent);
  await unlink(input.sourcePath);
  return 1;
};

const listFilesRecursively = async (rootDir: string): Promise<string[]> => {
  if (!existsSync(rootDir)) {
    return [];
  }

  const entries = await readdir(rootDir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      return listFilesRecursively(absolutePath);
    }
    if (entry.isFile()) {
      return [absolutePath];
    }
    return [];
  }));

  return nested.flat();
};

const moveLegacyWallets = async (targetInstanceId: string): Promise<number> => {
  const legacyKeypairsRoot = path.join(LEGACY_PROTECTED_ROOT, "keypairs");
  const instanceKeypairsRoot = path.join(resolveInstanceDirectoryPath(targetInstanceId), "keypairs");
  const sourceFiles = await listFilesRecursively(legacyKeypairsRoot);

  const movedFiles = await Promise.all(sourceFiles.map((sourcePath) => {
    const relativePath = path.relative(legacyKeypairsRoot, sourcePath);
    return moveFileIfNeeded({
      sourcePath,
      destinationPath: path.join(instanceKeypairsRoot, relativePath),
    });
  }));

  return movedFiles.reduce((total, moved) => total + moved, 0);
};

const cleanupLegacyRoot = async (rootDir: string): Promise<boolean> => {
  if (!existsSync(rootDir)) {
    return false;
  }
  await rm(rootDir, { recursive: true, force: true });
  return true;
};

export const migrateLegacyRuntimeState = async (): Promise<RuntimeResetReport | null> => {
  const targetInstanceId = resolveCurrentActiveInstanceIdSync();
  if (!targetInstanceId) {
    return null;
  }

  const legacyRoots = [LEGACY_RUNTIME_ROOT, LEGACY_DB_ROOT, LEGACY_USER_ROOT, LEGACY_PROTECTED_ROOT];
  if (!legacyRoots.some((rootDir) => existsSync(rootDir))) {
    return null;
  }

  await ensureInstanceLayout(targetInstanceId);

  const legacyVaultSources = [
    path.join(resolveInstanceDirectoryPath(targetInstanceId), "vault.json"),
    path.join(LEGACY_RUNTIME_ROOT, "vault.json"),
    path.join(LEGACY_USER_ROOT, "vault.json"),
  ];

  const movedFiles =
    (await Promise.all(legacyVaultSources.map((sourcePath) =>
      moveFileIfNeeded({
      sourcePath,
      destinationPath: resolveInstanceVaultPath(targetInstanceId),
      })
    ))).reduce((total, moved) => total + moved, 0)
    + await moveLegacyWallets(targetInstanceId);

  const clearedRoots = (
    await Promise.all(legacyRoots.map(async (rootDir) => (await cleanupLegacyRoot(rootDir) ? rootDir : null)))
  ).filter((rootDir): rootDir is string => rootDir != null);

  return {
    targetInstanceId,
    movedFiles,
    clearedRoots,
  };
};
