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

const traktOAuthMocks = vi.hoisted(() => ({
  requestPinCode: vi.fn(),
  exchangePinForToken: vi.fn(),
}));

const traktPinStoreMocks = vi.hoisted(() => ({
  rememberTraktPin: vi.fn(),
  resolveTraktDeviceCode: vi.fn(),
  clearTraktPin: vi.fn(),
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

vi.mock("@integrations/trakt/TraktOAuth", () => ({
  TraktOAuth: class {
    requestPinCode = traktOAuthMocks.requestPinCode;
    exchangePinForToken = traktOAuthMocks.exchangePinForToken;
  },
  rememberTraktPin: traktPinStoreMocks.rememberTraktPin,
  resolveTraktDeviceCode: traktPinStoreMocks.resolveTraktDeviceCode,
  clearTraktPin: traktPinStoreMocks.clearTraktPin,
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
    traktOAuthMocks.requestPinCode.mockResolvedValue({
      device_code: "device-code",
      user_code: "ABCD1234",
      verification_url: "https://trakt.tv/activate",
      expires_in: 600,
      interval: 5,
    });
    traktOAuthMocks.exchangePinForToken.mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresAt: Date.now() + 3600_000,
    });
    traktPinStoreMocks.resolveTraktDeviceCode.mockReturnValue("device-code");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          username: "alice",
          images: { avatar: { full: "https://img.example/alice.png" } },
        }),
      })
    );
  });

  it("returns PIN authorization details", async () => {
    const response = await request(app).post("/trakt/authorize").expect(200);

    expect(response.body).toEqual({
      userCode: "ABCD1234",
      verificationUrl: "https://trakt.tv/activate",
      expiresIn: 600,
      interval: 5,
    });
    expect(traktOAuthMocks.requestPinCode).toHaveBeenCalledOnce();
    expect(traktPinStoreMocks.rememberTraktPin).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        device_code: "device-code",
        user_code: "ABCD1234",
      })
    );
  });

  it("requires credentials before requesting a PIN code", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      ...linkedUser,
      traktClientId: null,
      traktClientSecret: null,
    });

    const response = await request(app).post("/trakt/authorize").expect(400);

    expect(response.body.error).toMatch(/client ID and secret/i);
    expect(traktOAuthMocks.requestPinCode).not.toHaveBeenCalled();
  });

  it("accepts credentials from the authorize request body", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      ...linkedUser,
      traktClientId: null,
      traktClientSecret: null,
    });

    const response = await request(app)
      .post("/trakt/authorize")
      .send({
        clientId: "provided-client-id",
        clientSecret: "provided-client-secret",
      })
      .expect(200);

    expect(response.body).toEqual({
      userCode: "ABCD1234",
      verificationUrl: "https://trakt.tv/activate",
      expiresIn: 600,
      interval: 5,
    });
    expect(traktOAuthMocks.requestPinCode).toHaveBeenCalledOnce();
  });

  it("links a Trakt account after PIN approval", async () => {
    const response = await request(app)
      .post("/trakt/link")
      .send({
        userCode: "ABCD1234",
        clientId: "provided-client-id",
        clientSecret: "provided-client-secret",
      })
      .expect(200);

    expect(response.body).toEqual({ success: true });
    expect(traktPinStoreMocks.resolveTraktDeviceCode).toHaveBeenCalledWith(
      "user-id",
      "ABCD1234"
    );
    expect(traktOAuthMocks.exchangePinForToken).toHaveBeenCalledWith(
      "device-code"
    );
    expect(traktPinStoreMocks.clearTraktPin).toHaveBeenCalledWith("user-id");
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        traktAccessToken: "new-access-token",
        traktRefreshToken: "new-refresh-token",
        traktUsername: "alice",
        traktThumb: "https://img.example/alice.png",
        traktClientId: "provided-client-id",
        traktClientSecret: "provided-client-secret",
      })
    );
  });

  it("returns pending authorization as a 400 while polling", async () => {
    traktOAuthMocks.exchangePinForToken.mockRejectedValueOnce(
      new Error("authorization pending")
    );

    const response = await request(app)
      .post("/trakt/link")
      .send({ userCode: "ABCD1234" })
      .expect(400);

    expect(response.body).toEqual({ error: "authorization pending" });
  });

  it("returns slow down as a 400 while polling", async () => {
    traktOAuthMocks.exchangePinForToken.mockRejectedValueOnce(
      new Error("slow down")
    );

    const response = await request(app)
      .post("/trakt/link")
      .send({ userCode: "ABCD1234" })
      .expect(400);

    expect(response.body).toEqual({ error: "slow down" });
  });

  it("returns expired device codes as a 400", async () => {
    traktPinStoreMocks.resolveTraktDeviceCode.mockImplementationOnce(() => {
      throw new Error(
        "Trakt device code expired. Generate a new one to try again."
      );
    });

    const response = await request(app)
      .post("/trakt/link")
      .send({ userCode: "ABCD1234" })
      .expect(400);

    expect(response.body).toEqual({
      error: "Trakt device code expired. Generate a new one to try again.",
    });
    expect(traktOAuthMocks.exchangePinForToken).not.toHaveBeenCalled();
  });

  it.each([
    ["Trakt device code is invalid"],
    ["Trakt device code has already been used"],
    ["Trakt authorization was denied"],
  ])("returns %s as a 400", async (message) => {
    traktOAuthMocks.exchangePinForToken.mockRejectedValueOnce(
      new Error(message)
    );

    const response = await request(app)
      .post("/trakt/link")
      .send({ userCode: "ABCD1234" })
      .expect(400);

    expect(response.body).toEqual({ error: message });
  });

  it("requires credentials before linking", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      ...linkedUser,
      traktClientId: null,
      traktClientSecret: null,
    });

    const response = await request(app)
      .post("/trakt/link")
      .send({ userCode: "ABCD1234" })
      .expect(400);

    expect(response.body.error).toMatch(/client ID and secret/i);
    expect(traktOAuthMocks.exchangePinForToken).not.toHaveBeenCalled();
  });

  it("returns 500 when PIN authorization request fails", async () => {
    traktOAuthMocks.requestPinCode.mockRejectedValueOnce(
      new Error("Trakt down")
    );

    const response = await request(app).post("/trakt/authorize").expect(500);

    expect(response.body).toEqual({ error: "Trakt down" });
  });

  it("returns a generic authorize error for non-Error failures", async () => {
    traktOAuthMocks.requestPinCode.mockRejectedValueOnce("trakt unavailable");

    const response = await request(app).post("/trakt/authorize").expect(500);

    expect(response.body).toEqual({
      error: "Failed to request Trakt PIN code",
    });
  });

  it("links even when profile lookup fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("profile unavailable"))
    );

    const response = await request(app)
      .post("/trakt/link")
      .send({ userCode: "ABCD1234" })
      .expect(200);

    expect(response.body).toEqual({ success: true });
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        traktAccessToken: "new-access-token",
        traktRefreshToken: "new-refresh-token",
      })
    );
  });

  it("returns 500 when linking fails for non-pending reasons", async () => {
    traktOAuthMocks.exchangePinForToken.mockRejectedValueOnce(
      new Error("invalid client")
    );

    const response = await request(app)
      .post("/trakt/link")
      .send({ userCode: "ABCD1234" })
      .expect(500);

    expect(response.body).toEqual({ error: "invalid client" });
  });

  it("returns 401 when the authorize user no longer exists", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce(null);

    const response = await request(app).post("/trakt/authorize").expect(401);

    expect(response.body).toEqual({ error: "User not found" });
  });

  it("returns 401 when the link user no longer exists", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce(null);

    const response = await request(app)
      .post("/trakt/link")
      .send({ userCode: "ABCD1234" })
      .expect(401);

    expect(response.body).toEqual({ error: "User not found" });
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
