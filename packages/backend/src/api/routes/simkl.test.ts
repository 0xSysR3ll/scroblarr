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

import { simklRoutes } from "./simkl";

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

  it("requires a client ID when requesting authorization", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      id: "user-id",
      plexUsername: "plex-user",
      simklClientId: null,
    });

    const response = await request(app).get("/simkl/authorize").expect(400);

    expect(response.body.error).toContain("Simkl client ID is required");
    expect(simklOAuthMocks.requestPinCode).not.toHaveBeenCalled();
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
      })
    );
  });

  it("stores a provided client ID when linking", async () => {
    simklDeviceStoreMocks.resolveSimklDeviceCode.mockReturnValue("device-code");
    simklOAuthMocks.exchangePinForToken.mockResolvedValue({
      accessToken: "simkl_at_new",
      refreshToken: "simkl_rt_new",
      expiresAt: 1_700_000_000_000,
    });
    simklClientMocks.getUserProfile.mockRejectedValue(
      new Error("profile down")
    );

    await request(app)
      .post("/simkl/link")
      .send({ userCode: "BDWP-HQPK", clientId: "provided-client-id" })
      .expect(200);

    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        simklAccessToken: "simkl_at_new",
        simklClientId: "provided-client-id",
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
    });
  });

  it("returns and refreshes Simkl profile details", async () => {
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "fresh-user",
      image: "https://img.example/fresh.png",
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
    });
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

  it("requires a client ID when linking without stored credentials", async () => {
    userRepositoryMocks.findById.mockResolvedValueOnce({
      id: "user-id",
      plexUsername: "plex-user",
      simklClientId: null,
    });

    const response = await request(app)
      .post("/simkl/link")
      .send({ userCode: "ABCDE" })
      .expect(400);

    expect(response.body.error).toContain("Simkl client ID is required");
    expect(simklOAuthMocks.exchangePinForToken).not.toHaveBeenCalled();
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
    });

    const response = await request(app).get("/simkl/profile").expect(200);

    expect(userRepositoryMocks.update).not.toHaveBeenCalled();
    expect(response.body).toEqual({
      id: 51,
      username: "stored-user",
      image: "https://img.example/stored.png",
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

  it("returns validation errors for invalid authorize query values", async () => {
    const response = await request(app)
      .get("/simkl/authorize?clientId=a&clientId=b")
      .expect(400);

    expect(response.body.error).toBe("Validation error");
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
      hasCredentials: false,
    });
  });

  it("returns stored profile fields when refresh omits them", async () => {
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "",
      image: "",
    });

    const response = await request(app).get("/simkl/profile").expect(200);

    expect(response.body).toEqual({
      id: 51,
      username: "stored-user",
      image: "https://img.example/stored.png",
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
    });
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "",
      image: "",
    });

    const response = await request(app).get("/simkl/profile").expect(200);

    expect(response.body).toEqual({
      id: 51,
      username: null,
      image: null,
    });
  });

  it("returns a generic profile error for non-Error failures", async () => {
    simklClientMocks.getUserProfile.mockRejectedValue("boom");

    const response = await request(app).get("/simkl/profile").expect(500);

    expect(response.body).toEqual({ error: "Failed to get Simkl profile" });
  });
});
