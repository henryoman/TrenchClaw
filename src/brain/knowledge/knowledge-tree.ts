import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const sortByName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

const walkDirectory = async (dirPath: string, prefix: string, lines: string[]): Promise<void> => {
  const entries = (await readdir(dirPath, { withFileTypes: true })).sort(sortByName);

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    const isLast = index === entries.length - 1;
    const connector = isLast ? "`-- " : "|-- ";
    const nextPrefix = prefix + (isLast ? "    " : "|   ");
    const label = entry.isDirectory() ? `${entry.name}/` : entry.name;

    lines.push(`${prefix}${connector}${label}`);

    if (entry.isDirectory()) {
      await walkDirectory(join(dirPath, entry.name), nextPrefix, lines);
    }
  }
};

export const renderDirectoryTree = async (rootPath: string): Promise<string> => {
  const rootLabel = `${basename(rootPath)}/`;
  const lines = [rootLabel];

  await walkDirectory(rootPath, "", lines);
  return lines.join("\n");
};

export const renderKnowledgeDirectoryTree = async (): Promise<string> => {
  const knowledgeDir = fileURLToPath(new URL("./", import.meta.url));
  return renderDirectoryTree(knowledgeDir);
};
