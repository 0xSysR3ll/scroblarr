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

const syncServiceMocks = vi.hoisted(() => ({
  retryHistoryItem: vi.fn(),
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

vi.mock("@services/SyncService", () => ({
  SyncService: class {
    retryHistoryItem = syncServiceMocks.retryHistoryItem;
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

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/sync", syncRoutes);
  return app;
}

describe("sync retry route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "user-id",
      isAdmin: false,
    });
  });

  it("retries a failed sync history item for the authenticated user", async () => {
    const historyItem = {
      id: "sync-id",
      userId: "user-id",
      success: false,
      source: "plex",
      mediaType: "movie",
      user: { id: "user-id", plexUsername: "plex-user" },
    };
    syncHistoryRepositoryMocks.findById.mockResolvedValue(historyItem);
    syncServiceMocks.retryHistoryItem.mockResolvedValue({
      success: true,
      destinations: ["TVTime"],
    });

    const response = await request(makeApp())
      .post("/api/v1/sync/history/sync-id/retry")
      .set("authorization", "Bearer valid-user-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: "sync-id",
      success: true,
      destinations: ["TVTime"],
    });
    expect(syncHistoryRepositoryMocks.findById).toHaveBeenCalledWith(
      "sync-id",
      "user-id"
    );
    expect(syncServiceMocks.retryHistoryItem).toHaveBeenCalledWith(historyItem);
  });

  it("returns 404 when the item does not belong to the user", async () => {
    syncHistoryRepositoryMocks.findById.mockResolvedValue(null);

    const response = await request(makeApp())
      .post("/api/v1/sync/history/sync-id/retry")
      .set("authorization", "Bearer valid-user-token");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Sync history item not found" });
    expect(syncServiceMocks.retryHistoryItem).not.toHaveBeenCalled();
  });

  it("rejects retrying fully successful sync history items", async () => {
    syncHistoryRepositoryMocks.findById.mockResolvedValue({
      id: "sync-id",
      userId: "user-id",
      success: true,
      source: "plex",
      mediaType: "movie",
      user: { id: "user-id", plexUsername: "plex-user" },
    });

    const response = await request(makeApp())
      .post("/api/v1/sync/history/sync-id/retry")
      .set("authorization", "Bearer valid-user-token");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error:
        "Only failed or partially failed sync history items can be retried",
    });
    expect(syncServiceMocks.retryHistoryItem).not.toHaveBeenCalled();
  });

  it("retries partially failed sync history items", async () => {
    const historyItem = {
      id: "sync-id",
      userId: "user-id",
      success: true,
      errorMessage: "TVTime: temporary failure",
      destinations: JSON.stringify(["Trakt"]),
      source: "plex",
      mediaType: "movie",
      user: { id: "user-id", plexUsername: "plex-user" },
    };
    syncHistoryRepositoryMocks.findById.mockResolvedValue(historyItem);
    syncServiceMocks.retryHistoryItem.mockResolvedValue({
      success: true,
      destinations: ["Trakt", "TVTime"],
    });

    const response = await request(makeApp())
      .post("/api/v1/sync/history/sync-id/retry")
      .set("authorization", "Bearer valid-user-token");

    expect(response.status).toBe(200);
    expect(syncServiceMocks.retryHistoryItem).toHaveBeenCalledWith(historyItem);
  });

  it("bulk retries selected failed sync history items", async () => {
    const firstHistoryItem = {
      id: "sync-id-1",
      userId: "user-id",
      success: false,
      source: "plex",
      mediaType: "movie",
      user: { id: "user-id", plexUsername: "plex-user" },
    };
    const secondHistoryItem = {
      id: "sync-id-2",
      userId: "user-id",
      success: false,
      source: "jellyfin",
      mediaType: "episode",
      user: { id: "user-id", jellyfinUserId: "jellyfin-user-id" },
    };
    syncHistoryRepositoryMocks.findById
      .mockResolvedValueOnce(firstHistoryItem)
      .mockResolvedValueOnce(secondHistoryItem);
    syncServiceMocks.retryHistoryItem
      .mockResolvedValueOnce({
        success: true,
        destinations: ["TVTime"],
      })
      .mockResolvedValueOnce({
        success: false,
        destinations: [],
        errorMessage: "TVTime: Too Many Requests - Rate limit exceeded",
      });

    const response = await request(makeApp())
      .post("/api/v1/sync/history/retry")
      .set("authorization", "Bearer valid-user-token")
      .send({ ids: ["sync-id-1", "sync-id-2"] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      retried: 1,
      failed: 1,
      results: [
        {
          id: "sync-id-1",
          success: true,
          destinations: ["TVTime"],
        },
        {
          id: "sync-id-2",
          success: false,
          destinations: [],
          errorMessage: "TVTime: Too Many Requests - Rate limit exceeded",
        },
      ],
    });
    expect(syncServiceMocks.retryHistoryItem).toHaveBeenCalledTimes(2);
  });
});
