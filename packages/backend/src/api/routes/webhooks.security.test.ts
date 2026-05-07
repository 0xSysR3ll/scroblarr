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
  });

  it("rejects Plex webhook when API key is invalid", async () => {
    settingsRepositoryMocks.get.mockResolvedValue("expected-api-key");

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

  it("rejects Jellyfin webhook when API key is missing", async () => {
    settingsRepositoryMocks.get.mockResolvedValue("expected-api-key");

    const app = express();
    app.use(express.json());
    app.use("/api/v1/webhooks", webhookRoutes);

    const response = await request(app)
      .post("/api/v1/webhooks/jellyfin")
      .send({ Event: "PlaybackStart" });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Invalid API key" });
  });
});
