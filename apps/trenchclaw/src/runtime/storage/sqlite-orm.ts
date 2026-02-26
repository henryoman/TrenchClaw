import type { Database } from "bun:sqlite";
import type { ZodTypeAny } from "zod";

import { sqliteTables } from "./sqlite-schema";

type SqlitePrimitive = "TEXT" | "INTEGER" | "REAL" | "BLOB";

type ForeignKeySpec = {
  table: string;
  column: string;
  onDelete?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION";
};

type ColumnSpec = {
  name: string;
  type: SqlitePrimitive;
  notNull?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  check?: string;
  references?: ForeignKeySpec;
};

type IndexSpec = {
  name: string;
  columns: string[];
  unique?: boolean;
};

type TableSpec = {
  name: keyof typeof sqliteTables;
  rowSchema: ZodTypeAny;
  columns: readonly ColumnSpec[];
  tableChecks?: readonly string[];
  tableConstraints?: readonly string[];
  indexes?: readonly IndexSpec[];
};

type TableInfoRow = {
  name: string;
};

export type SqliteSchemaSyncReport = {
  createdTables: string[];
  addedColumns: string[];
  createdIndexes: string[];
  warnings: string[];
};

const quoteIdentifier = (name: string): string => `"${name.replace(/"/g, "\"\"")}"`;

const renderColumnDefinition = (column: ColumnSpec): string => {
  const parts: string[] = [quoteIdentifier(column.name), column.type];
  if (column.notNull) {
    parts.push("NOT NULL");
  }
  if (column.primaryKey) {
    parts.push("PRIMARY KEY");
  }
  if (column.unique) {
    parts.push("UNIQUE");
  }
  if (column.check) {
    parts.push(`CHECK (${column.check})`);
  }
  if (column.references) {
    parts.push(
      `REFERENCES ${quoteIdentifier(column.references.table)}(${quoteIdentifier(column.references.column)})`,
    );
    if (column.references.onDelete) {
      parts.push(`ON DELETE ${column.references.onDelete}`);
    }
  }
  return parts.join(" ");
};

