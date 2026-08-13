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

vi.mock("@services/SyncService", () => ({
  SyncService: class {
    syncEvent = vi.fn();
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

describe("webhook security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsRepositoryMocks.get.mockImplementation(async (key: string) => {
      if (key === "webhookApiKey") {
        return "expected-webhook-key";
      }
      return null;
    });
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
});
