import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveInstanceDirectoryPath } from "./instance-state";
import { INSTANCE_LAYOUT_DIRECTORY_PATHS, INSTANCE_LAYOUT_FILE_PATHS } from "./instance-layout-schema";
import { RUNTIME_SEED_INSTANCE_ID, resolveRuntimeSeedInstancePath } from "./runtime-paths";
import { assertInstanceSystemWritePath } from "./security/write-scope";

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

  const fileExists = async (filePath: string): Promise<boolean> => {
    try {
      return (await stat(filePath)).isFile();
    } catch {
      return false;
    }
  };

  const copySeedFileIfMissing = async (relativePath: string): Promise<string | null> => {
    const destinationPath = path.join(instanceRoot, relativePath);
    assertInstanceSystemWritePath(destinationPath, `initialize instance file ${relativePath}`);
    if (await fileExists(destinationPath)) {
      return null;
    }

    await mkdir(path.dirname(destinationPath), { recursive: true });
    const seedPath = resolveRuntimeSeedInstancePath(relativePath);
    if (await fileExists(seedPath)) {
      if (relativePath === "instance.json") {
        const templateInstance = JSON.parse(await readFile(seedPath, "utf8")) as {
          instance?: { name?: unknown; localInstanceId?: unknown; userPin?: unknown };
          runtime?: Record<string, unknown>;
        };
        const defaultName =
          typeof templateInstance.instance?.name === "string" && templateInstance.instance.name.trim().length > 0
            ? (instanceId === RUNTIME_SEED_INSTANCE_ID ? templateInstance.instance.name.trim() : `instance-${instanceId}`)
            : instanceId === RUNTIME_SEED_INSTANCE_ID
              ? "default"
              : `instance-${instanceId}`;
        await writeFile(
          destinationPath,
          `${JSON.stringify(
            {
              ...templateInstance,
              instance: {
                ...(templateInstance.instance ?? {}),
                name: defaultName,
                localInstanceId: instanceId,
              },
            },
            null,
            2,
          )}\n`,
          "utf8",
        );
        return destinationPath;
      }

      await copyFile(seedPath, destinationPath);
      return destinationPath;
    }

    if (path.basename(relativePath) === ".gitkeep") {
      await writeFile(destinationPath, "", "utf8");
      return destinationPath;
    }

    throw new Error(`Runtime seed is missing required file "${relativePath}" at "${seedPath}".`);
  };

  const createdFiles: string[] = [];
  for (const relativePath of INSTANCE_LAYOUT_FILE_PATHS) {
    const createdFile = await copySeedFileIfMissing(relativePath);
    if (createdFile) {
      createdFiles.push(createdFile);
    }
  }

  return {
    instanceRoot,
    createdDirectories,
    createdFiles,
  };
};
