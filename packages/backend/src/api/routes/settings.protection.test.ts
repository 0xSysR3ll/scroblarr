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

vi.mock("@repositories/SettingsRepository", () => ({
  SettingsRepository: class {
    get = settingsRepositoryMocks.get;
    getAll = settingsRepositoryMocks.getAll;
    set = vi.fn();
    delete = vi.fn();
    deleteMany = vi.fn();
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

describe("settings route protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no credentials are provided", async () => {
    const app = express();
    app.use("/api/v1/settings", settingsRoutes);

    const response = await request(app).get("/api/v1/settings");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 for non-admin authenticated user", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "user-id",
      isAdmin: false,
    });

    const app = express();
    app.use("/api/v1/settings", settingsRoutes);

    const response = await request(app)
      .get("/api/v1/settings")
      .set("authorization", "Bearer user-token");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Forbidden: Admin access required",
    });
  });
});
