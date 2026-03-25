import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";

import { getSqliteSchemaSnapshot, syncSqliteSchema } from "../runtime/storage/sqlite-orm";
import { assertWritePathInRoots } from "../runtime/security/write-scope";
import { CORE_APP_ROOT } from "../runtime/runtime-paths";
import { resolveCurrentActiveInstanceIdSync, resolveRequiredActiveInstanceIdSync } from "../runtime/instance/state";
import {
  resolveInstanceGeneratedRoot,
  resolveInstanceKnowledgeIndexPath,
  resolveInstanceRuntimeDbPath,
  resolveInstanceWorkspaceContextPath,
} from "../runtime/instance/paths";

const APP_ROOT_DIR = CORE_APP_ROOT;
const CONTEXT_ROOT_LABEL = existsSync(join(APP_ROOT_DIR, "package.json")) ? "apps/trenchclaw" : "core";
const SQLITE_SQL_SNAPSHOT_FILE = join(APP_ROOT_DIR, "..", "..", "docs", "storage-schema.snapshot.sql");
const RUNTIME_SURFACE_ROUTER_FILE = join(APP_ROOT_DIR, "src/runtime/surface/router.ts");
const CONTEXT_DB_PATH_ENV = "TRENCHCLAW_CONTEXT_DB_PATH";
const DEFAULT_LIVE_DB_PATH_CANDIDATES = (() => {
  const activeInstanceId = resolveCurrentActiveInstanceIdSync();
  return activeInstanceId ? [resolveInstanceRuntimeDbPath(activeInstanceId)] : [];
})();

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
    "src/ai/brain/config",
    "src/ai/llm",
    "src/runtime",
    "src/solana",
  ]
    .filter((relativePath) => existsSync(join(APP_ROOT_DIR, relativePath)))
    .map((relativePath) => `- \`${CONTEXT_ROOT_LABEL}/${relativePath}/\``)
    .concat([
      "- `.runtime-state/instances/<id>/cache/generated/knowledge-index.md`",
      "- `.runtime-state/instances/<id>/settings/ai.json`",
      "- `.runtime-state/instances/<id>/settings/settings.json`",
      "- `.runtime-state/instances/<id>/data/runtime.db`",
      "- `.runtime-state/instances/<id>/workspace/added-knowledge/`",
      "- `.runtime-state/instances/<id>/workspace/configs/news-feeds.json`",
      "- `.runtime-state/instances/<id>/workspace/configs/tracker.json`",
    ])
    .join("\n");

const getRuntimeTransportRoutesTable = async (): Promise<string> => {
  if (!existsSync(RUNTIME_SURFACE_ROUTER_FILE)) {
    return toMarkdownTable(["routePath"], [["unavailable in this layout"]]);
  }
  const source = await readFile(RUNTIME_SURFACE_ROUTER_FILE, "utf8");
  const matches = source.matchAll(/pathname\s*===\s*"([^"]+)"/g);
  const routeCandidates = Array.from(matches, (match) => match[1]);
  const routes = Array.from(
    new Set(routeCandidates.filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0)),
  ).toSorted((a, b) => a.localeCompare(b));
  return toMarkdownTable(["routePath"], routes.map((route) => [route]));
};

export const refreshWorkspaceContext = async (): Promise<string[]> => {
  const activeInstanceId = resolveRequiredActiveInstanceIdSync(
    "No active instance selected. Workspace context snapshots are instance-scoped.",
  );
  const generatedRoot = resolveInstanceGeneratedRoot(activeInstanceId);
  const protectedContextFile = resolveInstanceWorkspaceContextPath(activeInstanceId);
  const knowledgeIndexPath = resolveInstanceKnowledgeIndexPath(activeInstanceId);
  const generatedAt = new Date().toISOString();
  const sqliteSchemaSnapshot = getSqliteSchemaSnapshot();
  const canonicalSchemaSql = getCanonicalSchemaSqlDump();
  const liveSchemaSql = await getLiveSchemaSqlDump();
  const runtimeTransportRoutesTable = await getRuntimeTransportRoutesTable();
  const importantWorkspacePaths = renderImportantWorkspacePaths();

  const markdown = `# Workspace Context Snapshot

Generated at: ${generatedAt}
Root: ${CONTEXT_ROOT_LABEL}/

This file is generated. Refresh with:
\`bun run context:refresh\`

## Workspace Scope
This file intentionally omits the full directory tree to avoid prompt bloat.

Use \`${knowledgeIndexPath}\` for documentation inventory and workspace tools for exact path discovery.

Important paths:
${importantWorkspacePaths}

Omitted generated/vendor directories if a tree is requested elsewhere: ${Array.from(OMITTED_DIR_NAMES).join(", ")}

## Runtime Surface Route Catalog (Generated)
${runtimeTransportRoutesTable}

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

  await mkdir(dirname(protectedContextFile), { recursive: true });
  assertWritePathInRoots({
    targetPath: protectedContextFile,
    roots: [generatedRoot],
    scope: "system-context-refresh",
    operation: "write workspace context snapshot",
  });
  await writeFile(protectedContextFile, markdown, "utf8");
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
        `Workspace context refreshed: ${protectedContextFile}`,
        `Canonical SQLite SQL snapshot written: ${SQLITE_SQL_SNAPSHOT_FILE}`,
      ]
    : [`Workspace context refreshed: ${protectedContextFile}`];
};

if (import.meta.main) {
  for (const line of await refreshWorkspaceContext()) {
    console.log(line);
  }
}
