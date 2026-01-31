import { DataSource, DataSourceOptions } from "typeorm";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";

function getDataDir(): string {
  if (process.env.DATA_DIR) {
    return resolve(process.env.DATA_DIR);
  }
  return join(getProjectRoot(), "data");
}

function getProjectRoot(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  let dir = currentDir;

  while (dir !== "/" && dir !== dirname(dir)) {
    const rootPackageJson = join(dir, "package.json");
    if (existsSync(rootPackageJson)) {
      try {
        const packageContent = JSON.parse(
          readFileSync(rootPackageJson, "utf-8")
        );
        if (
          packageContent.name === "scroblarr" ||
          existsSync(join(dir, "packages"))
        ) {
          return resolve(dir);
        }
      } catch {
        // Continue searching
      }
    }
    dir = dirname(dir);
  }

  return resolve(dirname(dirname(currentDir)));
}

const isPostgres = Boolean(process.env.POSTGRES_HOST);

const sqliteConfig: DataSourceOptions = {
  type: "sqlite",
  database:
    process.env.DATABASE_PATH || join(getDataDir(), "db", "scroblarr.db"),
  entities: ["src/entities/*.ts"],
  migrations: ["src/migrations/*.ts"],
  synchronize: false,
};

const postgresConfig: DataSourceOptions = {
  type: "postgres",
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT) || 5432,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE || "scroblarr",
  entities: ["src/entities/*.ts"],
  migrations: ["src/migrations/*.ts"],
  synchronize: false,
  ssl:
    process.env.POSTGRES_SSL === "true" ? { rejectUnauthorized: false } : false,
};

export default new DataSource(isPostgres ? postgresConfig : sqliteConfig);