const SQLITE_TABLE_SPECS: readonly TableSpec[] = [
  {
    name: "schema_migrations",
    rowSchema: sqliteTables.schema_migrations,
    columns: [
      { name: "version", type: "INTEGER", primaryKey: true },
      { name: "applied_at", type: "INTEGER", notNull: true },
    ],
  },
  {
    name: "jobs",
    rowSchema: sqliteTables.jobs,
    columns: [
      { name: "id", type: "TEXT", primaryKey: true },
      { name: "bot_id", type: "TEXT", notNull: true },
      { name: "routine_name", type: "TEXT", notNull: true },
      {
        name: "status",
        type: "TEXT",
        notNull: true,
        check: "status IN ('pending', 'running', 'paused', 'stopped', 'failed')",
      },
      { name: "config_json", type: "TEXT", notNull: true },
      { name: "next_run_at", type: "INTEGER" },
      { name: "last_run_at", type: "INTEGER" },
      { name: "cycles_completed", type: "INTEGER", notNull: true, check: "cycles_completed >= 0" },
      { name: "total_cycles", type: "INTEGER", check: "total_cycles IS NULL OR total_cycles >= 0" },
      { name: "last_result_json", type: "TEXT" },
      { name: "created_at", type: "INTEGER", notNull: true },
      { name: "updated_at", type: "INTEGER", notNull: true },
    ],
    indexes: [
      { name: "idx_jobs_status_next_run_at", columns: ["status", "next_run_at"] },
      { name: "idx_jobs_bot_id_status", columns: ["bot_id", "status"] },
    ],
  },
  {
    name: "action_receipts",
    rowSchema: sqliteTables.action_receipts,
    columns: [
      { name: "idempotency_key", type: "TEXT", primaryKey: true },
      { name: "payload_json", type: "TEXT", notNull: true },
      { name: "timestamp", type: "INTEGER", notNull: true },
    ],
    indexes: [{ name: "idx_action_receipts_timestamp", columns: ["timestamp"] }],
  },
  {
    name: "conversations",
    rowSchema: sqliteTables.conversations,
    columns: [
      { name: "id", type: "TEXT", primaryKey: true },
      { name: "session_id", type: "TEXT" },
      { name: "title", type: "TEXT" },
      { name: "summary", type: "TEXT" },
      { name: "created_at", type: "INTEGER", notNull: true },
      { name: "updated_at", type: "INTEGER", notNull: true },
    ],
    indexes: [{ name: "idx_conversations_updated_at", columns: ["updated_at"] }],
  },
  {
    name: "chat_messages",
    rowSchema: sqliteTables.chat_messages,
    columns: [
      { name: "id", type: "TEXT", primaryKey: true },
      {
        name: "conversation_id",
        type: "TEXT",
        notNull: true,
        references: { table: "conversations", column: "id", onDelete: "CASCADE" },
      },
      { name: "role", type: "TEXT", notNull: true, check: "role IN ('system', 'user', 'assistant', 'tool')" },
      { name: "content", type: "TEXT", notNull: true },
      { name: "metadata_json", type: "TEXT" },
      { name: "created_at", type: "INTEGER", notNull: true },
    ],
    indexes: [{ name: "idx_chat_messages_conversation_created_at", columns: ["conversation_id", "created_at"] }],
  },
  {
    name: "market_instruments",
    rowSchema: sqliteTables.market_instruments,
    columns: [
      { name: "id", type: "INTEGER", primaryKey: true },
      { name: "chain", type: "TEXT", notNull: true },
      { name: "address", type: "TEXT", notNull: true },
      { name: "symbol", type: "TEXT" },
      { name: "name", type: "TEXT" },
      { name: "decimals", type: "INTEGER", check: "decimals IS NULL OR decimals >= 0" },
      { name: "created_at", type: "INTEGER", notNull: true },
      { name: "updated_at", type: "INTEGER", notNull: true },
    ],
    tableConstraints: ["UNIQUE(chain, address)"],
    indexes: [{ name: "idx_market_instruments_chain_symbol", columns: ["chain", "symbol"] }],
  },
  {
    name: "ohlcv_bars",
    rowSchema: sqliteTables.ohlcv_bars,
    columns: [
      {
        name: "instrument_id",
        type: "INTEGER",
        notNull: true,
        references: { table: "market_instruments", column: "id", onDelete: "CASCADE" },
      },
      { name: "source", type: "TEXT", notNull: true },
      { name: "interval", type: "TEXT", notNull: true },
      { name: "open_time", type: "INTEGER", notNull: true },
      { name: "close_time", type: "INTEGER", notNull: true },
      { name: "open", type: "REAL", notNull: true },
      { name: "high", type: "REAL", notNull: true },
      { name: "low", type: "REAL", notNull: true },
      { name: "close", type: "REAL", notNull: true },
      { name: "volume", type: "REAL" },
      { name: "trades", type: "INTEGER" },
      { name: "vwap", type: "REAL" },
      { name: "fetched_at", type: "INTEGER", notNull: true },
      { name: "raw_json", type: "TEXT" },
    ],
    tableConstraints: ["PRIMARY KEY(instrument_id, source, interval, open_time)"],
    indexes: [
      { name: "idx_ohlcv_lookup", columns: ["instrument_id", "source", "interval", "open_time"] },
      { name: "idx_ohlcv_fetched_at", columns: ["fetched_at"] },
    ],
  },
  {
    name: "market_snapshots",
    rowSchema: sqliteTables.market_snapshots,
    columns: [
      { name: "id", type: "TEXT", primaryKey: true },
      {
        name: "instrument_id",
        type: "INTEGER",
        notNull: true,
        references: { table: "market_instruments", column: "id", onDelete: "CASCADE" },
      },
      { name: "source", type: "TEXT", notNull: true },
      { name: "snapshot_type", type: "TEXT", notNull: true },
      { name: "data_json", type: "TEXT", notNull: true },
      { name: "timestamp", type: "INTEGER", notNull: true },
    ],
    indexes: [
      { name: "idx_market_snapshots_lookup", columns: ["instrument_id", "source", "snapshot_type", "timestamp"] },
    ],
  },
  {
    name: "http_cache",
    rowSchema: sqliteTables.http_cache,
    columns: [
      { name: "cache_key", type: "TEXT", primaryKey: true },
      { name: "source", type: "TEXT", notNull: true },
      { name: "endpoint", type: "TEXT", notNull: true },
      { name: "request_hash", type: "TEXT", notNull: true },
      { name: "response_json", type: "TEXT", notNull: true },
      { name: "status_code", type: "INTEGER", notNull: true },
      { name: "etag", type: "TEXT" },
      { name: "last_modified", type: "TEXT" },
      { name: "fetched_at", type: "INTEGER", notNull: true },
      { name: "expires_at", type: "INTEGER" },
    ],
    indexes: [
      { name: "idx_http_cache_expires_at", columns: ["expires_at"] },
      { name: "idx_http_cache_source_endpoint", columns: ["source", "endpoint"] },
    ],
  },
];

