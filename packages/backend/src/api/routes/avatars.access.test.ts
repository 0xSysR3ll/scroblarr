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
    findById = userRepositoryMocks.findById;
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

import { avatarRoutes } from "./avatars";

describe("avatar sensitive access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when non-admin requests another user's avatar", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "viewer-id",
      isAdmin: false,
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/plex/owner-id")
      .set("authorization", "Bearer viewer-token");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Forbidden" });
  });

  it("allows owner path and returns 404 for missing avatar data", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      plexThumb: null,
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/plex/owner-id")
      .set("authorization", "Bearer owner-token");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "User or Plex avatar not found" });
  });
});
