import "reflect-metadata";
import { existsSync } from "fs";
import { join } from "path";

import { dataSource, ensureDatabase } from "@config/database";
import { logger } from "@utils/logger";
import { getDataDir } from "@utils/paths";
import Database from "better-sqlite3";
import { Client } from "pg";

export const DATA_TABLES = [
  "users",
  "settings",
  "sessions",
  "sync_history",
] as const;

export type DataTable = (typeof DATA_TABLES)[number];

const BOOL_COLUMNS = new Set([
  "isAdmin",
  "enabled",
  "tvtimeMarkMoviesAsRewatched",
  "tvtimeMarkEpisodesAsRewatched",
  "bingersMarkMoviesAsRewatched",
  "bingersMarkEpisodesAsRewatched",
  "simklMarkMoviesAsRewatched",
  "simklMarkEpisodesAsRewatched",
  "success",
  "wasRewatched",
]);

const INSERT_BATCH_SIZE = 200;

export interface MigrateArgs {
  sqlitePath: string;
  dryRun: boolean;
  force: boolean;
  help: boolean;
}

export function defaultSqlitePath(): string {
  return process.env.DATABASE_PATH || join(getDataDir(), "db", "scroblarr.db");
}

export function parseArgs(
  argv: string[],
  defaults: { sqlitePath: string } = { sqlitePath: defaultSqlitePath() }
): MigrateArgs {
  const args: MigrateArgs = {
    sqlitePath: defaults.sqlitePath,
    dryRun: false,
    force: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--sqlite") {
      const next = argv[++i];
      if (!next) {
        throw new Error("--sqlite requires a path");
      }
      args.sqlitePath = next;
    } else if (arg.startsWith("--sqlite=")) {
      args.sqlitePath = arg.slice("--sqlite=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

export function printHelp(): void {
  const sqlite = defaultSqlitePath();
  console.log(`Migrate Scroblarr data from SQLite to PostgreSQL.

Usage:
  pnpm --filter @scroblarr/backend migrate:sqlite-to-postgres [options]

Options:
  --sqlite <path>   SQLite database file (default: ${sqlite})
  --dry-run         Compare row counts only; no schema or data writes
  --force           Truncate and replace existing Postgres data tables
  -h, --help        Show this help

Requires POSTGRES_HOST (and usually POSTGRES_USER / POSTGRES_PASSWORD /
POSTGRES_DATABASE). Without --dry-run, the script applies TypeORM schema
migrations on Postgres, then copies application data (users, settings,
sessions, sync_history). The migrations table is managed by TypeORM.

Stop Scroblarr while migrating. Keep a backup of the SQLite file.`);
}

export function coerceValue(column: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (BOOL_COLUMNS.has(column)) {
    return value === true || value === 1 || value === "1";
  }
  return value;
}

export function intersectColumns(
  sqliteColumns: string[],
  postgresColumns: string[]
): string[] {
  const pg = new Set(postgresColumns);
  return sqliteColumns.filter((column) => pg.has(column));
}

function createPgClient(): Client {
  return new Client({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT) || 5432,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE || "scroblarr",
    ssl:
      process.env.POSTGRES_SSL === "true"
        ? { rejectUnauthorized: false }
        : false,
  });
}

async function listPostgresColumns(
  client: Client,
  table: string
): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
  return result.rows.map((row) => row.column_name);
}

async function postgresTableExists(
  client: Client,
  table: string
): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [table]
  );
  return Boolean(result.rows[0]?.exists);
}

function listSqliteColumns(sqlite: Database.Database, table: string): string[] {
  const rows = sqlite.prepare(`PRAGMA table_info("${table}")`).all() as Array<{
    name: string;
  }>;
  return rows.map((row) => row.name);
}

