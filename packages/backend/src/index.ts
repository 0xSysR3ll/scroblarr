import "reflect-metadata";
import { dataSource, ensureDatabase } from "@config/database";
import { getEnv } from "@config/env";
import { createApp } from "./api";
import { ScheduledJobs } from "@services/ScheduledJobs";
import { SettingsRepository } from "@repositories/SettingsRepository";
import { logger } from "@utils/logger";
import { randomBytes } from "crypto";

async function bootstrap() {
  try {
    await ensureDatabase();
    await dataSource.initialize();
    logger.system.debug("Database connected and migrations applied");

    const settingsRepository = new SettingsRepository();
    const existingApiKey = await settingsRepository.get("apiKey");
    if (!existingApiKey) {
      const apiKey = `sk_${randomBytes(32).toString("hex")}`;
      await settingsRepository.set("apiKey", apiKey);
    }

    const env = getEnv();
    const app = createApp();

    const scheduledJobs = new ScheduledJobs();
    scheduledJobs.start();

    process.on("SIGTERM", () => {
      logger.system.info("SIGTERM received, shutting down gracefully");
      scheduledJobs.stop();
      process.exit(0);
    });

    process.on("SIGINT", () => {
      logger.system.info("SIGINT received, shutting down gracefully");
      scheduledJobs.stop();
      process.exit(0);
    });

    const port = Number(env.PORT);
    app.listen(port, "0.0.0.0", () => {
      logger.system.debug({ port }, "Server running");
    });
  } catch (error) {
    logger.system.fatal({ error }, "Failed to start server");
    process.exit(1);
  }
}

bootstrap();
