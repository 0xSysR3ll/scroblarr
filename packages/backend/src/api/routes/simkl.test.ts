import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
}));

const simklOAuthMocks = vi.hoisted(() => ({
  requestPinCode: vi.fn(),
  exchangePinForToken: vi.fn(),
  revokeToken: vi.fn(),
}));

const simklDeviceStoreMocks = vi.hoisted(() => ({
  rememberSimklDevice: vi.fn(),
  resolveSimklDeviceCode: vi.fn(),
  clearSimklDevice: vi.fn(),
}));

const simklClientMocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
}));

const simklTokenManagerMocks = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  user: {
    id: "user-id",
    plexUsername: "plex-user",
  } as Record<string, unknown> | null,
}));

vi.mock("../middleware/auth", () => ({
  auth: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    if (authState.user) {
      req.user = authState.user as never;
    }
    next();
  },
}));

vi.mock("@repositories/UserRepository", () => ({
  UserRepository: class {
    findById = userRepositoryMocks.findById;
    update = userRepositoryMocks.update;
  },
}));

vi.mock("@integrations/simkl/SimklOAuth", () => ({
  SimklOAuth: class {
    requestPinCode = simklOAuthMocks.requestPinCode;
    exchangePinForToken = simklOAuthMocks.exchangePinForToken;
    revokeToken = simklOAuthMocks.revokeToken;
  },
  rememberSimklDevice: simklDeviceStoreMocks.rememberSimklDevice,
  resolveSimklDeviceCode: simklDeviceStoreMocks.resolveSimklDeviceCode,
  clearSimklDevice: simklDeviceStoreMocks.clearSimklDevice,
}));

vi.mock("@integrations/simkl/SimklClient", () => ({
  SimklClient: class {
    getUserProfile = simklClientMocks.getUserProfile;
  },
}));

vi.mock("@integrations/simkl/SimklTokenManager", () => ({
  SimklTokenManager: class {
    getValidAccessToken = simklTokenManagerMocks.getValidAccessToken;
  },
}));

vi.mock("@utils/logger", () => ({
  logger: {
    simkl: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  },
}));

import { getSimklClientId } from "@integrations/simkl/simklConfig";

import { refreshAndStoreSimklAccountType, simklRoutes } from "./simkl";