const DEPRECATED_TABLE_NAMES = ["policy_hits", "decision_logs"] as const;

const TABLE_SPEC_BY_NAME = new Map(SQLITE_TABLE_SPECS.map((spec) => [spec.name, spec]));

const renderCreateTableStatement = (table: TableSpec): string => {
  const columnDefinitions = table.columns.map((column) => renderColumnDefinition(column));
  const constraints = table.tableConstraints ? [...table.tableConstraints] : [];
  const defs = [...columnDefinitions, ...constraints].join(",\n  ");

  return `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(table.name)} (\n  ${defs}\n);`;
};

const tableExists = (db: Database, tableName: string): boolean => {
  const row = db
    .query(
      `
      SELECT 1 AS present
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
      LIMIT 1
    `,
    )
    .get(tableName) as { present: number } | null;

  return row != null;
};

const getExistingColumns = (db: Database, tableName: string): Set<string> => {
  const rows = db.query(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as TableInfoRow[];
  return new Set(rows.map((row) => row.name));
};

const createIndexIfMissing = (db: Database, tableName: string, index: IndexSpec): void => {
  const unique = index.unique ? "UNIQUE " : "";
  const columns = index.columns.map((column) => quoteIdentifier(column)).join(", ");
  db.exec(
    `CREATE ${unique}INDEX IF NOT EXISTS ${quoteIdentifier(index.name)} ON ${quoteIdentifier(tableName)}(${columns});`,
  );
};

const addMissingColumn = (db: Database, tableName: string, column: ColumnSpec): void => {
  if (column.primaryKey || column.unique) {
    return;
  }
  const ddl = renderColumnDefinition(column);
  db.exec(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${ddl};`);
};

export const syncSqliteSchema = (db: Database): SqliteSchemaSyncReport => {
  const report: SqliteSchemaSyncReport = {
    createdTables: [],
    addedColumns: [],
    createdIndexes: [],
    warnings: [],
  };

  const apply = db.transaction(() => {
    for (const deprecatedTableName of DEPRECATED_TABLE_NAMES) {
      if (!tableExists(db, deprecatedTableName)) {
        continue;
      }
      db.exec(`DROP TABLE ${quoteIdentifier(deprecatedTableName)};`);
    }

    for (const table of SQLITE_TABLE_SPECS) {
      const existed = tableExists(db, table.name);
      db.exec(renderCreateTableStatement(table));
      if (!existed) {
        report.createdTables.push(table.name);
      }

      const existingColumns = getExistingColumns(db, table.name);
      for (const column of table.columns) {
        if (existingColumns.has(column.name)) {
          continue;
        }
        try {
          addMissingColumn(db, table.name, column);
          report.addedColumns.push(`${table.name}.${column.name}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          report.warnings.push(`failed to add column ${table.name}.${column.name}: ${message}`);
        }
      }

      for (const index of table.indexes ?? []) {
        const indexAlreadyExists = db
          .query(
            `
            SELECT 1 AS present
            FROM sqlite_master
            WHERE type = 'index' AND name = ?
            LIMIT 1
          `,
          )
          .get(index.name) as { present: number } | null;
        createIndexIfMissing(db, table.name, index);
        if (!indexAlreadyExists) {
          report.createdIndexes.push(index.name);
        }
      }
    }
  });

  apply();
  return report;
};

export const getSqliteSchemaSnapshot = (): string => {
  const lines: string[] = [];
  lines.push(`SQLite schema snapshot (${SQLITE_TABLE_SPECS.length} tables)`);
  for (const table of SQLITE_TABLE_SPECS) {
    const columnSummary = table.columns
      .map((column) => {
        const flags: string[] = [];
        if (column.primaryKey) {
          flags.push("pk");
        }
        if (column.notNull) {
          flags.push("not_null");
        }
        if (column.references) {
          flags.push(`fk->${column.references.table}.${column.references.column}`);
        }
        return flags.length > 0
          ? `${column.name}:${column.type}[${flags.join(",")}]`
          : `${column.name}:${column.type}`;
      })
      .join(", ");
    lines.push(`- ${table.name}: ${columnSummary}`);
  }
  return lines.join("\n");
};

export const getSqliteTableNames = (): string[] => SQLITE_TABLE_SPECS.map((table) => table.name);
export const getSqliteTableSpec = (tableName: keyof typeof sqliteTables): TableSpec | undefined =>
  TABLE_SPEC_BY_NAME.get(tableName);
