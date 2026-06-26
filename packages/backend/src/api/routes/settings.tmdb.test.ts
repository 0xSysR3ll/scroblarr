import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsRepositoryMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
}));

const userRepositoryMocks = vi.hoisted(() => ({
  findBySessionToken: vi.fn(),
  findByAccessToken: vi.fn(),
}));

const testTmdbAccessMocks = vi.hoisted(() => ({
  testTmdbAccessToken: vi.fn(),
}));

vi.mock("@repositories/SettingsRepository", () => ({
  SettingsRepository: class {
    getAll = settingsRepositoryMocks.getAll;
  },
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
    findBySessionToken = userRepositoryMocks.findBySessionToken;
    findByAccessToken = userRepositoryMocks.findByAccessToken;
  },
}));

vi.mock("@integrations/tmdb/testTmdbAccess", async () => {
  const actual = await vi.importActual<
    typeof import("@integrations/tmdb/testTmdbAccess")
  >("@integrations/tmdb/testTmdbAccess");
  return {
    ...actual,
    testTmdbAccessToken: testTmdbAccessMocks.testTmdbAccessToken,
  };
});

vi.mock("@utils/logger", () => ({
  logger: {
    api: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
  },
}));

import { TmdbRateLimitError } from "@integrations/tmdb/TmdbApiError";
import { logger } from "@utils/logger";

import { settingsRoutes } from "./settings";

describe("settings TMDB test route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userRepositoryMocks.findBySessionToken.mockResolvedValue({
      id: "admin-id",
      isAdmin: true,
    });
    settingsRepositoryMocks.getAll.mockResolvedValue({});
  });

  it("tests the token provided in the request body", async () => {
    testTmdbAccessMocks.testTmdbAccessToken.mockResolvedValue({
      success: true,
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/settings", settingsRoutes);

    const response = await request(app)
      .post("/api/v1/settings/tmdb/test")
      .set("authorization", "Bearer admin-token")
      .send({ tmdbAccessToken: "draft-token" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(testTmdbAccessMocks.testTmdbAccessToken).toHaveBeenCalledWith(
      "draft-token"
    );
  });

  it("trims TMDB tokens from the test request body", async () => {
    testTmdbAccessMocks.testTmdbAccessToken.mockResolvedValue({
      success: true,
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/settings", settingsRoutes);

    const response = await request(app)
      .post("/api/v1/settings/tmdb/test")
      .set("authorization", "Bearer admin-token")
      .send({ tmdbAccessToken: "  draft-token  " });

    expect(response.status).toBe(200);
    expect(testTmdbAccessMocks.testTmdbAccessToken).toHaveBeenCalledWith(
      "draft-token"
    );
  });

  it("falls back to the saved token when the request body is whitespace", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      tmdbAccessToken: "saved-token",
    });
    testTmdbAccessMocks.testTmdbAccessToken.mockResolvedValue({
      success: true,
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/settings", settingsRoutes);

    const response = await request(app)
      .post("/api/v1/settings/tmdb/test")
      .set("authorization", "Bearer admin-token")
      .send({ tmdbAccessToken: "   " });

    expect(response.status).toBe(200);
    expect(testTmdbAccessMocks.testTmdbAccessToken).toHaveBeenCalledWith(
      "saved-token"
    );
  });

  it("returns 400 when no token is available", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/settings", settingsRoutes);

    const response = await request(app)
      .post("/api/v1/settings/tmdb/test")
      .set("authorization", "Bearer admin-token")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      message: "No TMDB access token configured",
    });
  });

  it("uses the saved settings token when the request body is empty", async () => {
    settingsRepositoryMocks.getAll.mockResolvedValue({
      tmdbAccessToken: "saved-token",
    });
    testTmdbAccessMocks.testTmdbAccessToken.mockResolvedValue({
      success: true,
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/settings", settingsRoutes);

    const response = await request(app)
      .post("/api/v1/settings/tmdb/test")
      .set("authorization", "Bearer admin-token")
      .send({});

    expect(response.status).toBe(200);
    expect(testTmdbAccessMocks.testTmdbAccessToken).toHaveBeenCalledWith(
      "saved-token"
    );
  });

  it("returns TMDB validation failures from the test endpoint", async () => {
    testTmdbAccessMocks.testTmdbAccessToken.mockResolvedValue({
      success: false,
      status: 401,
      message: "Invalid TMDB access token",
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/settings", settingsRoutes);

    const response = await request(app)
      .post("/api/v1/settings/tmdb/test")
      .set("authorization", "Bearer admin-token")
      .send({ tmdbAccessToken: "bad-token" });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      status: 401,
      message: "Invalid TMDB access token",
    });
  });

  it("aligns HTTP status with mapped connection failures", async () => {
    testTmdbAccessMocks.testTmdbAccessToken.mockRejectedValue(
      new TmdbRateLimitError()
    );

    const app = express();
    app.use(express.json());
    app.use("/api/v1/settings", settingsRoutes);

    const response = await request(app)
      .post("/api/v1/settings/tmdb/test")
      .set("authorization", "Bearer admin-token")
      .send({ tmdbAccessToken: "token" });

    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      success: false,
      status: 429,
      message: "TMDB rate limit exceeded. Try again shortly.",
    });
    expect(logger.api.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(TmdbRateLimitError) }),
      "Error testing TMDB access token"
    );
  });

  it("returns validation errors for invalid TMDB test payloads", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/settings", settingsRoutes);

    const response = await request(app)
      .post("/api/v1/settings/tmdb/test")
      .set("authorization", "Bearer admin-token")
      .send({ tmdbAccessToken: 123 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation error");
  });

  it("uses TMDB_ACCESS_TOKEN from the environment when settings are empty", async () => {
    const originalToken = process.env.TMDB_ACCESS_TOKEN;
    process.env.TMDB_ACCESS_TOKEN = "env-token";
    testTmdbAccessMocks.testTmdbAccessToken.mockResolvedValue({
      success: true,
    });

    const app = express();
    app.use(express.json());
    app.use("/api/v1/settings", settingsRoutes);

    try {
      const response = await request(app)
        .post("/api/v1/settings/tmdb/test")
        .set("authorization", "Bearer admin-token")
        .send({});

      expect(response.status).toBe(200);
      expect(testTmdbAccessMocks.testTmdbAccessToken).toHaveBeenCalledWith(
        "env-token"
      );
    } finally {
      if (originalToken === undefined) {
        delete process.env.TMDB_ACCESS_TOKEN;
      } else {
        process.env.TMDB_ACCESS_TOKEN = originalToken;
      }
    }
  });

  it("maps unexpected TMDB test failures to a 500 response", async () => {
    testTmdbAccessMocks.testTmdbAccessToken.mockRejectedValue(
      new Error("network")
    );

    const app = express();
    app.use(express.json());
    app.use("/api/v1/settings", settingsRoutes);

    const response = await request(app)
      .post("/api/v1/settings/tmdb/test")
      .set("authorization", "Bearer admin-token")
      .send({ tmdbAccessToken: "token" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      status: 500,
      message: "Failed to reach TMDB API",
    });
    expect(logger.api.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      "Error testing TMDB access token"
    );
  });
});
