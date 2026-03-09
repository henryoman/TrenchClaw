import type { Dirent } from "node:fs";
import { readdir, rm, unlink } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DB_ROOT = join(APP_ROOT, "src/ai/brain/db");
const TURBO_ROOT = join(APP_ROOT, ".turbo");

const DB_FILES_TO_KEEP = new Set([
  ".gitignore",
  "README.md",
  "memory/MEMORY.md",
  "sessions/.keep",
  "summaries/.keep",
  "summary/.keep",
  "system/.keep",
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

const cleanDbArtifacts = async (): Promise<number> => {
  const files = await listFilesRecursively(DB_ROOT);
  const removableFiles = files.filter((absolutePath) => {
    const normalizedRelative = relative(DB_ROOT, absolutePath).replaceAll("\\", "/");
    return !DB_FILES_TO_KEEP.has(normalizedRelative);
  });
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

const dbRemoved = await cleanDbArtifacts();
const turboRemoved = await cleanTurboLogs();

console.log(
  `Runtime cleanup complete (db files removed: ${dbRemoved}, turbo logs removed: ${turboRemoved}).`,
);
