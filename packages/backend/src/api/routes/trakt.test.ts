import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
}));

const traktTokenManagerMocks = vi.hoisted(() => ({
  validateAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock("../middleware/auth", () => ({
  auth: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.user = { id: "user-id", plexUsername: "plex-user" } as never;
    next();
  },
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
    findById = userRepositoryMocks.findById;
    update = userRepositoryMocks.update;
  },
}));

vi.mock("@integrations/trakt/TraktTokenManager", () => ({
  TraktTokenManager: class {
    validateAccessToken = traktTokenManagerMocks.validateAccessToken;
    refreshAccessToken = traktTokenManagerMocks.refreshAccessToken;
  },
}));

vi.mock("@utils/logger", () => ({
  logger: {
    trakt: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  },
}));

import { traktRoutes } from "./trakt";

const linkedUser = {
  id: "user-id",
  plexUsername: "plex-user",
  traktAccessToken: "stored-access-token",
  traktRefreshToken: "stored-refresh-token",
  traktClientId: "stored-client-id",
  traktClientSecret: "stored-client-secret",
  traktUsername: "trakt-user",
  traktThumb: "https://img.example/trakt.png",
};

describe("trakt routes", () => {
  const app = express();
  app.use(express.json());
  app.use("/trakt", traktRoutes);

  beforeEach(() => {
    vi.clearAllMocks();
    userRepositoryMocks.findById.mockResolvedValue(linkedUser);
    traktTokenManagerMocks.validateAccessToken.mockResolvedValue(true);
    traktTokenManagerMocks.refreshAccessToken.mockResolvedValue(
      "refreshed-access-token"
    );
  });

  it("returns Trakt status when the stored access token is valid", async () => {
    const response = await request(app).get("/trakt/status").expect(200);

    expect(response.body).toEqual({
      linked: true,
      needsReauthorization: false,
      username: "trakt-user",
      image: "https://img.example/trakt.png",
      hasCredentials: true,
    });
    expect(traktTokenManagerMocks.validateAccessToken).toHaveBeenCalledWith(
      "stored-access-token",
      "stored-client-id"
    );
    expect(traktTokenManagerMocks.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("refreshes the token when the stored access token is invalid", async () => {
    traktTokenManagerMocks.validateAccessToken
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const response = await request(app).get("/trakt/status").expect(200);

    expect(response.body.needsReauthorization).toBe(false);
    expect(traktTokenManagerMocks.refreshAccessToken).toHaveBeenCalledWith(
      "user-id"
    );
    expect(traktTokenManagerMocks.validateAccessToken).toHaveBeenNthCalledWith(
      2,
      "refreshed-access-token",
      "stored-client-id"
    );
  });

  it("flags re-authorization when refresh still leaves an invalid token", async () => {
    traktTokenManagerMocks.validateAccessToken
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    const response = await request(app).get("/trakt/status").expect(200);

    expect(response.body.needsReauthorization).toBe(true);
  });

  it("flags re-authorization when refresh fails", async () => {
    traktTokenManagerMocks.validateAccessToken.mockResolvedValueOnce(false);
    traktTokenManagerMocks.refreshAccessToken.mockRejectedValueOnce(
      new Error("invalid_grant")
    );

    const response = await request(app).get("/trakt/status").expect(200);

    expect(response.body.needsReauthorization).toBe(true);
  });

  it("returns unlinked status without validating tokens", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      id: "user-id",
      plexUsername: "plex-user",
      traktAccessToken: null,
      traktClientId: null,
      traktClientSecret: null,
      traktUsername: null,
      traktThumb: null,
    });

    const response = await request(app).get("/trakt/status").expect(200);

    expect(response.body).toEqual({
      linked: false,
      needsReauthorization: false,
      username: null,
      image: null,
      hasCredentials: false,
    });
    expect(traktTokenManagerMocks.validateAccessToken).not.toHaveBeenCalled();
  });

  it("returns 500 when status lookup fails", async () => {
    userRepositoryMocks.findById.mockRejectedValueOnce(new Error("db down"));

    const response = await request(app).get("/trakt/status").expect(500);

    expect(response.body).toEqual({ error: "db down" });
  });
});
