import type { Dirent } from "node:fs";
import { readdir, rm, unlink } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_INSTANCE_ROOT, RUNTIME_STATE_ROOT } from "../../runtime/runtimePaths";

const APP_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const LEGACY_DB_ROOT = join(RUNTIME_STATE_ROOT, "db");
const TURBO_ROOT = join(APP_ROOT, ".turbo");

const GENERATED_FILES_TO_KEEP = new Set([
  ".gitignore",
]);

const listFilesRecursively = async (rootDir: string): Promise<string[]> => {
  const walk = async (currentDir: string): Promise<string[]> => {
    let entries: Dirent<string>[];
    try {
      entries = await readdir(currentDir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return [];
    }

    const nestedResults = await Promise.all(entries.map(async (entry) => {
      const absolutePath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        return walk(absolutePath);
      }

      if (entry.isFile()) {
        return [absolutePath];
      }
      return [];
    }));

    return nestedResults.flat();
  };

  return walk(rootDir);
};

const cleanLegacyDbArtifacts = async (): Promise<number> => {
  const files = await listFilesRecursively(LEGACY_DB_ROOT);
  await Promise.all(files.map(async (absolutePath) => {
    await unlink(absolutePath);
  }));
  return files.length;
};

const cleanGeneratedArtifacts = async (): Promise<number> => {
  let instanceEntries: Dirent<string>[];
  try {
    instanceEntries = await readdir(RUNTIME_INSTANCE_ROOT, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return 0;
  }

  const generatedRoots = instanceEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(RUNTIME_INSTANCE_ROOT, entry.name, "cache", "generated"));

  const removableFiles = (
    await Promise.all(generatedRoots.map(async (generatedRoot) => {
      const files = await listFilesRecursively(generatedRoot);
      return files.filter((absolutePath) => {
        const normalizedRelative = relative(generatedRoot, absolutePath).replaceAll("\\", "/");
        return !GENERATED_FILES_TO_KEEP.has(normalizedRelative);
      });
    }))
  ).flat();

  await Promise.all(removableFiles.map(async (absolutePath) => {
    await unlink(absolutePath);
  }));
  return removableFiles.length;
};

const cleanTurboLogs = async (): Promise<number> => {
  let entries: Dirent<string>[];
  try {
    entries = await readdir(TURBO_ROOT, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return 0;
  }

  const logEntries = entries.filter((entry) => entry.isFile() && /^turbo-.*\.log$/u.test(entry.name));
  await Promise.all(logEntries.map(async (entry) => {
    await rm(join(TURBO_ROOT, entry.name), { force: true });
  }));
  return logEntries.length;
};

const legacyDbRemoved = await cleanLegacyDbArtifacts();
const generatedRemoved = await cleanGeneratedArtifacts();
const turboRemoved = await cleanTurboLogs();

console.log(
  `Runtime cleanup complete (legacy db files removed: ${legacyDbRemoved}, generated files removed: ${generatedRemoved}, turbo logs removed: ${turboRemoved}).`,
);
