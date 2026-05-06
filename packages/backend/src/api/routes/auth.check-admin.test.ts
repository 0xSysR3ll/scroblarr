import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
  findAdmin: vi.fn(),
}));

const settingsRepositoryMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
    findAdmin = userRepositoryMocks.findAdmin;
  },
}));

vi.mock("@repositories/SettingsRepository", () => ({
  SettingsRepository: class {
    getAll = settingsRepositoryMocks.getAll;
  },
}));

vi.mock("@repositories/SessionRepository", () => ({
  SessionRepository: class {},
}));

vi.mock("@utils/logger", () => ({
  logger: {
    auth: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
  },
}));

import { authRoutes } from "./auth";

describe("GET /api/v1/auth/check-admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns admin state and configured jellyfin settings", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue({ id: "admin-id" });
    settingsRepositoryMocks.getAll.mockResolvedValue({
      jellyfinHost: "https://jellyfin.local:8920/jellyfin",
    });

    const app = express();
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app).get("/api/v1/auth/check-admin");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      hasAdmin: true,
      configuredService: "jellyfin",
      jellyfinSettings: {
        hostname: "jellyfin.local",
        port: 8920,
        useSsl: true,
        urlBase: "jellyfin",
      },
    });
  });

  it("returns null configured service when no media server is configured", async () => {
    userRepositoryMocks.findAdmin.mockResolvedValue(null);
    settingsRepositoryMocks.getAll.mockResolvedValue({});

    const app = express();
    app.use("/api/v1/auth", authRoutes);

    const response = await request(app).get("/api/v1/auth/check-admin");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      hasAdmin: false,
      configuredService: null,
    });
  });
});