async function countPostgres(client: Client, table: string): Promise<number> {
  const result = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM "${table}"`
  );
  return Number(result.rows[0]?.c ?? 0);
}

function countSqlite(sqlite: Database.Database, table: string): number {
  const row = sqlite.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get() as {
    c: number;
  };
  return row.c;
}

async function ensurePostgresSchema(): Promise<void> {
  logger.migration.info("Ensuring Postgres schema (TypeORM migrations)...");
  await ensureDatabase();
  await dataSource.initialize();
  try {
    const applied = await dataSource.runMigrations();
    if (applied.length > 0) {
      logger.migration.info(
        { count: applied.length },
        "Applied pending TypeORM migrations"
      );
    }
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

async function insertBatch(
  client: Client,
  table: DataTable,
  columns: string[],
  batch: Record<string, unknown>[]
): Promise<void> {
  if (batch.length === 0) {
    return;
  }

  const colList = columns.map((c) => `"${c}"`).join(", ");
  const values: unknown[] = [];
  const valueGroups: string[] = [];

  batch.forEach((row, rowIndex) => {
    const placeholders = columns.map((_, colIndex) => {
      values.push(coerceValue(columns[colIndex]!, row[columns[colIndex]!]));
      return `$${rowIndex * columns.length + colIndex + 1}`;
    });
    valueGroups.push(`(${placeholders.join(", ")})`);
  });

  await client.query(
    `INSERT INTO "${table}" (${colList}) VALUES ${valueGroups.join(", ")}`,
    values
  );
}

async function copyTable(
  sqlite: Database.Database,
  client: Client,
  table: DataTable
): Promise<number> {
  const sqliteColumns = listSqliteColumns(sqlite, table);
  const postgresColumns = await listPostgresColumns(client, table);
  const columns = intersectColumns(sqliteColumns, postgresColumns);

  if (columns.length === 0) {
    throw new Error(`No overlapping columns for table "${table}"`);
  }

  const skipped = sqliteColumns.filter((column) => !columns.includes(column));
  if (skipped.length > 0) {
    logger.migration.warn(
      { table, skipped },
      "Skipping SQLite columns missing from Postgres schema"
    );
  }

  const stmt = sqlite.prepare(
    `SELECT ${columns.map((c) => `"${c}"`).join(", ")} FROM "${table}"`
  );
  const batch: Record<string, unknown>[] = [];
  let copied = 0;

  for (const row of stmt.iterate() as IterableIterator<
    Record<string, unknown>
  >) {
    batch.push(row);
    if (batch.length >= INSERT_BATCH_SIZE) {
      await insertBatch(client, table, columns, batch);
      copied += batch.length;
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    await insertBatch(client, table, columns, batch);
    copied += batch.length;
  }

  return copied;
}

async function migrate(args: MigrateArgs): Promise<void> {
  if (!process.env.POSTGRES_HOST) {
    throw new Error(
      "POSTGRES_HOST is required. Point it at the target Postgres instance."
    );
  }

  if (!existsSync(args.sqlitePath)) {
    throw new Error(`SQLite file not found: ${args.sqlitePath}`);
  }

  logger.migration.info(
    {
      sqlitePath: args.sqlitePath,
      dryRun: args.dryRun,
      force: args.force,
      postgresHost: process.env.POSTGRES_HOST,
      postgresDatabase: process.env.POSTGRES_DATABASE || "scroblarr",
    },
    "Starting SQLite → Postgres migration"
  );

  if (!args.dryRun) {
    await ensurePostgresSchema();
  }

  const sqlite = new Database(args.sqlitePath, {
    readonly: true,
    fileMustExist: true,
  });
  const client = createPgClient();
  await client.connect();

  try {
    const plan: Array<{ table: DataTable; sqlite: number; postgres: number }> =
      [];

    for (const table of DATA_TABLES) {
      const sqliteCount = countSqlite(sqlite, table);
      let postgresCount = 0;
      if (await postgresTableExists(client, table)) {
        postgresCount = await countPostgres(client, table);
      } else if (args.dryRun) {
        logger.migration.warn(
          { table },
          "Postgres table missing — run without --dry-run to apply schema first"
        );
      } else {
        throw new Error(
          `Postgres table "${table}" is missing after schema migrations`
        );
      }
      plan.push({ table, sqlite: sqliteCount, postgres: postgresCount });
      logger.migration.info(
        { table, sqlite: sqliteCount, postgres: postgresCount },
        "Row counts"
      );
    }

    const targetHasData = plan.some((entry) => entry.postgres > 0);
    if (targetHasData && !args.force && !args.dryRun) {
      throw new Error(
        "Postgres already has data in one or more tables. Re-run with --force to truncate and replace, or --dry-run to inspect only."
      );
    }

    if (args.dryRun) {
      logger.migration.info("Dry run complete — no schema or data written");
      return;
    }

    await client.query("BEGIN");
    try {
      if (args.force) {
        for (const table of [...DATA_TABLES].reverse()) {
          await client.query(`TRUNCATE TABLE "${table}" CASCADE`);
        }
      }

      for (const table of DATA_TABLES) {
        const copied = await copyTable(sqlite, client, table);
        logger.migration.info({ table, copied }, "Copied table");
      }

      for (const table of DATA_TABLES) {
        const sqliteCount = countSqlite(sqlite, table);
        const postgresCount = await countPostgres(client, table);
        if (sqliteCount !== postgresCount) {
          throw new Error(
            `Count mismatch for ${table}: sqlite=${sqliteCount} postgres=${postgresCount}`
          );
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    logger.migration.info(
      "Migration completed successfully. Set POSTGRES_* on Scroblarr and restart."
    );
  } finally {
    await client.end().catch(() => {});
    sqlite.close();
  }
}

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      process.exit(0);
    }
    await migrate(args);
    process.exit(0);
  } catch (error) {
    logger.migration.error({ error }, "SQLite → Postgres migration failed");
    process.exit(1);
  }
}

const isDirectRun = /migrateSqliteToPostgres\.(ts|js)$/.test(
  process.argv[1] ?? ""
);

if (isDirectRun) {
  void main();
}
