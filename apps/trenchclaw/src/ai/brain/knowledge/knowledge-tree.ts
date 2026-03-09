import path from "node:path";
import { readdir, stat } from "node:fs/promises";

const OMITTED_DIRECTORY_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".svelte-kit",
  ".vite",
  "dist",
  "build",
  "coverage",
]);

const sortEntries = (entries: Array<{ name: string; isDirectory: boolean }>) =>
  entries.toSorted((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

const renderTree = async (
  targetDir: string,
  prefix = "",
  rootName?: string,
): Promise<string[]> => {
  const dirEntries = await readdir(targetDir);
  const normalized = sortEntries(
    await Promise.all(
      dirEntries
        .filter((name: string) => !OMITTED_DIRECTORY_NAMES.has(name))
        .map(async (name: string) => {
          const absolutePath = path.join(targetDir, name);
          const fileStat = await stat(absolutePath);
          return {
            name,
            isDirectory: fileStat.isDirectory(),
          };
        }),
    ),
  );

  const rootLabel = rootName ?? path.basename(targetDir);
  const lines: string[] = prefix ? [] : [`${rootLabel}/`];
  const renderedEntries = await Promise.all(
    normalized.map(async (entry, index) => {
      const absolutePath = path.join(targetDir, entry.name);
      const isLast = index === normalized.length - 1;
      const branch = isLast ? "`-- " : "|-- ";
      const rendered = [`${prefix}${branch}${entry.name}${entry.isDirectory ? "/" : ""}`];

      if (entry.isDirectory) {
        const childPrefix = `${prefix}${isLast ? "    " : "|   "}`;
        rendered.push(...(await renderTree(absolutePath, childPrefix)));
      }

      return rendered;
    }),
  );
  lines.push(...renderedEntries.flat());

  return lines;
};

export const renderDirectoryTree = async (targetDir: string): Promise<string> => {
  const resolved = path.resolve(targetDir);
  const fileStat = await stat(resolved);
  if (!fileStat.isDirectory()) {
    throw new Error(`Expected directory path, received: ${resolved}`);
  }

  const lines = await renderTree(resolved, "", path.basename(resolved));
  return lines.join("\n");
};