describe("simkl routes", () => {
  const app = express();
  app.use(express.json());
  app.use("/simkl", simklRoutes);

  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = {
      id: "user-id",
      plexUsername: "plex-user",
    };
    simklTokenManagerMocks.getValidAccessToken.mockResolvedValue(
      "access-token"
    );
    userRepositoryMocks.findById.mockResolvedValue({
      id: "user-id",
      plexUsername: "plex-user",
      simklClientId: "stored-client-id",
      simklAccessToken: "stored-access-token",
      simklUsername: "stored-user",
      simklThumb: "https://img.example/stored.png",
      simklAccountType: "pro",
      simklMarkMoviesAsRewatched: false,
      simklMarkEpisodesAsRewatched: false,
    });
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "alice",
      image: "https://img.example/alice.png",
      accountType: "pro",
    });
  });

  it("returns a PIN authorization payload", async () => {
    simklOAuthMocks.requestPinCode.mockResolvedValue({
      device_code: "device-code",
      user_code: "BDWP-HQPK",
      verification_uri: "https://simkl.com/pin",
      verification_uri_complete: "https://simkl.com/pin?user_code=BDWP-HQPK",
      expires_in: 900,
      interval: 5,
    });

    const response = await request(app).get("/simkl/authorize").expect(200);

    expect(response.body).toEqual({
      userCode: "BDWP-HQPK",
      verificationUrl: "https://simkl.com/pin?user_code=BDWP-HQPK",
      expiresIn: 900,
      interval: 5,
    });
    expect(simklOAuthMocks.requestPinCode).toHaveBeenCalledOnce();
    expect(simklDeviceStoreMocks.rememberSimklDevice).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        device_code: "device-code",
        user_code: "BDWP-HQPK",
      })
    );
  });

  it("falls back to verification_uri when the complete URI is absent", async () => {
    simklOAuthMocks.requestPinCode.mockResolvedValue({
      device_code: "device-code",
      user_code: "BDWP-HQPK",
      verification_uri: "https://simkl.com/pin",
      expires_in: 900,
      interval: 5,
    });

    const response = await request(app).get("/simkl/authorize").expect(200);

    expect(response.body.verificationUrl).toBe("https://simkl.com/pin");
  });

  it("authorizes with the official Client ID when the user has none stored", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      id: "user-id",
      plexUsername: "plex-user",
      simklClientId: null,
    });
    simklOAuthMocks.requestPinCode.mockResolvedValue({
      device_code: "device-code",
      user_code: "BDWP-HQPK",
      verification_uri: "https://simkl.com/pin",
      expires_in: 900,
      interval: 5,
    });

    await request(app).get("/simkl/authorize").expect(200);

    expect(simklOAuthMocks.requestPinCode).toHaveBeenCalledOnce();
  });

  it("links a Simkl account", async () => {
    simklDeviceStoreMocks.resolveSimklDeviceCode.mockReturnValue("device-code");
    simklOAuthMocks.exchangePinForToken.mockResolvedValue({
      accessToken: "simkl_at_new",
      refreshToken: "simkl_rt_new",
      expiresAt: 1_700_000_000_000,
    });
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "alice",
      image: "https://img.example/alice.png",
      accountType: "pro",
    });

    const response = await request(app)
      .post("/simkl/link")
      .send({ userCode: "BDWP-HQPK" })
      .expect(200);

    expect(response.body).toEqual({ success: true });
    expect(simklDeviceStoreMocks.resolveSimklDeviceCode).toHaveBeenCalledWith(
      "user-id",
      "BDWP-HQPK"
    );
    expect(simklOAuthMocks.exchangePinForToken).toHaveBeenCalledWith(
      "device-code"
    );
    expect(simklDeviceStoreMocks.clearSimklDevice).toHaveBeenCalledWith(
      "user-id"
    );
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        simklAccessToken: "simkl_at_new",
        simklRefreshToken: "simkl_rt_new",
        simklTokenExpiresAt: 1_700_000_000_000,
        simklUsername: "alice",
        simklThumb: "https://img.example/alice.png",
        simklClientId: getSimklClientId(),
        simklAccountType: "pro",
      })
    );
  });

  it("clears rewatch toggles when linking a free Simkl account", async () => {
    simklDeviceStoreMocks.resolveSimklDeviceCode.mockReturnValue("device-code");
    simklOAuthMocks.exchangePinForToken.mockResolvedValue({
      accessToken: "simkl_at_new",
      refreshToken: "simkl_rt_new",
      expiresAt: 1_700_000_000_000,
    });
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "alice",
      image: null,
      accountType: "free",
    });

    await request(app)
      .post("/simkl/link")
      .send({ userCode: "BDWP-HQPK" })
      .expect(200);

    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        simklAccountType: "free",
        simklMarkMoviesAsRewatched: false,
        simklMarkEpisodesAsRewatched: false,
      })
    );
  });

  it("clears refresh token and expiry when the link response omits them", async () => {
    simklDeviceStoreMocks.resolveSimklDeviceCode.mockReturnValue("device-code");
    simklOAuthMocks.exchangePinForToken.mockResolvedValue({
      accessToken: "simkl_at_new",
    });
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "alice",
      image: "https://img.example/alice.png",
    });

    const response = await request(app)
      .post("/simkl/link")
      .send({ userCode: "BDWP-HQPK" })
      .expect(200);

    expect(response.body).toEqual({ success: true });
    expect(userRepositoryMocks.update).toHaveBeenCalledWith("user-id", {
      simklAccessToken: "simkl_at_new",
      simklRefreshToken: null,
      simklTokenExpiresAt: null,
      simklUsername: "alice",
      simklThumb: "https://img.example/alice.png",
      simklClientId: getSimklClientId(),
    });
  });

  it("stores the official Client ID and revokes a previous personal grant on reconnect", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      id: "user-id",
      plexUsername: "plex-user",
      simklClientId: "personal-client-id",
      simklAccessToken: "simkl_at_old",
      simklRefreshToken: "simkl_rt_old",
    });
    simklDeviceStoreMocks.resolveSimklDeviceCode.mockReturnValue("device-code");
    simklOAuthMocks.exchangePinForToken.mockResolvedValue({
      accessToken: "simkl_at_new",
      refreshToken: "simkl_rt_new",
      expiresAt: 1_700_000_000_000,
    });
    simklClientMocks.getUserProfile.mockRejectedValue(
      new Error("profile down")
    );
    simklOAuthMocks.revokeToken.mockResolvedValue(undefined);

    await request(app)
      .post("/simkl/link")
      .send({ userCode: "BDWP-HQPK" })
      .expect(200);

    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        simklAccessToken: "simkl_at_new",
        simklClientId: getSimklClientId(),
      })
    );
    expect(simklOAuthMocks.revokeToken).toHaveBeenCalledWith("simkl_rt_old");
    const updateOrder = userRepositoryMocks.update.mock.invocationCallOrder[0];
    const revokeOrder = simklOAuthMocks.revokeToken.mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(revokeOrder);
  });

  it("still reconnects when revoking the previous personal grant fails", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      id: "user-id",
      plexUsername: "plex-user",
      simklClientId: "personal-client-id",
      simklAccessToken: "simkl_at_old",
      simklRefreshToken: "simkl_rt_old",
    });
    simklDeviceStoreMocks.resolveSimklDeviceCode.mockReturnValue("device-code");
    simklOAuthMocks.exchangePinForToken.mockResolvedValue({
      accessToken: "simkl_at_new",
      refreshToken: "simkl_rt_new",
      expiresAt: 1_700_000_000_000,
    });
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "alice",
      image: "https://img.example/alice.png",
    });
    simklOAuthMocks.revokeToken.mockRejectedValue(new Error("revoke down"));

    const response = await request(app)
      .post("/simkl/link")
      .send({ userCode: "BDWP-HQPK" })
      .expect(200);

    expect(response.body).toEqual({ success: true });
    expect(simklOAuthMocks.revokeToken).toHaveBeenCalledWith("simkl_rt_old");
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        simklAccessToken: "simkl_at_new",
        simklClientId: getSimklClientId(),
      })
    );
  });

  it("returns validation errors for invalid link payloads", async () => {
    const response = await request(app)
      .post("/simkl/link")
      .send({})
      .expect(400);

    expect(response.body.error).toBe("Validation error");
    expect(simklOAuthMocks.exchangePinForToken).not.toHaveBeenCalled();
  });

  it("returns pending PIN errors as bad requests", async () => {
    simklDeviceStoreMocks.resolveSimklDeviceCode.mockReturnValue("device-code");
    simklOAuthMocks.exchangePinForToken.mockRejectedValue(
      new Error("authorization pending")
    );

    const response = await request(app)
      .post("/simkl/link")
      .send({ userCode: "BDWP-HQPK" })
      .expect(400);

    expect(response.body).toEqual({ error: "authorization pending" });
  });

  it("returns expired device code errors as bad requests", async () => {
    simklDeviceStoreMocks.resolveSimklDeviceCode.mockImplementation(() => {
      throw new Error(
        "Simkl device code expired. Generate a new one to try again."
      );
    });

    const response = await request(app)
      .post("/simkl/link")
      .send({ userCode: "BDWP-HQPK" })
      .expect(400);

    expect(response.body).toEqual({
      error: "Simkl device code expired. Generate a new one to try again.",
    });
  });

  it("returns mismatched PIN errors as bad requests", async () => {
    simklDeviceStoreMocks.resolveSimklDeviceCode.mockImplementation(() => {
      throw new Error("Simkl PIN code does not match the active authorization");
    });

    const response = await request(app)
      .post("/simkl/link")
      .send({ userCode: "WRONG-CODE" })
      .expect(400);

    expect(response.body).toEqual({
      error: "Simkl PIN code does not match the active authorization",
    });
  });

  it("unlinks a Simkl account", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      id: "user-id",
      plexUsername: "plex-user",
      simklClientId: "stored-client-id",
      simklAccessToken: "simkl_at_token",
      simklRefreshToken: "simkl_rt_token",
    });
    simklOAuthMocks.revokeToken.mockResolvedValue(undefined);

    const response = await request(app).post("/simkl/unlink").expect(200);

    expect(response.body).toEqual({ success: true });
    expect(simklOAuthMocks.revokeToken).toHaveBeenCalledWith("simkl_rt_token");
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        simklAccessToken: null,
        simklRefreshToken: null,
        simklTokenExpiresAt: null,
        simklClientId: null,
        simklAccountType: null,
        simklMarkMoviesAsRewatched: false,
        simklMarkEpisodesAsRewatched: false,
      })
    );
  });

  it("still unlinks when token revoke fails", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      id: "user-id",
      plexUsername: "plex-user",
      simklClientId: "stored-client-id",
      simklAccessToken: "simkl_at_token",
      simklRefreshToken: "simkl_rt_token",
    });
    simklOAuthMocks.revokeToken.mockRejectedValue(new Error("revoke down"));

    const response = await request(app).post("/simkl/unlink").expect(200);

    expect(response.body).toEqual({ success: true });
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        simklAccessToken: null,
        simklClientId: null,
      })
    );
  });

  it("returns Simkl status", async () => {
    const response = await request(app).get("/simkl/status").expect(200);

    expect(response.body).toEqual({
      linked: true,
      username: "stored-user",
      image: "https://img.example/stored.png",
      hasCredentials: true,
      needsReconnect: true,
      accountType: "pro",
      canTrackRewatches: true,
      markMoviesAsRewatched: false,
      markEpisodesAsRewatched: false,
    });
  });

  it("does not request reconnect when linked with the official V2 Client ID", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      id: "user-id",
      plexUsername: "plex-user",
      simklClientId: getSimklClientId(),
      simklAccessToken: "simkl_at_official_token_value_here_",
      simklUsername: "stored-user",
      simklThumb: "https://img.example/stored.png",
      simklAccountType: "pro",
      simklMarkMoviesAsRewatched: false,
      simklMarkEpisodesAsRewatched: false,
    });

    const response = await request(app).get("/simkl/status").expect(200);

    expect(response.body).toEqual({
      linked: true,
      username: "stored-user",
      image: "https://img.example/stored.png",
      hasCredentials: true,
      needsReconnect: false,
      accountType: "pro",
      canTrackRewatches: true,
      markMoviesAsRewatched: false,
      markEpisodesAsRewatched: false,
    });
  });

  it("updates rewatch settings when linked and PRO", async () => {
    userRepositoryMocks.update.mockResolvedValue({
      id: "user-id",
      simklMarkMoviesAsRewatched: true,
      simklMarkEpisodesAsRewatched: false,
      simklAccountType: "pro",
    });

    const response = await request(app)
      .patch("/simkl/settings")
      .send({
        markMoviesAsRewatched: true,
        markEpisodesAsRewatched: false,
      })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      markMoviesAsRewatched: true,
      markEpisodesAsRewatched: false,
      accountType: "pro",
      canTrackRewatches: true,
    });
    expect(userRepositoryMocks.update).toHaveBeenCalledWith("user-id", {
      simklMarkMoviesAsRewatched: true,
      simklMarkEpisodesAsRewatched: false,
    });
  });

  it("disables rewatch settings without refreshing the plan", async () => {
    userRepositoryMocks.update.mockResolvedValue({
      id: "user-id",
      simklMarkMoviesAsRewatched: false,
      simklMarkEpisodesAsRewatched: false,
      simklAccountType: "vip",
    });

    const response = await request(app)
      .patch("/simkl/settings")
      .send({
        markMoviesAsRewatched: false,
        markEpisodesAsRewatched: false,
      })
      .expect(200);

    expect(simklTokenManagerMocks.getValidAccessToken).not.toHaveBeenCalled();
    expect(response.body).toEqual({
      success: true,
      markMoviesAsRewatched: false,
      markEpisodesAsRewatched: false,
      accountType: "vip",
      canTrackRewatches: true,
    });
  });

  it("returns null accountType when settings update has no cached plan", async () => {
    userRepositoryMocks.update.mockResolvedValue({
      id: "user-id",
      simklMarkMoviesAsRewatched: false,
      simklMarkEpisodesAsRewatched: false,
      simklAccountType: null,
    });

    const response = await request(app)
      .patch("/simkl/settings")
      .send({
        markMoviesAsRewatched: false,
        markEpisodesAsRewatched: false,
      })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      markMoviesAsRewatched: false,
      markEpisodesAsRewatched: false,
      accountType: null,
      canTrackRewatches: false,
    });
  });

  it("backfills account type on status when missing", async () => {
    userRepositoryMocks.findById
      .mockResolvedValueOnce({
        id: "user-id",
        plexUsername: "plex-user",
        simklClientId: getSimklClientId(),
        simklAccessToken: "simkl_at_official_token_value_here_",
        simklUsername: "stored-user",
        simklThumb: "https://img.example/stored.png",
        simklAccountType: null,
        simklMarkMoviesAsRewatched: false,
        simklMarkEpisodesAsRewatched: false,
      })
      .mockResolvedValueOnce({
        id: "user-id",
        plexUsername: "plex-user",
        simklClientId: getSimklClientId(),
        simklAccessToken: "simkl_at_official_token_value_here_",
        simklUsername: "stored-user",
        simklThumb: "https://img.example/stored.png",
        simklAccountType: "vip",
        simklMarkMoviesAsRewatched: false,
        simklMarkEpisodesAsRewatched: false,
      });
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "stored-user",
      image: "https://img.example/stored.png",
      accountType: "vip",
    });

    const response = await request(app).get("/simkl/status").expect(200);

    expect(simklTokenManagerMocks.getValidAccessToken).toHaveBeenCalledWith(
      "user-id"
    );
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({ simklAccountType: "vip" })
    );
    expect(response.body).toMatchObject({
      accountType: "vip",
      canTrackRewatches: true,
    });
  });

  it("rejects settings updates when Simkl is not linked", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      id: "user-id",
      simklAccessToken: null,
      simklClientId: null,
    });

    const response = await request(app)
      .patch("/simkl/settings")
      .send({
        markMoviesAsRewatched: true,
        markEpisodesAsRewatched: false,
      })
      .expect(400);

    expect(response.body).toEqual({
      error: "Link your Simkl account before changing sync settings",
    });
  });

  it("rejects settings updates when unauthenticated", async () => {
    authState.user = null;

    const response = await request(app)
      .patch("/simkl/settings")
      .send({
        markMoviesAsRewatched: false,
        markEpisodesAsRewatched: false,
      })
      .expect(401);

    expect(response.body.error).toBeTruthy();
  });

  it("rejects enabling rewatch settings for free-tier accounts", async () => {
    userRepositoryMocks.findById
      .mockResolvedValueOnce({
        id: "user-id",
        simklAccessToken: "simkl_at_token",
        simklClientId: getSimklClientId(),
        simklAccountType: "pro",
        simklMarkMoviesAsRewatched: true,
        simklMarkEpisodesAsRewatched: true,
      })
      .mockResolvedValueOnce({
        id: "user-id",
        simklAccessToken: "simkl_at_token",
        simklClientId: getSimklClientId(),
        simklAccountType: "free",
        simklMarkMoviesAsRewatched: false,
        simklMarkEpisodesAsRewatched: false,
      });
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "alice",
      image: null,
      accountType: "free",
    });

    const response = await request(app)
      .patch("/simkl/settings")
      .send({
        markMoviesAsRewatched: true,
        markEpisodesAsRewatched: true,
      })
      .expect(403);

    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        simklAccountType: "free",
        simklMarkMoviesAsRewatched: false,
        simklMarkEpisodesAsRewatched: false,
      })
    );
    expect(response.body).toEqual({
      error: "Rewatch tracking requires Simkl PRO or VIP",
      code: "simkl_pro_required",
      upgradeUrl: "https://simkl.com/vip/",
    });
  });

  it("returns 404 when the user disappears during a settings plan refresh", async () => {
    userRepositoryMocks.findById
      .mockResolvedValueOnce({
        id: "user-id",
        simklAccessToken: "simkl_at_token",
        simklClientId: getSimklClientId(),
        simklAccountType: "pro",
        simklMarkMoviesAsRewatched: false,
        simklMarkEpisodesAsRewatched: false,
      })
      .mockResolvedValueOnce(null);
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "alice",
      image: null,
      accountType: "pro",
    });

    const response = await request(app)
      .patch("/simkl/settings")
      .send({
        markMoviesAsRewatched: true,
        markEpisodesAsRewatched: false,
      })
      .expect(404);

    expect(response.body).toEqual({ error: "User not found" });
  });

  it("returns 404 when plan refresh update finds the user deleted", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      id: "user-id",
      simklAccessToken: "simkl_at_token",
      simklClientId: getSimklClientId(),
      simklAccountType: "pro",
      simklMarkMoviesAsRewatched: false,
      simklMarkEpisodesAsRewatched: false,
    });
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "alice",
      image: null,
      accountType: "vip",
    });
    userRepositoryMocks.update.mockRejectedValueOnce(
      new Error("User user-id not found")
    );

    const response = await request(app)
      .patch("/simkl/settings")
      .send({
        markMoviesAsRewatched: true,
        markEpisodesAsRewatched: false,
      })
      .expect(404);

    expect(response.body).toEqual({ error: "User not found" });
  });

  it("returns 500 when plan refresh fails for a non-missing-user reason", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      id: "user-id",
      simklAccessToken: "simkl_at_token",
      simklClientId: getSimklClientId(),
      simklAccountType: "pro",
      simklMarkMoviesAsRewatched: false,
      simklMarkEpisodesAsRewatched: false,
    });
    simklClientMocks.getUserProfile.mockRejectedValueOnce(
      new Error("Simkl profile down")
    );

    const response = await request(app)
      .patch("/simkl/settings")
      .send({
        markMoviesAsRewatched: true,
        markEpisodesAsRewatched: false,
      })
      .expect(500);

    expect(response.body).toEqual({
      error: "Failed to update Simkl settings",
    });
  });

  it("refreshes a cached free plan on status so upgrades become eligible", async () => {
    userRepositoryMocks.findById
      .mockResolvedValueOnce({
        id: "user-id",
        plexUsername: "plex-user",
        simklClientId: getSimklClientId(),
        simklAccessToken: "simkl_at_official_token_value_here_",
        simklUsername: "stored-user",
        simklThumb: "https://img.example/stored.png",
        simklAccountType: "free",
        simklMarkMoviesAsRewatched: false,
        simklMarkEpisodesAsRewatched: false,
      })
      .mockResolvedValueOnce({
        id: "user-id",
        plexUsername: "plex-user",
        simklClientId: getSimklClientId(),
        simklAccessToken: "simkl_at_official_token_value_here_",
        simklUsername: "stored-user",
        simklThumb: "https://img.example/stored.png",
        simklAccountType: "pro",
        simklMarkMoviesAsRewatched: false,
        simklMarkEpisodesAsRewatched: false,
      });
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "stored-user",
      image: "https://img.example/stored.png",
      accountType: "pro",
    });

    const response = await request(app).get("/simkl/status").expect(200);

    expect(simklTokenManagerMocks.getValidAccessToken).toHaveBeenCalledWith(
      "user-id"
    );
    expect(response.body).toMatchObject({
      accountType: "pro",
      canTrackRewatches: true,
    });
  });

  it("rejects invalid Simkl settings payloads", async () => {
    const response = await request(app)
      .patch("/simkl/settings")
      .send({ markMoviesAsRewatched: "yes" })
      .expect(400);

    expect(response.body.error).toBe("Validation error");
  });

  it("returns 500 when saving Simkl settings fails", async () => {
    userRepositoryMocks.update.mockRejectedValueOnce(new Error("db down"));

    const response = await request(app)
      .patch("/simkl/settings")
      .send({
        markMoviesAsRewatched: false,
        markEpisodesAsRewatched: false,
      })
      .expect(500);

    expect(response.body).toEqual({
      error: "Failed to update Simkl settings",
    });
  });

  it("continues status when account-type backfill fails", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      id: "user-id",
      plexUsername: "plex-user",
      simklClientId: getSimklClientId(),
      simklAccessToken: "simkl_at_official_token_value_here_",
      simklUsername: "stored-user",
      simklThumb: null,
      simklAccountType: null,
      simklMarkMoviesAsRewatched: false,
      simklMarkEpisodesAsRewatched: false,
    });
    simklTokenManagerMocks.getValidAccessToken.mockRejectedValueOnce(
      new Error("token down")
    );

    const response = await request(app).get("/simkl/status").expect(200);

    expect(response.body).toMatchObject({
      linked: true,
      accountType: null,
      canTrackRewatches: false,
    });
  });

  it("refreshAndStoreSimklAccountType returns null without a client id", async () => {
    await expect(
      refreshAndStoreSimklAccountType(
        { id: "user-id", simklClientId: null } as never,
        "token"
      )
    ).resolves.toBeNull();
    expect(simklClientMocks.getUserProfile).not.toHaveBeenCalled();
  });

  it("returns and refreshes Simkl profile details", async () => {
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "fresh-user",
      image: "https://img.example/fresh.png",
      accountType: "pro",
    });

    const response = await request(app).get("/simkl/profile").expect(200);

    expect(simklTokenManagerMocks.getValidAccessToken).toHaveBeenCalledWith(
      "user-id"
    );
    expect(userRepositoryMocks.update).toHaveBeenCalledWith("user-id", {
      simklUsername: "fresh-user",
      simklThumb: "https://img.example/fresh.png",
    });
    expect(response.body).toEqual({
      id: 51,
      username: "fresh-user",
      image: "https://img.example/fresh.png",
      accountType: "pro",
    });
  });

  it("clears rewatch toggles when profile refresh finds a free plan", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      id: "user-id",
      plexUsername: "plex-user",
      simklClientId: "stored-client-id",
      simklAccessToken: "stored-access-token",
      simklUsername: "stored-user",
      simklThumb: "https://img.example/stored.png",
      simklAccountType: "pro",
      simklMarkMoviesAsRewatched: true,
      simklMarkEpisodesAsRewatched: true,
    });
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "stored-user",
      image: "https://img.example/stored.png",
      accountType: "free",
    });

    const response = await request(app).get("/simkl/profile").expect(200);

    expect(userRepositoryMocks.update).toHaveBeenCalledWith("user-id", {
      simklAccountType: "free",
      simklMarkMoviesAsRewatched: false,
      simklMarkEpisodesAsRewatched: false,
    });
    expect(response.body.accountType).toBe("free");
  });

  it("rejects profile requests when Simkl is not linked", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      id: "user-id",
      plexUsername: "plex-user",
      simklAccessToken: null,
      simklClientId: "stored-client-id",
    });

    const response = await request(app).get("/simkl/profile").expect(400);

    expect(response.body).toEqual({ error: "Simkl account not linked" });
    expect(simklTokenManagerMocks.getValidAccessToken).not.toHaveBeenCalled();
  });

  it("returns 500 when PIN authorization fails", async () => {
    simklOAuthMocks.requestPinCode.mockRejectedValue(new Error("Simkl down"));

    const response = await request(app).get("/simkl/authorize").expect(500);

    expect(response.body).toEqual({ error: "Simkl down" });
  });

  it("returns 500 for unexpected link failures", async () => {
    simklDeviceStoreMocks.resolveSimklDeviceCode.mockReturnValue("device-code");
    simklOAuthMocks.exchangePinForToken.mockRejectedValue(
      new Error("Server error")
    );

    const response = await request(app)
      .post("/simkl/link")
      .send({ userCode: "BDWP-HQPK" })
      .expect(500);

    expect(response.body).toEqual({ error: "Server error" });
  });

  it("returns 500 when unlink fails", async () => {
    userRepositoryMocks.update.mockRejectedValueOnce(new Error("db down"));

    const response = await request(app).post("/simkl/unlink").expect(500);

    expect(response.body).toEqual({ error: "db down" });
  });

  it("returns 500 when status lookup fails", async () => {
    userRepositoryMocks.findById.mockRejectedValueOnce(new Error("db down"));

    const response = await request(app).get("/simkl/status").expect(500);

    expect(response.body).toEqual({ error: "db down" });
  });

  it("returns profile details without updating unchanged stored values", async () => {
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "stored-user",
      image: "https://img.example/stored.png",
      accountType: "pro",
    });

    const response = await request(app).get("/simkl/profile").expect(200);

    expect(userRepositoryMocks.update).not.toHaveBeenCalled();
    expect(response.body).toEqual({
      id: 51,
      username: "stored-user",
      image: "https://img.example/stored.png",
      accountType: "pro",
    });
  });

  it("returns 500 when profile refresh fails", async () => {
    simklClientMocks.getUserProfile.mockRejectedValue(
      new Error("profile down")
    );

    const response = await request(app).get("/simkl/profile").expect(500);

    expect(response.body).toEqual({ error: "profile down" });
  });

  it("returns 401 when the authenticated user is missing", async () => {
    authState.user = null;

    const response = await request(app).get("/simkl/authorize").expect(401);

    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when the authorize user no longer exists", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce(null);

    const response = await request(app).get("/simkl/authorize").expect(401);

    expect(response.body).toEqual({ error: "User not found" });
  });

  it("returns 401 when the link user no longer exists", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce(null);

    const response = await request(app)
      .post("/simkl/link")
      .send({ userCode: "ABCDE" })
      .expect(401);

    expect(response.body).toEqual({ error: "User not found" });
  });

  it("returns 401 when unlinking without an authenticated user", async () => {
    authState.user = null;

    const response = await request(app).post("/simkl/unlink").expect(401);

    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when status user no longer exists", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce(null);

    const response = await request(app).get("/simkl/status").expect(401);

    expect(response.body).toEqual({ error: "User not found" });
  });

  it("returns 401 when profile user no longer exists", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce(null);

    const response = await request(app).get("/simkl/profile").expect(401);

    expect(response.body).toEqual({ error: "User not found" });
  });

  it("returns a generic authorize error for non-Error failures", async () => {
    simklOAuthMocks.requestPinCode.mockRejectedValue("boom");

    const response = await request(app).get("/simkl/authorize").expect(500);

    expect(response.body).toEqual({
      error: "Failed to get Simkl authorization URL",
    });
  });

  it("returns a generic unlink error for non-Error failures", async () => {
    userRepositoryMocks.update.mockRejectedValueOnce("boom");

    const response = await request(app).post("/simkl/unlink").expect(500);

    expect(response.body).toEqual({ error: "Failed to unlink Simkl account" });
  });

  it("returns a generic status error for non-Error failures", async () => {
    userRepositoryMocks.findById.mockRejectedValueOnce("boom");

    const response = await request(app).get("/simkl/status").expect(500);

    expect(response.body).toEqual({ error: "Failed to get Simkl status" });
  });

  it("unlinks using jellyfin username when plex username is absent", async () => {
    authState.user = {
      id: "user-id",
      jellyfinUsername: "jf-user",
    };

    const response = await request(app).post("/simkl/unlink").expect(200);

    expect(response.body).toEqual({ success: true });
  });

  it("links when profile fields are empty strings", async () => {
    simklDeviceStoreMocks.resolveSimklDeviceCode.mockReturnValue("device-code");
    simklOAuthMocks.exchangePinForToken.mockResolvedValue({
      accessToken: "simkl_at_new",
      refreshToken: "simkl_rt_new",
      expiresAt: 1_700_000_000_000,
    });
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "",
      image: "",
    });
    userRepositoryMocks.findById.mockResolvedValueOnce({
      id: "user-id",
      plexUsername: null,
      jellyfinUsername: "jf-user",
      simklClientId: "stored-client-id",
    });

    const response = await request(app)
      .post("/simkl/link")
      .send({ userCode: "BDWP-HQPK" })
      .expect(200);

    expect(response.body).toEqual({ success: true });
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        simklAccessToken: "simkl_at_new",
        simklUsername: undefined,
        simklThumb: undefined,
      })
    );
  });

  it("returns a generic link error for non-Error failures", async () => {
    simklDeviceStoreMocks.resolveSimklDeviceCode.mockReturnValue("device-code");
    simklOAuthMocks.exchangePinForToken.mockRejectedValue("boom");

    const response = await request(app)
      .post("/simkl/link")
      .send({ userCode: "BDWP-HQPK" })
      .expect(500);

    expect(response.body).toEqual({ error: "Failed to link Simkl account" });
  });

  it("returns null status fields when unset", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      id: "user-id",
      plexUsername: "plex-user",
      simklAccessToken: null,
      simklUsername: null,
      simklThumb: null,
      simklClientId: null,
    });

    const response = await request(app).get("/simkl/status").expect(200);

    expect(response.body).toEqual({
      linked: false,
      username: null,
      image: null,
      hasCredentials: true,
      needsReconnect: false,
      accountType: null,
      canTrackRewatches: false,
      markMoviesAsRewatched: false,
      markEpisodesAsRewatched: false,
    });
  });

  it("returns stored profile fields when refresh omits them", async () => {
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "",
      image: "",
      accountType: "pro",
    });

    const response = await request(app).get("/simkl/profile").expect(200);

    expect(response.body).toEqual({
      id: 51,
      username: "stored-user",
      image: "https://img.example/stored.png",
      accountType: "pro",
    });
  });

  it("returns null profile fields when refresh and storage both omit them", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      id: "user-id",
      plexUsername: "plex-user",
      simklAccessToken: "stored-access-token",
      simklClientId: "stored-client-id",
      simklUsername: null,
      simklThumb: null,
      simklAccountType: null,
    });
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "",
      image: "",
      accountType: null,
    });

    const response = await request(app).get("/simkl/profile").expect(200);

    expect(response.body).toEqual({
      id: 51,
      username: null,
      image: null,
      accountType: null,
    });
  });

  it("returns a generic profile error for non-Error failures", async () => {
    simklClientMocks.getUserProfile.mockRejectedValue("boom");

    const response = await request(app).get("/simkl/profile").expect(500);

    expect(response.body).toEqual({ error: "Failed to get Simkl profile" });
  });
});
