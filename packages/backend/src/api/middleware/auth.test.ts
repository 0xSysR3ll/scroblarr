import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsRepositoryMocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

const userRepositoryMocks = vi.hoisted(() => ({
  findBySessionToken: vi.fn(),
  findByAccessToken: vi.fn(),
}));

vi.mock("@repositories/SettingsRepository", () => ({
  SettingsRepository: class {
    get = settingsRepositoryMocks.get;
  },
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
    findBySessionToken = userRepositoryMocks.findBySessionToken;
    findByAccessToken = userRepositoryMocks.findByAccessToken;
  },
}));

import { auth } from "./auth";

function buildApp() {
  const app = express();
  app.get("/protected", auth, (req, res) => {
    res.status(200).json({
      ok: true,
      apiKeyAuth: req.apiKeyAuth ?? false,
      userId: req.user?.id ?? null,
    });
  });
  return app;
}

describe("auth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no auth is provided", async () => {
    const app = buildApp();
    const response = await request(app).get("/protected");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 for invalid API key", async () => {
    settingsRepositoryMocks.get.mockResolvedValue("stored-secret");
    const app = buildApp();
    const response = await request(app)
      .get("/protected")
      .set("x-api-key", "wrong-secret");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Invalid API key" });
  });

  it("allows access for valid API key", async () => {
    settingsRepositoryMocks.get.mockResolvedValue("stored-secret");
    const app = buildApp();
    const response = await request(app)
      .get("/protected")
      .set("x-api-key", "stored-secret");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, apiKeyAuth: true });
  });
});
