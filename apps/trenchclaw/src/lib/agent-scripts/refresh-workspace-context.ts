import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";

import { loadRuntimeSettings } from "../../runtime/load";
import { getSqliteSchemaSnapshot, syncSqliteSchema } from "../../runtime/storage/sqlite-orm";
import { assertWritePathInRoots } from "../../runtime/security/write-scope";
import {
  getRuntimeCapabilitySnapshot,
  renderRuntimeActionCatalogTable,
  renderRuntimeChatToolCatalogTable,
} from "../../runtime/capabilities";
import { RUNTIME_DB_ROOT, RUNTIME_GENERATED_ROOT } from "../../runtime/runtime-paths";

const APP_ROOT_DIR = fileURLToPath(new URL("../../../", import.meta.url));
const CONTEXT_ROOT_LABEL = "apps/trenchclaw";
const PROTECTED_CONTEXT_FILE = `${RUNTIME_GENERATED_ROOT}/workspace-context.md`;
const SQLITE_SQL_SNAPSHOT_FILE = fileURLToPath(new URL("../../../../../docs/storage-schema.snapshot.sql", import.meta.url));
const GUI_TRANSPORT_FILE = fileURLToPath(new URL("../../runtime/gui-transport/router.ts", import.meta.url));
const CONTEXT_DB_PATH_ENV = "TRENCHCLAW_CONTEXT_DB_PATH";
const DEFAULT_LIVE_DB_PATH_CANDIDATES = [
  join(RUNTIME_DB_ROOT, "runtime.sqlite"),
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

const buildTree = async (rootPath: string, rootLabel?: string): Promise<string> => {
  const { readdir } = await import("node:fs/promises");
  const walk = async (dirPath: string, prefix: string): Promise<string[]> => {
    const entries = (await readdir(dirPath, { withFileTypes: true }))
      .filter((entry) => !OMITTED_DIR_NAMES.has(entry.name))
      .map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }))
      .toSorted(sortEntries);

    const renderedEntries = await Promise.all(
      entries.map(async (entry, index) => {
        const isLast = index === entries.length - 1;
        const connector = isLast ? "`-- " : "|-- ";
        const nextPrefix = prefix + (isLast ? "    " : "|   ");
        const rendered = [`${prefix}${connector}${entry.isDirectory ? `${entry.name}/` : entry.name}`];

        if (entry.isDirectory) {
          rendered.push(...(await walk(join(dirPath, entry.name), nextPrefix)));
        }

        return rendered;
      }),
    );

    return renderedEntries.flat();
  };

  const lines = [`${rootLabel ?? basename(rootPath)}/`, ...(await walk(rootPath, ""))];
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
  const existenceResults = await Promise.all(
    candidates.map(async (pathCandidate) => ({
      pathCandidate,
      exists: await Bun.file(pathCandidate).exists(),
    })),
  );
  const firstExisting = existenceResults.find((candidate) => candidate.exists)?.pathCandidate;
  if (firstExisting) {
    return firstExisting;
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

const toMarkdownTable = (headers: string[], rows: string[][]): string => {
  const headerLine = `| ${headers.join(" | ")} |`;
  const dividerLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [headerLine, dividerLine, body].filter((line) => line.length > 0).join("\n");
};

const getGuiApiRoutesTable = async (): Promise<string> => {
  const source = await readFile(GUI_TRANSPORT_FILE, "utf8");
  const matches = source.matchAll(/pathname\s*===\s*"([^"]+)"/g);
  const routeCandidates = Array.from(matches, (match) => match[1]);
  const routes = Array.from(
    new Set(routeCandidates.filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0)),
  ).toSorted((a, b) => a.localeCompare(b));
  return toMarkdownTable(["routePath"], routes.map((route) => [route]));
};

export const refreshWorkspaceContext = async (): Promise<string[]> => {
  const generatedAt = new Date().toISOString();
  const runtimeSettings = await loadRuntimeSettings();
  const capabilitySnapshot = getRuntimeCapabilitySnapshot(runtimeSettings);
  const sourceTree = await buildTree(APP_ROOT_DIR, CONTEXT_ROOT_LABEL);
  const sqliteSchemaSnapshot = getSqliteSchemaSnapshot();
  const canonicalSchemaSql = getCanonicalSchemaSqlDump();
  const liveSchemaSql = await getLiveSchemaSqlDump();
  const runtimeActionCatalogTable = renderRuntimeActionCatalogTable(capabilitySnapshot);
  const runtimeChatToolCatalogTable = renderRuntimeChatToolCatalogTable(capabilitySnapshot);
  const guiApiRoutesTable = await getGuiApiRoutesTable();

  const markdown = `# Workspace Context Snapshot

Generated at: ${generatedAt}
Root: ${CONTEXT_ROOT_LABEL}/

This file is generated. Refresh with:
\`bun run context:refresh\`

## Workspace Map (${CONTEXT_ROOT_LABEL}/)
\`\`\`text
# WORKSPACE ROOT: ${CONTEXT_ROOT_LABEL}/
${sourceTree}
\`\`\`

Omitted generated/vendor directories: ${Array.from(OMITTED_DIR_NAMES).join(", ")}

## Runtime Action Catalog (Generated)
${runtimeActionCatalogTable}

## Runtime Chat Tool Catalog (Generated)
${runtimeChatToolCatalogTable}

## GUI API Route Catalog (Generated)
${guiApiRoutesTable}

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

  await mkdir(dirname(PROTECTED_CONTEXT_FILE), { recursive: true });
  assertWritePathInRoots({
    targetPath: PROTECTED_CONTEXT_FILE,
    roots: [".runtime-state/generated"],
    scope: "system-context-refresh",
    operation: "write workspace context snapshot",
  });
  await writeFile(PROTECTED_CONTEXT_FILE, markdown, "utf8");
  await mkdir(dirname(SQLITE_SQL_SNAPSHOT_FILE), { recursive: true });
  assertWritePathInRoots({
    targetPath: SQLITE_SQL_SNAPSHOT_FILE,
    roots: [fileURLToPath(new URL("../../../../../docs", import.meta.url))],
    scope: "system-context-refresh",
    operation: "write sqlite schema sql snapshot",
  });
  await writeFile(SQLITE_SQL_SNAPSHOT_FILE, canonicalSchemaSql, "utf8");

  return [
    `Workspace context refreshed: ${PROTECTED_CONTEXT_FILE}`,
    `Canonical SQLite SQL snapshot written: ${SQLITE_SQL_SNAPSHOT_FILE}`,
  ];
};

if (import.meta.main) {
  for (const line of await refreshWorkspaceContext()) {
    console.log(line);
  }
}
