import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveInstanceDirectoryPath } from "./state";
import { INSTANCE_LAYOUT_DIRECTORY_PATHS, INSTANCE_LAYOUT_FILE_PATHS } from "./layoutSchema";
import { RUNTIME_SEED_INSTANCE_ID, resolveRuntimeSeedInstancePath } from "../runtimePaths";
import { assertInstanceSystemWritePath } from "../security/writeScope";

export interface EnsuredInstanceLayout {
  instanceRoot: string;
  createdDirectories: string[];
  createdFiles: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const mergeStructuredSeedDefaults = (seedValue: unknown, currentValue: unknown): unknown => {
  if (currentValue === undefined) {
    return seedValue;
  }
  if (Array.isArray(seedValue)) {
    return currentValue;
  }
  if (isRecord(seedValue) && isRecord(currentValue)) {
    const merged: Record<string, unknown> = { ...currentValue };
    for (const [key, nestedSeedValue] of Object.entries(seedValue)) {
      if (Object.hasOwn(currentValue, key)) {
        merged[key] = mergeStructuredSeedDefaults(nestedSeedValue, currentValue[key]);
        continue;
      }
      merged[key] = nestedSeedValue;
    }
    return merged;
  }
  return currentValue;
};

const toRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const mergeNamedObjectArrayDefaults = (
  seedEntries: Record<string, unknown>[],
  currentEntries: Record<string, unknown>[],
  key: string,
): Record<string, unknown>[] => {
  const merged = [...currentEntries];
  const knownKeys = new Set(
    currentEntries
      .map((entry) => entry[key])
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim()),
  );

  for (const seedEntry of seedEntries) {
    const candidateKey = seedEntry[key];
    if (typeof candidateKey !== "string" || candidateKey.trim().length === 0 || knownKeys.has(candidateKey.trim())) {
      continue;
    }
    merged.push(seedEntry);
    knownKeys.add(candidateKey.trim());
  }

  return merged;
};

const mergeTrackerRegistryDefaults = (seedValue: unknown, currentValue: unknown): unknown => {
  const merged = mergeStructuredSeedDefaults(seedValue, currentValue);
  if (!isRecord(merged) || !isRecord(seedValue) || !isRecord(currentValue)) {
    return merged;
  }

  return {
    ...merged,
    trackedWallets: mergeNamedObjectArrayDefaults(
      toRecordArray(seedValue.trackedWallets),
      toRecordArray(currentValue.trackedWallets),
      "address",
    ),
    trackedTokens: mergeNamedObjectArrayDefaults(
      toRecordArray(seedValue.trackedTokens),
      toRecordArray(currentValue.trackedTokens),
      "mintAddress",
    ),
  };
};

const mergeNewsFeedRegistryDefaults = (seedValue: unknown, currentValue: unknown): unknown => {
  const merged = mergeStructuredSeedDefaults(seedValue, currentValue);
  if (!isRecord(merged) || !isRecord(seedValue) || !isRecord(currentValue)) {
    return merged;
  }

  return {
    ...merged,
    feeds: mergeNamedObjectArrayDefaults(
      toRecordArray(seedValue.feeds),
      toRecordArray(currentValue.feeds),
      "alias",
    ),
  };
};

const mergeSeedFileDefaults = async (
  instanceRoot: string,
  relativePath: string,
): Promise<void> => {
  if (path.extname(relativePath) !== ".json") {
    return;
  }

  const destinationPath = path.join(instanceRoot, relativePath);
  const seedPath = resolveRuntimeSeedInstancePath(relativePath);

  try {
    const [destinationRaw, seedRaw] = await Promise.all([
      readFile(destinationPath, "utf8"),
      readFile(seedPath, "utf8"),
    ]);
    const destinationValue = JSON.parse(destinationRaw) as unknown;
    const seedValue = JSON.parse(seedRaw) as unknown;
    const mergedValue =
      relativePath === "workspace/configs/tracker.json"
        ? mergeTrackerRegistryDefaults(seedValue, destinationValue)
        : relativePath === "workspace/configs/news-feeds.json"
          ? mergeNewsFeedRegistryDefaults(seedValue, destinationValue)
          : mergeStructuredSeedDefaults(seedValue, destinationValue);
    const nextRaw = `${JSON.stringify(mergedValue, null, 2)}\n`;
    if (nextRaw !== destinationRaw) {
      await writeFile(destinationPath, nextRaw, "utf8");
    }
  } catch {
    // Keep personal files untouched if either side is unreadable. Later loaders can surface real parse errors.
  }
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
                ...templateInstance.instance,
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
    // oxlint-disable-next-line eslint/no-await-in-loop -- each seed file must be created before its defaults are merged.
    const createdFile = await copySeedFileIfMissing(relativePath);
    if (createdFile) {
      createdFiles.push(createdFile);
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- defaults are merged per file immediately after creation.
    await mergeSeedFileDefaults(instanceRoot, relativePath);
  }

  return {
    instanceRoot,
    createdDirectories,
    createdFiles,
  };
};
