import "reflect-metadata";
import { dataSource, ensureDatabase } from "@config/database";
import { logger } from "@utils/logger";

async function runMigrations() {
  try {
    logger.migration.info("Initializing database connection...");
    await ensureDatabase();
    await dataSource.initialize();
    logger.migration.info("Database connected");

    logger.migration.info("Running migrations...");
    const migrations = await dataSource.runMigrations();

    if (migrations.length === 0) {
      logger.migration.info("No migrations to run");
    } else {
      logger.migration.info({ count: migrations.length }, "Ran migrations");
      migrations.forEach((migration) => {
        logger.migration.debug(
          { migration: migration.name },
          "Applied migration"
        );
      });
    }

    await dataSource.destroy();
    logger.migration.info("Migrations completed successfully");
    process.exit(0);
  } catch (error) {
    logger.migration.error({ error }, "Migration failed");
    process.exit(1);
  }
}

runMigrations();
