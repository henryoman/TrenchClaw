import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getSqliteSchemaSnapshot } from "../../src/runtime/storage/sqlite-orm";

const SRC_DIR = fileURLToPath(new URL("../../src/", import.meta.url));
const CONTEXT_FILE = fileURLToPath(
  new URL("../../src/ai/brain/knowledge/workspace-and-schema.md", import.meta.url),
);

const OMITTED_DIR_NAMES = new Set([
  "node_modules",
  ".vite",
  ".next",
  ".turbo",
  ".svelte-kit",
  "dist",
  "build",
  "coverage",
]);

type TreeEntry = { name: string; isDirectory: boolean };

const sortEntries = (a: TreeEntry, b: TreeEntry): number => {
  if (a.isDirectory !== b.isDirectory) {
    return a.isDirectory ? -1 : 1;
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
};

const buildTree = async (rootPath: string): Promise<string> => {
  const { readdir } = await import("node:fs/promises");
  const lines: string[] = [`${basename(rootPath)}/`];

  const walk = async (dirPath: string, prefix: string): Promise<void> => {
    const entries = (await readdir(dirPath, { withFileTypes: true }))
      .filter((entry) => !OMITTED_DIR_NAMES.has(entry.name))
      .map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }))
      .sort(sortEntries);

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]!;
      const isLast = index === entries.length - 1;
      const connector = isLast ? "`-- " : "|-- ";
      const nextPrefix = prefix + (isLast ? "    " : "|   ");
      lines.push(`${prefix}${connector}${entry.isDirectory ? `${entry.name}/` : entry.name}`);

      if (entry.isDirectory) {
        await walk(join(dirPath, entry.name), nextPrefix);
      }
    }
  };

  await walk(rootPath, "");
  return lines.join("\n");
};

const generatedAt = new Date().toISOString();
const sourceTree = await buildTree(SRC_DIR);
const sqliteSchemaSnapshot = getSqliteSchemaSnapshot();

const markdown = `# Workspace Context Snapshot

Generated at: ${generatedAt}
Root: src/

This file is generated. Refresh with:
\`bun run context:refresh\`

## Workspace Map (src/)
\`\`\`text
# WORKSPACE ROOT: src/
${sourceTree}
\`\`\`

Omitted generated/vendor directories: ${Array.from(OMITTED_DIR_NAMES).join(", ")}

## SQLite Schema Snapshot
\`\`\`text
${sqliteSchemaSnapshot}
\`\`\`
`;

await mkdir(dirname(CONTEXT_FILE), { recursive: true });
await writeFile(CONTEXT_FILE, markdown, "utf8");

console.log(`Workspace context refreshed: ${CONTEXT_FILE}`);
