import type { Database } from "bun:sqlite";
import { z, type ZodType } from "zod";

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
  rowSchema: ZodType;
  columns: readonly ColumnSpec[];
  tableChecks?: readonly string[];
  tableConstraints?: readonly string[];
  indexes?: readonly IndexSpec[];
};

type TableInfoRow = {
  name: string;
  type: string;
  notnull: 0 | 1;
  pk: number;
};

type IndexInfoRow = {
  name: string;
  unique: 0 | 1;
};

export type SqliteSchemaSyncReport = {
  createdTables: string[];
  addedColumns: string[];
  createdIndexes: string[];
  warnings: string[];
};

export type SqliteSchemaInspectionReport = {
  missingTables: string[];
  missingColumns: string[];
  mismatchedColumns: string[];
  extraColumns: string[];
  missingIndexes: string[];
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

const unwrapSchema = (
  schema: z.ZodType,
): { schema: z.ZodType; nullable: boolean; optional: boolean } => {
  let current = schema;
  let nullable = false;
  let optional = false;

  while (true) {
    if (current.isNullable()) {
      nullable = true;
      current = (current as z.ZodType & { unwrap: () => z.ZodType }).unwrap();
      continue;
    }
    if (current.isOptional()) {
      optional = true;
      current = (current as z.ZodType & { unwrap: () => z.ZodType }).unwrap();
      continue;
    }
    break;
  }

  return { schema: current, nullable, optional };
};

const isIntegerNumberSchema = (schema: z.ZodType): boolean => {
  const checks = (schema as z.ZodType & { def?: { checks?: unknown[] } }).def?.checks;
  if (!Array.isArray(checks)) {
    return false;
  }

  return checks.some((check) => {
    const candidate = check as { isInt?: boolean; def?: { format?: string } };
    return candidate.isInt === true || candidate.def?.format === "int" || candidate.def?.format === "safeint";
  });
};

const inferSqlitePrimitiveFromZodSchema = (schema: z.ZodType): SqlitePrimitive | null => {
  const { schema: unwrapped } = unwrapSchema(schema);
  const kind = (unwrapped as z.ZodType & { def?: { type?: string } }).def?.type;

  switch (kind) {
    case "string":
    case "enum":
      return "TEXT";
    case "number":
      return isIntegerNumberSchema(unwrapped) ? "INTEGER" : "REAL";
    default:
      return null;
  }
};

const getRowSchemaShape = (table: TableSpec): Record<string, z.ZodType> => {
  const shape = (table.rowSchema as ZodType & { shape?: Record<string, z.ZodType> }).shape;
  if (!shape) {
    throw new Error(`sqlite table ${table.name} row schema must be a Zod object`);
  }
  return shape;
};

const getSqliteTableContractViolations = (tables: readonly TableSpec[]): string[] => {
  const violations: string[] = [];

  for (const table of tables) {
    const shape = getRowSchemaShape(table);
    const schemaColumnNames = Object.keys(shape).toSorted();
    const declaredColumnNames = table.columns.map((column) => column.name).toSorted();

    for (const columnName of schemaColumnNames) {
      if (!declaredColumnNames.includes(columnName)) {
        violations.push(`table ${table.name} row schema defines ${columnName} but table spec does not`);
      }
    }

    for (const columnName of declaredColumnNames) {
      if (!schemaColumnNames.includes(columnName)) {
        violations.push(`table ${table.name} table spec defines ${columnName} but row schema does not`);
      }
    }

    for (const column of table.columns) {
      const fieldSchema = shape[column.name];
      if (!fieldSchema) {
        continue;
      }

      const inferredType = inferSqlitePrimitiveFromZodSchema(fieldSchema);
      if (inferredType === null) {
        violations.push(`table ${table.name}.${column.name} uses unsupported Zod type for SQLite inference`);
        continue;
      }

      if (inferredType !== column.type) {
        violations.push(
          `table ${table.name}.${column.name} row schema infers ${inferredType} but table spec declares ${column.type}`,
        );
      }

      const { nullable, optional } = unwrapSchema(fieldSchema);
      const expectedNotNull = !nullable && !optional;
      const declaredNotNull = column.notNull === true || column.primaryKey === true;
      if (expectedNotNull !== declaredNotNull) {
        violations.push(
          `table ${table.name}.${column.name} row schema ${
            expectedNotNull ? "requires NOT NULL" : "allows NULL"
          } but table spec does ${declaredNotNull ? "not allow NULL" : "allow NULL"}`,
        );
      }
    }
  }

  return violations;
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
      { name: "serial_number", type: "INTEGER", check: "serial_number IS NULL OR serial_number > 0" },
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
      { name: "attempt_count", type: "INTEGER", check: "attempt_count IS NULL OR attempt_count >= 0" },
      { name: "lease_owner", type: "TEXT" },
      { name: "lease_expires_at", type: "INTEGER", check: "lease_expires_at IS NULL OR lease_expires_at >= 0" },
      { name: "last_error", type: "TEXT" },
      { name: "created_at", type: "INTEGER", notNull: true },
      { name: "updated_at", type: "INTEGER", notNull: true },
    ],
    indexes: [
      { name: "idx_jobs_serial_number", columns: ["serial_number"], unique: true },
      { name: "idx_jobs_status_next_run_at", columns: ["status", "next_run_at"] },
      { name: "idx_jobs_bot_id_status", columns: ["bot_id", "status"] },
      { name: "idx_jobs_lease_expires_at", columns: ["status", "lease_expires_at"] },
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
    name: "instance_profiles",
    rowSchema: sqliteTables.instance_profiles,
    columns: [
      { name: "instance_id", type: "TEXT", primaryKey: true },
      { name: "display_name", type: "TEXT" },
      { name: "summary", type: "TEXT" },
      { name: "trading_style", type: "TEXT" },
      { name: "risk_tolerance", type: "TEXT" },
      { name: "preferred_assets_json", type: "TEXT" },
      { name: "disliked_assets_json", type: "TEXT" },
      { name: "metadata_json", type: "TEXT" },
      { name: "created_at", type: "INTEGER", notNull: true },
      { name: "updated_at", type: "INTEGER", notNull: true },
    ],
    indexes: [{ name: "idx_instance_profiles_updated_at", columns: ["updated_at"] }],
  },
  {
    name: "instance_facts",
    rowSchema: sqliteTables.instance_facts,
    columns: [
      { name: "id", type: "TEXT", primaryKey: true },
      { name: "instance_id", type: "TEXT", notNull: true },
      { name: "fact_key", type: "TEXT", notNull: true },
      { name: "fact_value_json", type: "TEXT", notNull: true },
      { name: "confidence", type: "REAL", notNull: true, check: "confidence >= 0 AND confidence <= 1" },
      { name: "source", type: "TEXT", notNull: true },
      { name: "source_message_id", type: "TEXT" },
      { name: "created_at", type: "INTEGER", notNull: true },
      { name: "updated_at", type: "INTEGER", notNull: true },
      { name: "expires_at", type: "INTEGER", check: "expires_at IS NULL OR expires_at >= 0" },
    ],
    tableConstraints: ["UNIQUE(instance_id, fact_key)"],
    indexes: [
      { name: "idx_instance_facts_instance_updated", columns: ["instance_id", "updated_at"] },
      { name: "idx_instance_facts_expires_at", columns: ["expires_at"] },
    ],
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

const SQLITE_TABLE_CONTRACT_VIOLATIONS = getSqliteTableContractViolations(SQLITE_TABLE_SPECS);
if (SQLITE_TABLE_CONTRACT_VIOLATIONS.length > 0) {
  throw new Error(`SQLite table contract drift detected:\n- ${SQLITE_TABLE_CONTRACT_VIOLATIONS.join("\n- ")}`);
}

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

const getExistingColumnInfo = (db: Database, tableName: string): Map<string, TableInfoRow> => {
  const rows = db.query(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as TableInfoRow[];
  return new Map(rows.map((row) => [row.name, row]));
};

const getExistingIndexInfo = (db: Database, tableName: string): Map<string, IndexInfoRow> => {
  const rows = db.query(`PRAGMA index_list(${quoteIdentifier(tableName)})`).all() as IndexInfoRow[];
  return new Map(rows.map((row) => [row.name, row]));
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

const normalizeSqliteType = (value: string): string => value.trim().toUpperCase();

export const inspectSqliteSchema = (db: Database): SqliteSchemaInspectionReport => {
  const report: SqliteSchemaInspectionReport = {
    missingTables: [],
    missingColumns: [],
    mismatchedColumns: [],
    extraColumns: [],
    missingIndexes: [],
    warnings: [],
  };

  for (const table of SQLITE_TABLE_SPECS) {
    if (!tableExists(db, table.name)) {
      report.missingTables.push(table.name);
      report.warnings.push(`missing table ${table.name}`);
      continue;
    }

    const actualColumns = getExistingColumnInfo(db, table.name);
    const expectedColumnNames = new Set(table.columns.map((column) => column.name));

    for (const column of table.columns) {
      const actual = actualColumns.get(column.name);
      if (!actual) {
        report.missingColumns.push(`${table.name}.${column.name}`);
        report.warnings.push(`missing column ${table.name}.${column.name}`);
        continue;
      }

      if (normalizeSqliteType(actual.type) !== column.type) {
        report.mismatchedColumns.push(`${table.name}.${column.name}`);
        report.warnings.push(
          `column ${table.name}.${column.name} has type ${normalizeSqliteType(actual.type)} but expected ${column.type}`,
        );
      }

      const expectedNotNull = column.notNull === true || column.primaryKey === true;
      if (Boolean(actual.notnull) !== expectedNotNull) {
        report.mismatchedColumns.push(`${table.name}.${column.name}`);
        report.warnings.push(
          `column ${table.name}.${column.name} has notnull=${Boolean(actual.notnull)} but expected ${expectedNotNull}`,
        );
      }

      const expectedPrimaryKey = column.primaryKey === true;
      if ((actual.pk > 0) !== expectedPrimaryKey) {
        report.mismatchedColumns.push(`${table.name}.${column.name}`);
        report.warnings.push(
          `column ${table.name}.${column.name} has primary_key=${actual.pk > 0} but expected ${expectedPrimaryKey}`,
        );
      }
    }

    for (const actualColumnName of actualColumns.keys()) {
      if (expectedColumnNames.has(actualColumnName)) {
        continue;
      }
      report.extraColumns.push(`${table.name}.${actualColumnName}`);
      report.warnings.push(`extra column ${table.name}.${actualColumnName} is present but not declared`);
    }

    const actualIndexes = getExistingIndexInfo(db, table.name);
    for (const index of table.indexes ?? []) {
      const actualIndex = actualIndexes.get(index.name);
      if (!actualIndex) {
        report.missingIndexes.push(index.name);
        report.warnings.push(`missing index ${index.name} on ${table.name}`);
        continue;
      }

      if (Boolean(actualIndex.unique) !== Boolean(index.unique)) {
        report.warnings.push(
          `index ${index.name} on ${table.name} has unique=${Boolean(actualIndex.unique)} but expected ${Boolean(index.unique)}`,
        );
      }
    }
  }

  report.mismatchedColumns = [...new Set(report.mismatchedColumns)];
  report.warnings = [...new Set(report.warnings)];
  return report;
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
  const inspection = inspectSqliteSchema(db);
  report.warnings.push(...inspection.warnings);
  report.warnings = [...new Set(report.warnings)];
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
export const getSqliteTableContractViolationsSnapshot = (): string[] => [...SQLITE_TABLE_CONTRACT_VIOLATIONS];
