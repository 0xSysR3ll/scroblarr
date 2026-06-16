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
}));

const simklClientMocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
}));

const simklTokenManagerMocks = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
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

vi.mock("@integrations/simkl/SimklOAuth", () => ({
  SimklOAuth: class {
    requestPinCode = simklOAuthMocks.requestPinCode;
    exchangePinForToken = simklOAuthMocks.exchangePinForToken;
  },
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
      user_code: "ABCDE",
      verification_url: "https://simkl.com/pin/",
      expires_in: 900,
      interval: 5,
    });

    const response = await request(app).get("/simkl/authorize").expect(200);

    expect(response.body).toEqual({
      userCode: "ABCDE",
      verificationUrl: "https://simkl.com/pin/",
      expiresIn: 900,
      interval: 5,
    });
    expect(simklOAuthMocks.requestPinCode).toHaveBeenCalledOnce();
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
    simklOAuthMocks.exchangePinForToken.mockResolvedValue({
      accessToken: "new-access-token",
    });
    simklClientMocks.getUserProfile.mockResolvedValue({
      id: 51,
      username: "alice",
      image: "https://img.example/alice.png",
    });

    const response = await request(app)
      .post("/simkl/link")
      .send({ userCode: "ABCDE" })
      .expect(200);

    expect(response.body).toEqual({ success: true });
    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        simklAccessToken: "new-access-token",
        simklUsername: "alice",
        simklThumb: "https://img.example/alice.png",
      })
    );
  });

  it("stores a provided client ID when linking", async () => {
    simklOAuthMocks.exchangePinForToken.mockResolvedValue({
      accessToken: "new-access-token",
    });
    simklClientMocks.getUserProfile.mockRejectedValue(
      new Error("profile down")
    );

    await request(app)
      .post("/simkl/link")
      .send({ userCode: "ABCDE", clientId: "provided-client-id" })
      .expect(200);

    expect(userRepositoryMocks.update).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        simklAccessToken: "new-access-token",
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
    simklOAuthMocks.exchangePinForToken.mockRejectedValue(
      new Error("Authorization pending")
    );

    const response = await request(app)
      .post("/simkl/link")
      .send({ userCode: "ABCDE" })
      .expect(400);

    expect(response.body).toEqual({ error: "Authorization pending" });
  });

  it("unlinks a Simkl account", async () => {
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
    simklOAuthMocks.exchangePinForToken.mockRejectedValue(
      new Error("Server error")
    );

    const response = await request(app)
      .post("/simkl/link")
      .send({ userCode: "ABCDE" })
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
});
