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

import { auth } from "./auth";

function buildApp() {
  const app = express();
  app.use(cookieParser());
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

  it("allows access for a valid session cookie", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "user-id",
    });

    const app = buildApp();
    const response = await request(app)
      .get("/protected")
      .set("Cookie", "session=session-token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, userId: "user-id" });
    expect(userRepositoryMocks.findBySessionToken).toHaveBeenCalledWith(
      "session-token"
    );
  });

  it("allows access for a valid session Bearer token", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "user-id",
    });

    const app = buildApp();
    const response = await request(app)
      .get("/protected")
      .set("authorization", "Bearer session-token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, userId: "user-id" });
    expect(userRepositoryMocks.findBySessionToken).toHaveBeenCalledWith(
      "session-token"
    );
  });

  it("rejects a Bearer token that is not a Scroblarr session", async () => {
    userRepositoryMocks.findBySessionToken.mockResolvedValue(null);

    const app = buildApp();
    const response = await request(app)
      .get("/protected")
      .set("authorization", "Bearer plex-or-jellyfin-token");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });
});
