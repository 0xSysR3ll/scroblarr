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
  findByUserPaginated: vi.fn(),
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
    findByUserPaginated = syncHistoryRepositoryMocks.findByUserPaginated;
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

describe("sync route protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no credentials are provided", async () => {
    const app = express();
    app.use("/api/v1/sync", syncRoutes);

    const response = await request(app).get("/api/v1/sync/history");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  it("allows authenticated user to access history", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "user-id",
      isAdmin: false,
      displayName: "User",
      plexUsername: "plex-user",
    });
    syncHistoryRepositoryMocks.findByUserPaginated.mockResolvedValue({
      data: [],
      total: 0,
    });

    const app = express();
    app.use("/api/v1/sync", syncRoutes);

    const response = await request(app)
      .get("/api/v1/sync/history")
      .set("authorization", "Bearer valid-user-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      },
    });
    expect(syncHistoryRepositoryMocks.findByUserPaginated).toHaveBeenCalledWith(
      "user-id",
      1,
      20,
      undefined,
      "syncedAt",
      "DESC"
    );
  });

  it("returns 400 for invalid page size", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "user-id",
      isAdmin: false,
    });

    const app = express();
    app.use("/api/v1/sync", syncRoutes);

    const response = await request(app)
      .get("/api/v1/sync/history?page=1&pageSize=500")
      .set("authorization", "Bearer valid-user-token");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Page size must be between 1 and 100",
    });
    expect(
      syncHistoryRepositoryMocks.findByUserPaginated
    ).not.toHaveBeenCalled();
  });

  it("passes validated filters and sorting to repository", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "user-id",
      isAdmin: false,
      displayName: "User",
      plexUsername: "plex-user",
    });
    syncHistoryRepositoryMocks.findByUserPaginated.mockResolvedValue({
      data: [],
      total: 0,
    });

    const app = express();
    app.use("/api/v1/sync", syncRoutes);

    const response = await request(app)
      .get(
        "/api/v1/sync/history?mediaType=episode&success=true&source=plex&sortBy=mediaTitle&sortOrder=ASC&page=2&pageSize=10"
      )
      .set("authorization", "Bearer valid-user-token");

    expect(response.status).toBe(200);
    expect(syncHistoryRepositoryMocks.findByUserPaginated).toHaveBeenCalledWith(
      "user-id",
      2,
      10,
      { mediaType: "episode", success: true, source: "plex" },
      "mediaTitle",
      "ASC"
    );
  });
});
