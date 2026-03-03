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
  "events/.keep",
  "memory/MEMORY.md",
  "sessions/.keep",
  "summaries/.keep",
  "summary/.keep",
  "system/.keep",
]);

const listFilesRecursively = async (rootDir: string): Promise<string[]> => {
  const results: string[] = [];

  const walk = async (currentDir: string): Promise<void> => {
    let entries: Dirent<string>[];
    try {
      entries = await readdir(currentDir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolutePath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (entry.isFile()) {
        results.push(absolutePath);
      }
    }
  };

  await walk(rootDir);
  return results;
};

const cleanDbArtifacts = async (): Promise<number> => {
  const files = await listFilesRecursively(DB_ROOT);
  let removedCount = 0;

  for (const absolutePath of files) {
    const normalizedRelative = relative(DB_ROOT, absolutePath).replaceAll("\\", "/");
    if (DB_FILES_TO_KEEP.has(normalizedRelative)) {
      continue;
    }

    await unlink(absolutePath);
    removedCount += 1;
  }

  return removedCount;
};

const cleanTurboLogs = async (): Promise<number> => {
  let entries: Dirent<string>[];
  try {
    entries = await readdir(TURBO_ROOT, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return 0;
  }

  let removedCount = 0;
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    if (!/^turbo-.*\.log$/u.test(entry.name)) {
      continue;
    }

    await rm(join(TURBO_ROOT, entry.name), { force: true });
    removedCount += 1;
  }

  return removedCount;
};

const dbRemoved = await cleanDbArtifacts();
const turboRemoved = await cleanTurboLogs();

console.log(
  `Runtime cleanup complete (db files removed: ${dbRemoved}, turbo logs removed: ${turboRemoved}).`,
);
