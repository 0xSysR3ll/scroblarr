import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsRepositoryMocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

const userRepositoryMocks = vi.hoisted(() => ({
  findBySessionToken: vi.fn(),
}));

vi.mock("@repositories/SettingsRepository", () => ({
  SettingsRepository: class {
    get = settingsRepositoryMocks.get;
  },
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
    findBySessionToken = userRepositoryMocks.findBySessionToken;
  },
}));

import { adminAuth } from "./adminAuth";

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.get("/admin", adminAuth, (req, res) => {
    res.status(200).json({
      ok: true,
      apiKeyAuth: req.apiKeyAuth ?? false,
      userId: req.user?.id ?? null,
    });
  });
  return app;
}

describe("adminAuth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no auth is provided", async () => {
    const app = buildApp();
    const response = await request(app).get("/admin");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 for non-admin token", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "u1",
      isAdmin: false,
    });

    const app = buildApp();
    const response = await request(app)
      .get("/admin")
      .set("authorization", "Bearer session-token");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Forbidden: Admin access required",
    });
  });

  it("allows access for valid admin token", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "admin-id",
      isAdmin: true,
    });

    const app = buildApp();
    const response = await request(app)
      .get("/admin")
      .set("authorization", "Bearer admin-token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, userId: "admin-id" });
  });

  it("rejects a Bearer token that is not a Scroblarr session", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue(null);

    const app = buildApp();
    const response = await request(app)
      .get("/admin")
      .set("authorization", "Bearer plex-or-jellyfin-token");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Forbidden: Admin access required",
    });
  });
});
