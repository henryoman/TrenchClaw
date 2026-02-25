import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";

import { getSqliteSchemaSnapshot, syncSqliteSchema } from "../../runtime/storage/sqlite-orm";

const SRC_DIR = fileURLToPath(new URL("../../src/", import.meta.url));
const CONTEXT_FILE = fileURLToPath(
  new URL("../../src/ai/brain/knowledge/workspace-and-schema.md", import.meta.url),
);
const SQLITE_SQL_SNAPSHOT_FILE = fileURLToPath(new URL("../../docs/storage-schema.snapshot.sql", import.meta.url));
const CONTEXT_DB_PATH_ENV = "TRENCHCLAW_CONTEXT_DB_PATH";
const DEFAULT_LIVE_DB_PATH_CANDIDATES = [
  fileURLToPath(new URL("../../src/ai/brain/db/logs/runtime/trenchclaw.db", import.meta.url)),
  fileURLToPath(new URL("../../src/ai/brain/db/runtime/trenchclaw.db", import.meta.url)),
];

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

const normalizeSqlStatement = (statement: string): string => {
  const trimmed = statement.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  return trimmed.endsWith(";") ? trimmed : `${trimmed};`;
};

const getSchemaSqlDump = (db: Database): string => {
  const rows = db
    .query(
      `
      SELECT type, name, sql
      FROM sqlite_master
      WHERE type IN ('table', 'index')
        AND name NOT LIKE 'sqlite_%'
        AND sql IS NOT NULL
      ORDER BY
        CASE type
          WHEN 'table' THEN 0
          WHEN 'index' THEN 1
          ELSE 2
        END,
        name ASC
      `,
    )
    .all() as { type: "table" | "index"; name: string; sql: string }[];

  return rows.map((row) => normalizeSqlStatement(row.sql)).join("\n\n");
};

const getCanonicalSchemaSqlDump = (): string => {
  const db = new Database(":memory:", { create: true, strict: true });
  try {
    syncSqliteSchema(db);
    return getSchemaSqlDump(db);
  } finally {
    db.close(false);
  }
};

const resolveLiveDbPath = async (): Promise<string | null> => {
  const envPath = process.env[CONTEXT_DB_PATH_ENV]?.trim();
  const candidates = envPath ? [envPath, ...DEFAULT_LIVE_DB_PATH_CANDIDATES] : DEFAULT_LIVE_DB_PATH_CANDIDATES;
  for (const pathCandidate of candidates) {
    if (await Bun.file(pathCandidate).exists()) {
      return pathCandidate;
    }
  }
  return null;
};

const getLiveSchemaSqlDump = async (): Promise<{ dbPath: string; sql: string } | null> => {
  const liveDbPath = await resolveLiveDbPath();
  if (!liveDbPath) {
    return null;
  }

  const db = new Database(liveDbPath, { readonly: true, strict: true });
  try {
    const sql = getSchemaSqlDump(db);
    return { dbPath: liveDbPath, sql };
  } finally {
    db.close(false);
  }
};

const generatedAt = new Date().toISOString();
const sourceTree = await buildTree(SRC_DIR);
const sqliteSchemaSnapshot = getSqliteSchemaSnapshot();
const canonicalSchemaSql = getCanonicalSchemaSqlDump();
const liveSchemaSql = await getLiveSchemaSqlDump();

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

## SQLite SQL Schema Snapshot (Canonical)
\`\`\`sql
${canonicalSchemaSql}
\`\`\`

## SQLite SQL Schema Snapshot (Live DB)
${
  liveSchemaSql
    ? `Source DB: \`${liveSchemaSql.dbPath}\`
\`\`\`sql
${liveSchemaSql.sql}
\`\`\``
    : `No live SQLite database found.

Set \`${CONTEXT_DB_PATH_ENV}\` to a DB path or create one at:
${DEFAULT_LIVE_DB_PATH_CANDIDATES.map((pathCandidate) => `- \`${pathCandidate}\``).join("\n")}`
}
`;

await mkdir(dirname(CONTEXT_FILE), { recursive: true });
await writeFile(CONTEXT_FILE, markdown, "utf8");
await mkdir(dirname(SQLITE_SQL_SNAPSHOT_FILE), { recursive: true });
await writeFile(SQLITE_SQL_SNAPSHOT_FILE, canonicalSchemaSql, "utf8");

console.log(`Workspace context refreshed: ${CONTEXT_FILE}`);
console.log(`Canonical SQLite SQL snapshot written: ${SQLITE_SQL_SNAPSHOT_FILE}`);
