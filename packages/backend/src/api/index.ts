import express, { Express } from "express";
import cors from "cors";
import path from "path";
import { existsSync } from "fs";
import { getEnv } from "@config/env";
import { webhookRoutes } from "./routes/webhooks";
import { userRoutes } from "./routes/users";
import { authRoutes } from "./routes/auth";
import { settingsRoutes } from "./routes/settings";
import { tvtimeRoutes } from "./routes/tvtime";
import { traktRoutes } from "./routes/trakt";
import { syncRoutes } from "./routes/sync";
import { logsRoutes } from "./routes/logs";
import { avatarRoutes } from "./routes/avatars";
import { setupSwagger } from "./swagger";

export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: true,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "Accept"],
      exposedHeaders: ["Content-Type", "Authorization"],
    })
  );

  app.use(
    express.json({ type: ["application/json", "text/json", "text/plain"] })
  );

  setupSwagger(app);

  app.use("/api/v1/webhooks", webhookRoutes);
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/users", userRoutes);
  app.use("/api/v1/settings", settingsRoutes);
  app.use("/api/v1/tvtime", tvtimeRoutes);
  app.use("/api/v1/trakt", traktRoutes);
  app.use("/api/v1/sync", syncRoutes);
  app.use("/api/v1/logs", logsRoutes);
  app.use("/api/v1/avatars", avatarRoutes);

  const env = getEnv();
  const publicDir = env.PUBLIC_DIR ? path.resolve(env.PUBLIC_DIR) : undefined;
  if (env.NODE_ENV === "production" && publicDir && existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }

  return app;
}
