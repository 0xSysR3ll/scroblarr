import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsRepositoryMocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
}));

const userRepositoryMocks = vi.hoisted(() => ({
  findBySessionToken: vi.fn(),
  findByAccessToken: vi.fn(),
}));

const syncHistoryRepositoryMocks = vi.hoisted(() => ({
  findById: vi.fn(),
}));

vi.mock("@repositories/SettingsRepository", () => ({
  SettingsRepository: class {
    get = settingsRepositoryMocks.get;
    getAll = settingsRepositoryMocks.getAll;
  },
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
    findBySessionToken = userRepositoryMocks.findBySessionToken;
    findByAccessToken = userRepositoryMocks.findByAccessToken;
  },
}));

vi.mock("@repositories/SyncHistoryRepository", () => ({
  SyncHistoryRepository: class {
    findById = syncHistoryRepositoryMocks.findById;
  },
}));

vi.mock("@utils/logger", () => ({
  logger: {
    api: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
  },
}));

import { syncRoutes } from "./sync";

describe("sync poster sensitive access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when non-admin requests another user's poster", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "viewer-id",
      isAdmin: false,
    });
    syncHistoryRepositoryMocks.findById.mockResolvedValue({
      id: "sync-id",
      userId: "owner-id",
      posterUrl: "https://example.com/poster.jpg",
      source: "plex",
      user: { id: "owner-id", plexAccessToken: "token" },
    });

    const app = express();
    app.use("/api/v1/sync", syncRoutes);

    const response = await request(app)
      .get("/api/v1/sync/poster/sync-id")
      .set("authorization", "Bearer viewer-token");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Forbidden" });
  });

  it("allows owner path and returns 404 if poster is missing", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    syncHistoryRepositoryMocks.findById.mockResolvedValue({
      id: "sync-id",
      userId: "owner-id",
      posterUrl: null,
      source: "plex",
      user: { id: "owner-id", plexAccessToken: "token" },
    });

    const app = express();
    app.use("/api/v1/sync", syncRoutes);

    const response = await request(app)
      .get("/api/v1/sync/poster/sync-id")
      .set("authorization", "Bearer owner-token");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "No poster available" });
  });
});
