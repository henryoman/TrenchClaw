import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";

import { getSqliteSchemaSnapshot, syncSqliteSchema } from "../../runtime/storage/sqlite-orm";
import { assertWritePathInRoots } from "../../runtime/security/write-scope";
import { CORE_APP_ROOT, RUNTIME_DB_ROOT, RUNTIME_GENERATED_ROOT } from "../../runtime/runtime-paths";

const APP_ROOT_DIR = CORE_APP_ROOT;
const CONTEXT_ROOT_LABEL = existsSync(join(APP_ROOT_DIR, "package.json")) ? "apps/trenchclaw" : "core";
const PROTECTED_CONTEXT_FILE = `${RUNTIME_GENERATED_ROOT}/workspace-context.md`;
const SQLITE_SQL_SNAPSHOT_FILE = join(APP_ROOT_DIR, "..", "..", "docs", "storage-schema.snapshot.sql");
const GUI_TRANSPORT_FILE = join(APP_ROOT_DIR, "src/runtime/gui-transport/router.ts");
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

const renderImportantWorkspacePaths = (): string =>
  [
    "src/ai/config",
    "src/ai/llm",
    "src/runtime",
    "src/solana",
  ]
    .filter((relativePath) => existsSync(join(APP_ROOT_DIR, relativePath)))
    .map((relativePath) => `- \`${CONTEXT_ROOT_LABEL}/${relativePath}/\``)
    .concat([
      "- `.runtime-state/generated/knowledge-manifest.md`",
      "- `.runtime-state/db/runtime.sqlite`",
    ])
    .join("\n");

const getGuiApiRoutesTable = async (): Promise<string> => {
  if (!existsSync(GUI_TRANSPORT_FILE)) {
    return toMarkdownTable(["routePath"], [["unavailable in this layout"]]);
  }
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
  const sqliteSchemaSnapshot = getSqliteSchemaSnapshot();
  const canonicalSchemaSql = getCanonicalSchemaSqlDump();
  const liveSchemaSql = await getLiveSchemaSqlDump();
  const guiApiRoutesTable = await getGuiApiRoutesTable();
  const importantWorkspacePaths = renderImportantWorkspacePaths();

  const markdown = `# Workspace Context Snapshot

Generated at: ${generatedAt}
Root: ${CONTEXT_ROOT_LABEL}/

This file is generated. Refresh with:
\`bun run context:refresh\`

## Workspace Scope
This file intentionally omits the full directory tree to avoid prompt bloat.

Use \`.runtime-state/generated/knowledge-manifest.md\` for documentation inventory and workspace tools for exact path discovery.

Important paths:
${importantWorkspacePaths}

Omitted generated/vendor directories if a tree is requested elsewhere: ${Array.from(OMITTED_DIR_NAMES).join(", ")}

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
  const docsRoot = dirname(SQLITE_SQL_SNAPSHOT_FILE);
  if (existsSync(docsRoot)) {
    await mkdir(docsRoot, { recursive: true });
    assertWritePathInRoots({
      targetPath: SQLITE_SQL_SNAPSHOT_FILE,
      roots: [docsRoot],
      scope: "system-context-refresh",
      operation: "write sqlite schema sql snapshot",
    });
    await writeFile(SQLITE_SQL_SNAPSHOT_FILE, canonicalSchemaSql, "utf8");
  }

  return existsSync(docsRoot)
    ? [
        `Workspace context refreshed: ${PROTECTED_CONTEXT_FILE}`,
        `Canonical SQLite SQL snapshot written: ${SQLITE_SQL_SNAPSHOT_FILE}`,
      ]
    : [`Workspace context refreshed: ${PROTECTED_CONTEXT_FILE}`];
};

if (import.meta.main) {
  for (const line of await refreshWorkspaceContext()) {
    console.log(line);
  }
}
