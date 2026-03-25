import type { Database } from "bun:sqlite";
import { z, type ZodType } from "zod";

import {
  getSqliteTableContracts,
  type ColumnSpec,
  type IndexSpec,
  type SqliteAnyTableContract,
  type SqlitePrimitive,
  type SqliteTableName,
} from "./sqliteSchema";

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

const SQLITE_TABLE_CONTRACTS = getSqliteTableContracts();
const TABLE_SPEC_BY_NAME = new Map(SQLITE_TABLE_CONTRACTS.map((spec) => [spec.name, spec]));
const DEPRECATED_TABLE_NAMES = ["policy_hits", "decision_logs"] as const;
const PRIMARY_KEY_CONSTRAINT_PATTERN = /^PRIMARY KEY\s*\((.+)\)$/iu;

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
  if (column.defaultSql !== undefined) {
    parts.push(`DEFAULT ${column.defaultSql}`);
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

const getRowSchemaShape = (table: SqliteAnyTableContract): Record<string, z.ZodType> => {
  const shape = (table.rowSchema as ZodType & { shape?: Record<string, z.ZodType> }).shape;
  if (!shape) {
    throw new Error(`sqlite table ${table.name} row schema must be a Zod object`);
  }
  return shape;
};

const parsePrimaryKeyConstraintColumns = (constraint: string): string[] => {
  const match = PRIMARY_KEY_CONSTRAINT_PATTERN.exec(constraint.trim());
  if (!match) {
    return [];
  }

  const rawColumns = match[1] ?? "";
  return rawColumns
    .split(",")
    .map((columnName) => columnName.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
};

const getExpectedPrimaryKeyColumns = (table: SqliteAnyTableContract): Set<string> => {
  const primaryKeyColumns = new Set<string>();

  for (const column of table.columns) {
    if (column.primaryKey) {
      primaryKeyColumns.add(column.name);
    }
  }

  for (const constraint of table.tableConstraints ?? []) {
    for (const columnName of parsePrimaryKeyConstraintColumns(constraint)) {
      primaryKeyColumns.add(columnName);
    }
  }

  return primaryKeyColumns;
};

const getSqliteTableContractViolations = (tables: readonly SqliteAnyTableContract[]): string[] => {
  const violations: string[] = [];

  for (const table of tables) {
    const shape = getRowSchemaShape(table);
    const schemaColumnNames = Object.keys(shape).toSorted();
    const declaredColumnNames = table.columns.map((column) => column.name).toSorted();
    const expectedPrimaryKeyColumns = getExpectedPrimaryKeyColumns(table);

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
      const declaredNotNull = column.notNull === true || expectedPrimaryKeyColumns.has(column.name);
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

const SQLITE_TABLE_CONTRACT_VIOLATIONS = getSqliteTableContractViolations(SQLITE_TABLE_CONTRACTS);
if (SQLITE_TABLE_CONTRACT_VIOLATIONS.length > 0) {
  throw new Error(`SQLite table contract drift detected:\n- ${SQLITE_TABLE_CONTRACT_VIOLATIONS.join("\n- ")}`);
}

const renderCreateTableStatement = (table: SqliteAnyTableContract): string => {
  const columnDefinitions = table.columns.map((column) => renderColumnDefinition(column));
  const checks = (table.tableChecks ?? []).map((check) => `CHECK (${check})`);
  const constraints = table.tableConstraints ? [...table.tableConstraints] : [];
  const defs = [...columnDefinitions, ...checks, ...constraints].join(",\n  ");

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

  for (const table of SQLITE_TABLE_CONTRACTS) {
    if (!tableExists(db, table.name)) {
      report.missingTables.push(table.name);
      report.warnings.push(`missing table ${table.name}`);
      continue;
    }

    const actualColumns = getExistingColumnInfo(db, table.name);
    const expectedColumnNames = new Set(table.columns.map((column) => column.name));
    const expectedPrimaryKeyColumns = getExpectedPrimaryKeyColumns(table);

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

      const expectedNotNull = column.notNull === true || expectedPrimaryKeyColumns.has(column.name);
      const actualEffectivelyNotNull = Boolean(actual.notnull) || actual.pk > 0;
      if (actualEffectivelyNotNull !== expectedNotNull) {
        report.mismatchedColumns.push(`${table.name}.${column.name}`);
        report.warnings.push(
          `column ${table.name}.${column.name} has effective_notnull=${actualEffectivelyNotNull} but expected ${expectedNotNull}`,
        );
      }

      const expectedPrimaryKey = expectedPrimaryKeyColumns.has(column.name);
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

    for (const table of SQLITE_TABLE_CONTRACTS) {
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
  lines.push(`SQLite schema snapshot (${SQLITE_TABLE_CONTRACTS.length} tables)`);
  for (const table of SQLITE_TABLE_CONTRACTS) {
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

export const getSqliteTableNames = (): string[] => SQLITE_TABLE_CONTRACTS.map((table) => table.name);
export const getSqliteTableSpec = (tableName: SqliteTableName): SqliteAnyTableContract | undefined =>
  TABLE_SPEC_BY_NAME.get(tableName);
export const getSqliteTableContractViolationsSnapshot = (): string[] => [...SQLITE_TABLE_CONTRACT_VIOLATIONS];
