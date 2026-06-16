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
    vi.unstubAllGlobals();
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

  it("proxies Simkl avatars for the owning user", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn().mockReturnValue("image/png"),
      },
      arrayBuffer: vi.fn().mockResolvedValue(Buffer.from("image-bytes").buffer),
    });
    vi.stubGlobal("fetch", fetchMock);
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      simklThumb: "https://simkl.example/avatar.png",
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/simkl/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(200);

    expect(fetchMock).toHaveBeenCalledWith("https://simkl.example/avatar.png", {
      headers: {
        Accept: "image/*",
      },
    });
    expect(response.headers["content-type"]).toContain("image/png");
  });

  it("returns upstream failures for Simkl avatars", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })
    );
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      simklThumb: "https://simkl.example/missing.png",
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/simkl/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(404);

    expect(response.body).toEqual({ error: "Failed to fetch Simkl avatar" });
  });

  it("returns 500 when Simkl avatar proxying throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "owner-id",
      isAdmin: false,
    });
    userRepositoryMocks.findById.mockResolvedValue({
      id: "owner-id",
      simklThumb: "https://simkl.example/avatar.png",
    });

    const app = express();
    app.use("/api/v1/avatars", avatarRoutes);

    const response = await request(app)
      .get("/api/v1/avatars/simkl/owner-id")
      .set("authorization", "Bearer owner-token")
      .expect(500);

    expect(response.body).toEqual({ error: "Failed to fetch Simkl avatar" });
  });
});
