import { existsSync } from "fs";
import path from "path";

import { getEnv } from "@config/env";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Express } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { authRoutes } from "./routes/auth";
import { avatarRoutes } from "./routes/avatars";
import { bingersRoutes } from "./routes/bingers";
import { logoutRoutes } from "./routes/logout";
import { logsRoutes } from "./routes/logs";
import { metaRoutes } from "./routes/meta";
import { settingsRoutes } from "./routes/settings";
import { simklRoutes } from "./routes/simkl";
import { syncRoutes } from "./routes/sync";
import { traktRoutes } from "./routes/trakt";
import { userRoutes } from "./routes/users";
import { webhookRoutes } from "./routes/webhooks";
import { setupSwagger } from "./swagger";

function shouldTrustProxy(env: ReturnType<typeof getEnv>): boolean {
  const v = env.TRUST_PROXY?.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "no") {
    return false;
  }
  if (v === "true" || v === "1" || v === "yes") {
    return true;
  }
  return env.NODE_ENV === "production";
}

export function createApp(): Express {
  const app = express();
  const env = getEnv();

  if (shouldTrustProxy(env)) {
    app.set("trust proxy", 1);
  }

  const allowedOrigins =
    env.CORS_ALLOWED_ORIGINS?.split(",")
      .map((o) => o.trim())
      .filter(Boolean) ?? [];

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      // Helmet defaults COOP to `same-origin`, which severs opener <=> popup and
      // breaks closing the Plex OAuth window. Vite dev sends neither this nor
      // Origin-Agent-Cluster; disable both so prod matches dev.
      crossOriginOpenerPolicy: false,
      originAgentCluster: false,
    })
  );

  app.use(cookieParser());

  app.use(
    cors({
      origin:
        allowedOrigins.length > 0
          ? allowedOrigins
          : env.NODE_ENV === "production"
            ? false
            : true,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "Accept"],
      exposedHeaders: ["Content-Type", "Authorization"],
    })
  );

  app.use(
    express.json({ type: ["application/json", "text/json", "text/plain"] })
  );

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const integrationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Per-IP cap on SPA `sendFile` (client assets are served by `express.static` first).
  const spaFallbackLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });

  setupSwagger(app);

  app.use("/api/v1/webhooks", webhookLimiter, webhookRoutes);
  app.use("/api/v1/auth", authLimiter, authRoutes);
  app.use("/api/v1/users", userRoutes);
  app.use("/api/v1/settings", settingsRoutes);
  app.use("/api/v1/trakt", integrationLimiter, traktRoutes);
  app.use("/api/v1/simkl", integrationLimiter, simklRoutes);
  app.use("/api/v1/bingers", integrationLimiter, bingersRoutes);
  app.use("/api/v1/sync", syncRoutes);
  app.use("/api/v1/logs", logsRoutes);
  app.use("/api/v1/logout", logoutRoutes);
  app.use("/api/v1/avatars", avatarRoutes);
  app.use("/api/v1/meta", metaRoutes);

  const publicDir = env.PUBLIC_DIR ? path.resolve(env.PUBLIC_DIR) : undefined;
  if (env.NODE_ENV === "production" && publicDir && existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get("/{*path}", spaFallbackLimiter, (req, res, next) => {
      if (req.path.startsWith("/api-docs")) {
        return next();
      }
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }

  return app;
}
