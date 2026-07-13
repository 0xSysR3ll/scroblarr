import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsRepositoryMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}));

const userRepositoryMocks = vi.hoisted(() => ({
  findBySessionToken: vi.fn(),
  findByAccessToken: vi.fn(),
}));

vi.mock("@repositories/SettingsRepository", () => ({
  SettingsRepository: class {
    getAll = settingsRepositoryMocks.getAll;
    set = settingsRepositoryMocks.set;
    delete = settingsRepositoryMocks.delete;
  },
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
    findBySessionToken = userRepositoryMocks.findBySessionToken;
    findByAccessToken = userRepositoryMocks.findByAccessToken;
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

import { settingsRoutes } from "./settings";

describe("settings PATCH", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "admin-id",
      isAdmin: true,
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      tmdbAccessToken: "saved-token",
    });
  });

  it("persists a TMDB access token", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/settings", settingsRoutes);

    const response = await request(app)
      .patch("/api/v1/settings")
      .set("authorization", "Bearer admin-token")
      .send({ tmdbAccessToken: "new-token" });

    expect(response.status).toBe(200);
    expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
      "tmdbAccessToken",
      "new-token"
    );
  });

  it("clears a TMDB access token when an empty string is sent", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/settings", settingsRoutes);

    const response = await request(app)
      .patch("/api/v1/settings")
      .set("authorization", "Bearer admin-token")
      .send({ tmdbAccessToken: "" });

    expect(response.status).toBe(200);
    expect(settingsRepositoryMocks.delete).toHaveBeenCalledWith(
      "tmdbAccessToken"
    );
  });

  it("trims TMDB access tokens before saving", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/settings", settingsRoutes);

    const response = await request(app)
      .patch("/api/v1/settings")
      .set("authorization", "Bearer admin-token")
      .send({ tmdbAccessToken: "  trimmed-token  " });

    expect(response.status).toBe(200);
    expect(settingsRepositoryMocks.set).toHaveBeenCalledWith(
      "tmdbAccessToken",
      "trimmed-token"
    );
  });

  it("clears a TMDB access token when whitespace-only input is sent", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/settings", settingsRoutes);

    const response = await request(app)
      .patch("/api/v1/settings")
      .set("authorization", "Bearer admin-token")
      .send({ tmdbAccessToken: "   " });

    expect(response.status).toBe(200);
    expect(settingsRepositoryMocks.delete).toHaveBeenCalledWith(
      "tmdbAccessToken"
    );
  });

  it("returns validation errors for invalid TMDB token payloads", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/settings", settingsRoutes);

    const response = await request(app)
      .patch("/api/v1/settings")
      .set("authorization", "Bearer admin-token")
      .send({ tmdbAccessToken: 123 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation error");
  });
});
