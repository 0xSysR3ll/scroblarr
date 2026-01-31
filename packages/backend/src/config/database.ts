import { DataSource, DataSourceOptions } from "typeorm";
import { join } from "path";
import { getDataDir } from "@utils/paths";
import { Client } from "pg";
import { logger } from "@utils/logger";

const isPostgres = Boolean(process.env.POSTGRES_HOST);

const baseConfig = {
  entities: ["src/entities/*.ts"],
  synchronize: false,
  migrations: ["src/migrations/*.ts"],
  migrationsRun: true,
};

const sqliteConfig: DataSourceOptions = {
  ...baseConfig,
  type: "sqlite",
  database:
    process.env.DATABASE_PATH || join(getDataDir(), "db", "scroblarr.db"),
};

const postgresConfig: DataSourceOptions = {
  ...baseConfig,
  type: "postgres",
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT) || 5432,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE || "scroblarr",
  ssl:
    process.env.POSTGRES_SSL === "true" ? { rejectUnauthorized: false } : false,
};

async function ensurePostgresDatabase(): Promise<void> {
  if (!isPostgres) {
    return;
  }

  const dbName = process.env.POSTGRES_DATABASE || "scroblarr";
  const host = process.env.POSTGRES_HOST!;
  const port = Number(process.env.POSTGRES_PORT) || 5432;
  const username = process.env.POSTGRES_USER!;
  const password = process.env.POSTGRES_PASSWORD!;
  const ssl =
    process.env.POSTGRES_SSL === "true" ? { rejectUnauthorized: false } : false;

  const defaultDatabases = ["postgres", "template1"];
  let client: Client | null = null;

  for (const defaultDb of defaultDatabases) {
    try {
      client = new Client({
        host,
        port,
        user: username,
        password,
        database: defaultDb,
        ssl: ssl || false,
      });

      await client.connect();
      logger.system.debug(
        { database: defaultDb },
        "Connected to PostgreSQL server"
      );

      const result = await client.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [dbName]
      );

      if (result.rows.length === 0) {
        logger.system.info({ database: dbName }, "Creating database");
        await client.query(`CREATE DATABASE "${dbName}"`);
        logger.system.info(
          { database: dbName },
          "Database created successfully"
        );
      } else {
        logger.system.debug({ database: dbName }, "Database already exists");
      }

      await client.end();
      return;
    } catch (error) {
      if (client) {
        await client.end().catch(() => {});
        client = null;
      }

      if (defaultDb === defaultDatabases[defaultDatabases.length - 1]) {
        logger.system.warn(
          { error },
          "Could not create database automatically. Please create it manually."
        );
        throw error;
      }

      logger.system.debug(
        { database: defaultDb, error },
        "Could not connect to default database, trying next"
      );
    }
  }
}

export const dataSource = new DataSource(
  isPostgres ? postgresConfig : sqliteConfig
);

// Export function to ensure database exists before initializing
export async function ensureDatabase(): Promise<void> {
  if (isPostgres) {
    await ensurePostgresDatabase();
  }
}
