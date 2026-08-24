import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsRepositoryMocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
}));

vi.mock("@repositories/SettingsRepository", () => ({
  SettingsRepository: class {
    get = settingsRepositoryMocks.get;
    getAll = settingsRepositoryMocks.getAll;
  },
}));

const syncServiceMocks = vi.hoisted(() => ({
  syncEvent: vi.fn(),
}));

vi.mock("@services/SyncService", () => ({
  SyncService: class {
    syncEvent = syncServiceMocks.syncEvent;
  },
}));

vi.mock("@utils/logger", () => ({
  logger: {
    webhook: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
  },
}));

import { webhookRoutes } from "./webhooks";

import { logger } from "@utils/logger";

describe("webhook security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsRepositoryMocks.get.mockImplementation(async (key: string) => {
      if (key === "webhookApiKey") {
        return "expected-webhook-key";
      }
      return null;
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({});
    syncServiceMocks.syncEvent.mockResolvedValue(undefined);
  });

  it("rejects Plex webhook when webhook API key is invalid", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/plex?apiKey=wrong-key")
      .send({
        event: "media.scrobble",
        Metadata: { type: "movie" },
        Account: { id: "1" },
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Invalid API key" });
  });

  it("rejects Plex webhook when only the admin API key is provided", async () => {
    settingsRepositoryMocks.get.mockImplementation(async (key: string) => {
      if (key === "webhookApiKey") {
        return "webhook-only-key";
      }
      if (key === "apiKey") {
        return "admin-api-key";
      }
      return null;
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/plex?apiKey=admin-api-key")
      .send({
        event: "media.scrobble",
        Metadata: { type: "movie" },
        Account: { id: "1" },
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Invalid API key" });
  });

  it("rejects Jellyfin webhook when webhook API key is missing from the request", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/jellyfin")
      .send({ Event: "PlaybackStart" });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Invalid API key" });
  });

  it("rejects Plex webhook when webhook API key is not configured", async () => {
    settingsRepositoryMocks.get.mockResolvedValue(null);

    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/plex?apiKey=any-key")
      .send({
        event: "media.scrobble",
        Metadata: { type: "movie" },
        Account: { id: "1" },
      });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: "Webhook authentication not ready",
    });
  });

  it("rejects Jellyfin webhook when webhook API key is not configured", async () => {
    settingsRepositoryMocks.get.mockResolvedValue(null);

    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/jellyfin")
      .set("x-api-key", "any-key")
      .send({ Event: "PlaybackStart" });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: "Webhook authentication not ready",
    });
  });

  it("accepts Plex webhook when webhook API key matches", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({});

    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/plex?apiKey=expected-webhook-key")
      .send({
        event: "media.scrobble",
        Metadata: { type: "movie" },
        Account: { id: "1" },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Event not supported",
    });
  });

  it("accepts Jellyfin webhook when webhook API key matches header", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/jellyfin")
      .set("x-api-key", "expected-webhook-key")
      .send({ notificationType: "PlaybackStop" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Event not supported",
    });
  });

  it("rejects Tautulli webhook when webhook API key is missing from the request", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/tautulli")
      .send({ action: "watched" });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Invalid API key" });
  });

  it("rejects Tautulli webhook when webhook API key is not configured", async () => {
    settingsRepositoryMocks.get.mockResolvedValue(null);

    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/tautulli")
      .set("x-api-key", "any-key")
      .send({ action: "watched" });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: "Webhook authentication not ready",
    });
  });

  it("accepts Tautulli webhook when webhook API key matches header", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({});

    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/tautulli")
      .set("x-api-key", "expected-webhook-key")
      .send({ action: "created", media_type: "movie" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Event not supported",
    });
  });

  it("accepts Tautulli webhook when webhook API key is in the JSON body", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({});

    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/tautulli")
      .send({ action: "play", apiKey: "expected-webhook-key" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Event not supported",
    });
  });

  it("parses a Tautulli webhook when req.body is a JSON string", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({});

    const app = express();
    app.use(express.text({ type: "*/*" }));
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/tautulli")
      .set("Content-Type", "text/plain")
      .set("x-api-key", "expected-webhook-key")
      .send(JSON.stringify({ action: "created", media_type: "movie" }));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Event not supported",
    });
  });

  it("does not log Tautulli webhook bodies when JSON parsing fails", async () => {
    const app = express();
    app.use(express.text({ type: "*/*" }));
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/tautulli")
      .set("Content-Type", "text/plain")
      .set("x-api-key", "expected-webhook-key")
      .send("{not-json");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Invalid JSON payload" });
    expect(logger.webhook.error).toHaveBeenCalled();
    const metadata = vi.mocked(logger.webhook.error).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(metadata).not.toHaveProperty("body");
    expect(metadata).not.toHaveProperty("rawBody");
    expect(metadata).toEqual(
      expect.objectContaining({
        contentType: expect.any(String),
        bodyLength: expect.any(Number),
      })
    );
  });

  it("rejects Tautulli raw JSON bodies that are null or arrays", async () => {
    const app = express();
    app.use(express.text({ type: "*/*" }));
    app.use("/api/v1/webhooks", webhookRoutes);

    const nullResponse = await request(app)
      .post("/api/v1/webhooks/tautulli")
      .set("Content-Type", "text/plain")
      .set("x-api-key", "expected-webhook-key")
      .send("null");

    expect(nullResponse.status).toBe(400);
    expect(nullResponse.body).toEqual({ error: "Empty or invalid payload" });

    const arrayResponse = await request(app)
      .post("/api/v1/webhooks/tautulli")
      .set("Content-Type", "text/plain")
      .set("x-api-key", "expected-webhook-key")
      .send("[]");

    expect(arrayResponse.status).toBe(400);
    expect(arrayResponse.body).toEqual({ error: "Empty or invalid payload" });
  });

  it("rejects empty Tautulli webhook bodies", async () => {
    const app = express();
    app.use(express.text({ type: "*/*" }));
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/tautulli")
      .set("Content-Type", "text/plain")
      .set("x-api-key", "expected-webhook-key")
      .send("   ");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Empty or invalid payload" });
  });

  it("rejects empty Tautulli JSON bodies with a blank rawBody", async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as express.Request & { rawBody?: string }).rawBody = "   ";
      next();
    });
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/tautulli")
      .set("x-api-key", "expected-webhook-key")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Empty or invalid payload" });
  });

  it("rejects empty Tautulli JSON objects", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/tautulli")
      .set("x-api-key", "expected-webhook-key")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Empty or invalid payload" });
  });

  it("rejects invalid Tautulli rawBody JSON", async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as express.Request & { rawBody?: string }).rawBody = "{not-json";
      next();
    });
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/tautulli")
      .set("x-api-key", "expected-webhook-key")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Invalid JSON payload" });
  });

  it("accepts a Tautulli webhook API key from the query string", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/tautulli?apiKey=expected-webhook-key")
      .send({ action: "created", media_type: "movie" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Event not supported",
    });
  });

  it("rejects Tautulli webhooks when the server machine ID does not match", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      plexServerMachineIdentifier: "expected-machine",
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/tautulli")
      .set("x-api-key", "expected-webhook-key")
      .send({
        action: "watched",
        username: "plex-user",
        media_type: "movie",
        title: "Example Movie",
        server_machine_id: "other-machine",
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Invalid server identity" });
    expect(syncServiceMocks.syncEvent).not.toHaveBeenCalled();
  });

  it("rejects Tautulli webhooks when the server machine ID is missing", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      plexServerMachineIdentifier: "expected-machine",
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/tautulli")
      .set("x-api-key", "expected-webhook-key")
      .send({
        action: "watched",
        username: "plex-user",
        media_type: "movie",
        title: "Example Movie",
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Invalid server identity" });
  });

  it("syncs a Tautulli watched event when the payload is valid", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      plexServerMachineIdentifier: "expected-machine",
      plexServerUrl: "https://plex.local:32400",
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/tautulli")
      .set("x-api-key", "expected-webhook-key")
      .send({
        action: "watched",
        username: "plex-user",
        media_type: "movie",
        title: "Example Movie",
        year: "2024",
        server_machine_id: "expected-machine",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(syncServiceMocks.syncEvent).toHaveBeenCalledOnce();
    expect(logger.webhook.info).toHaveBeenCalled();
  });

  it("syncs Tautulli playback events without scrobble logging", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/tautulli")
      .set("x-api-key", "expected-webhook-key")
      .send({
        action: "play",
        username: "plex-user",
        media_type: "movie",
        title: "Example Movie",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(syncServiceMocks.syncEvent).toHaveBeenCalledOnce();
    expect(logger.webhook.info).not.toHaveBeenCalled();
  });

  it("returns 500 when Tautulli event sync fails", async () => {
    syncServiceMocks.syncEvent.mockRejectedValue(new Error("sync failed"));

    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/tautulli")
      .set("x-api-key", "expected-webhook-key")
      .send({
        action: "play",
        username: "plex-user",
        media_type: "movie",
        title: "Example Movie",
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Internal server error" });
  });
});
