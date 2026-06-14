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
    getValidAccessToken = vi.fn().mockResolvedValue("access-token");
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
});
